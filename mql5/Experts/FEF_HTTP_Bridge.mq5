//+------------------------------------------------------------------+
//|                                           FEF_HTTP_Bridge.mq5    |
//|                         FEF TRADING SOLUTIONS                    |
//|                   Institutional AI Cockpit & Risk Tools          |
//+------------------------------------------------------------------+
#property copyright   "FEF Trading Solutions"
#property link        "https://feftradingsolutions.com"
#property version     "1.21"
#property description "Native HTTP WebRequest Telemetry Bridge for FEF Trading Solutions"
#property description "Communicates with 127.0.0.1:5556 via MQL5 WebRequest()"
#property description "Strictly READ-ONLY — Zero DLL imports — 100% macOS / Wine Compatible"
#property strict

//--- Input Parameters (Only necessary parameters)
input group "=== Bridge HTTP Configuration ==="
input string   InpBridgeBaseUrl     = "http://127.0.0.1:5556";     // Bridge HTTP Base URL
input string   InpAuthToken         = "fef_local_bridge_token_v1"; // Bridge Authentication Token
input ulong    InpMagicNumber       = 8882026;                     // FEF Magic Number
input int      InpHeartbeatSeconds  = 2;                           // Heartbeat Cadence (Seconds)

//--- Hardcoded Operating State (No Execution Mode Enum — Strict Read-Only)
#define OPERATING_MODE "READ_ONLY"

//--- Telemetry Timing State
datetime g_last_heartbeat_time = 0;
datetime g_last_account_time   = 0;
datetime g_last_quotes_time    = 0;
datetime g_last_positions_time = 0;
datetime g_last_orders_time    = 0;
datetime g_last_symbols_time   = 0;
bool     g_bridge_connected    = false;

//--- Tracked symbols for quote telemetry
string g_tracked_canonical[] = {
   "XAUUSD", "XAGUSD", "EURUSD", "GBPUSD", "USDJPY",
   "US30", "US100", "US500", "USOIL", "BTCUSD", "ETHUSD"
};

//+------------------------------------------------------------------+
//| Helper: Format Masked Account Number                             |
//+------------------------------------------------------------------+
string GetMaskedAccount()
{
   long login = AccountInfoInteger(ACCOUNT_LOGIN);
   string s = IntegerToString(login);
   int len = StringLen(s);
   if(len <= 4) return s;
   string prefix = StringSubstr(s, 0, 2);
   string suffix = StringSubstr(s, len - 2, 2);
   return prefix + "***" + suffix;
}

//+------------------------------------------------------------------+
//| Helper: Escape JSON Strings Safely                               |
//+------------------------------------------------------------------+
string JsonEscape(string text)
{
   StringReplace(text, "\\", "\\\\");
   StringReplace(text, "\"", "\\\"");
   StringReplace(text, "\r", "");
   StringReplace(text, "\n", "\\n");
   StringReplace(text, "\t", " ");
   return text;
}

//+------------------------------------------------------------------+
//| Helper: Describe WebRequest Error Codes                          |
//+------------------------------------------------------------------+
string DescribeWebRequestError(int err)
{
   switch(err)
   {
      case 4014: return "ERR_FUNCTION_NOT_ALLOWED: WebRequest not allowed. Add " + InpBridgeBaseUrl + " to Tools->Options->Expert Advisors->Allow WebRequest";
      case 5203: return "ERR_WEBREQUEST_CONNECT_FAILED: Cannot connect to " + InpBridgeBaseUrl + ". Verify node scripts/mt5-http-bridge-service.js is running.";
      case 5200: return "ERR_WEBREQUEST_INVALID_ADDRESS: Invalid URL.";
      case 5201: return "ERR_WEBREQUEST_CONNECT_FAILED: Timeout or connection error.";
      default:   return "MQL5 Error " + IntegerToString(err);
   }
}

//+------------------------------------------------------------------+
//| Native WebRequest HTTP Dispatcher (Null-Terminator Stripped)     |
//+------------------------------------------------------------------+
int PostJson(string endpoint, string jsonPayload, string &responseString)
{
   string url = InpBridgeBaseUrl + endpoint;
   string headers = "Content-Type: application/json\r\n";
   if(StringLen(InpAuthToken) > 0)
   {
      headers += "Authorization: Bearer " + InpAuthToken + "\r\n";
      headers += "x-bridge-token: " + InpAuthToken + "\r\n";
   }

   // 1. Convert string to UTF-8 char array
   char postData[];
   int bytes = StringToCharArray(jsonPayload, postData, 0, WHOLE_ARRAY, CP_UTF8);

   // 2. CRITICAL FIX: StringToCharArray always appends a terminating null byte (0x00).
   // If WebRequest transmits the null byte, JSON.parse() in Node throws SyntaxError.
   // We explicitly resize postData to omit the trailing null byte.
   if(bytes > 0 && postData[bytes - 1] == 0)
   {
      ArrayResize(postData, bytes - 1);
   }

   int jsonChars = StringLen(jsonPayload);
   int httpBytes = ArraySize(postData);

   // Diagnostic logging
   Print("[FEF-HTTP] endpoint=", endpoint);
   Print("[FEF-HTTP] JSON chars=", jsonChars, " | HTTP bytes=", httpBytes);

   char resultData[];
   string resultHeaders = "";

   ResetLastError();
   int httpStatus = WebRequest("POST", url, headers, 2000, postData, resultData, resultHeaders);

   if(httpStatus == -1)
   {
      int err = GetLastError();
      Print("[FEF-HTTP] Request failed to ", endpoint, " | LastError=", err, " (", DescribeWebRequestError(err), ")");
      g_bridge_connected = false;
      return -1;
   }

   responseString = CharArrayToString(resultData, 0, WHOLE_ARRAY, CP_UTF8);

   if(httpStatus >= 200 && httpStatus < 300)
   {
      if(!g_bridge_connected)
      {
         Print("[FEF-HTTP] Bridge connected: HTTP ", httpStatus, " on ", endpoint);
         g_bridge_connected = true;
      }
      Print("[FEF-HTTP] Response status: ", httpStatus, " on ", endpoint);
   }
   else
   {
      Print("[FEF-HTTP] HTTP status=", httpStatus, " on ", endpoint, " | Response: ", responseString);
      if(httpStatus == 401 || httpStatus == 403)
      {
         Print("✕ [FEF-HTTP] Authentication failed! Check InpAuthToken.");
      }
      g_bridge_connected = false;
   }

   return httpStatus;
}

//+------------------------------------------------------------------+
//| Dynamic Broker Symbol Resolver                                   |
//+------------------------------------------------------------------+
string ResolveBrokerSymbol(string canonical)
{
   if(SymbolSelect(canonical, true)) return canonical;

   // Common broker suffix/prefix variants (Exness Standard, Raw, Zero, Mini)
   string candidates[];
   ArrayResize(candidates, 10);
   candidates[0] = canonical + "m";
   candidates[1] = canonical + ".a";
   candidates[2] = canonical + "c";
   candidates[3] = canonical + ".r";
   candidates[4] = canonical + "_i";
   candidates[5] = canonical + "pro";
   candidates[6] = canonical + "k";
   candidates[7] = canonical + "z";
   candidates[8] = "m" + canonical;
   candidates[9] = canonical;

   for(int i = 0; i < ArraySize(candidates); i++)
   {
      if(SymbolSelect(candidates[i], true))
      {
         return candidates[i];
      }
   }

   // Search through Market Watch
   int total = SymbolsTotal(true);
   for(int i = 0; i < total; i++)
   {
      string name = SymbolName(i, true);
      if(StringFind(name, canonical) >= 0)
      {
         return name;
      }
   }

   return canonical;
}

//+------------------------------------------------------------------+
//| Push Heartbeat (POST /mt5/heartbeat)                             |
//+------------------------------------------------------------------+
void PushHeartbeat()
{
   string json = "{";
   json += "\"terminalBuild\":" + IntegerToString(TerminalInfoInteger(TERMINAL_BUILD)) + ",";
   json += "\"accountLogin\":\"" + GetMaskedAccount() + "\",";
   json += "\"broker\":\"" + JsonEscape(AccountInfoString(ACCOUNT_COMPANY)) + "\",";
   json += "\"server\":\"" + JsonEscape(AccountInfoString(ACCOUNT_SERVER)) + "\",";
   json += "\"accountCurrency\":\"" + AccountInfoString(ACCOUNT_CURRENCY) + "\",";
   json += "\"magic\":" + IntegerToString(InpMagicNumber) + ",";
   json += "\"operatingMode\":\"" + OPERATING_MODE + "\",";
   json += "\"terminalConnected\":" + (TerminalInfoInteger(TERMINAL_CONNECTED) ? "true" : "false") + ",";
   json += "\"timestamp\":" + IntegerToString((long)TimeLocal() * 1000);
   json += "}";

   string resp = "";
   PostJson("/mt5/heartbeat", json, resp);
}

//+------------------------------------------------------------------+
//| Push Account Telemetry (POST /mt5/account)                       |
//+------------------------------------------------------------------+
void PushAccount()
{
   ENUM_ACCOUNT_TRADE_MODE tradeMode = (ENUM_ACCOUNT_TRADE_MODE)AccountInfoInteger(ACCOUNT_TRADE_MODE);
   string modeStr = (tradeMode == ACCOUNT_TRADE_MODE_REAL) ? "REAL" : "DEMO";

   double balance     = AccountInfoDouble(ACCOUNT_BALANCE);
   double equity      = AccountInfoDouble(ACCOUNT_EQUITY);
   double margin      = AccountInfoDouble(ACCOUNT_MARGIN);
   double freeMargin  = AccountInfoDouble(ACCOUNT_MARGIN_FREE);
   double marginLevel = AccountInfoDouble(ACCOUNT_MARGIN_LEVEL);
   long   leverage    = AccountInfoInteger(ACCOUNT_LEVERAGE);
   bool   tradeAllowed= (bool)AccountInfoInteger(ACCOUNT_TRADE_ALLOWED);

   string json = "{";
   json += "\"maskedLogin\":\"" + GetMaskedAccount() + "\",";
   json += "\"broker\":\"" + JsonEscape(AccountInfoString(ACCOUNT_COMPANY)) + "\",";
   json += "\"server\":\"" + JsonEscape(AccountInfoString(ACCOUNT_SERVER)) + "\",";
   json += "\"currency\":\"" + AccountInfoString(ACCOUNT_CURRENCY) + "\",";
   json += "\"tradeMode\":\"" + modeStr + "\",";
   json += "\"balance\":" + DoubleToString(balance, 2) + ",";
   json += "\"equity\":" + DoubleToString(equity, 2) + ",";
   json += "\"margin\":" + DoubleToString(margin, 2) + ",";
   json += "\"freeMargin\":" + DoubleToString(freeMargin, 2) + ",";
   json += "\"marginLevel\":" + DoubleToString(marginLevel, 2) + ",";
   json += "\"leverage\":" + IntegerToString(leverage) + ",";
   json += "\"tradeAllowed\":" + (tradeAllowed ? "true" : "false") + ",";
   json += "\"terminalBuild\":" + IntegerToString(TerminalInfoInteger(TERMINAL_BUILD)) + ",";
   json += "\"operatingMode\":\"" + OPERATING_MODE + "\",";
   json += "\"timestamp\":" + IntegerToString((long)TimeLocal() * 1000);
   json += "}";

   string resp = "";
   PostJson("/mt5/account", json, resp);
}

//+------------------------------------------------------------------+
//| Push Quote Telemetry (POST /mt5/quote)                           |
//+------------------------------------------------------------------+
void PushQuotes()
{
   int count = ArraySize(g_tracked_canonical);
   string quotesJson = "[";

   int added = 0;
   for(int i = 0; i < count; i++)
   {
      string canonical = g_tracked_canonical[i];
      string brokerSym = ResolveBrokerSymbol(canonical);

      MqlTick tick;
      if(SymbolInfoTick(brokerSym, tick))
      {
         int digits = (int)SymbolInfoInteger(brokerSym, SYMBOL_DIGITS);
         double point = SymbolInfoDouble(brokerSym, SYMBOL_POINT);
         double spread = (point > 0) ? (tick.ask - tick.bid) / point : 0;

         if(added > 0) quotesJson += ",";
         quotesJson += "{";
         quotesJson += "\"canonicalSymbol\":\"" + canonical + "\",";
         quotesJson += "\"brokerSymbol\":\"" + brokerSym + "\",";
         quotesJson += "\"bid\":" + DoubleToString(tick.bid, digits) + ",";
         quotesJson += "\"ask\":" + DoubleToString(tick.ask, digits) + ",";
         quotesJson += "\"spread\":" + DoubleToString(spread, 1) + ",";
         quotesJson += "\"digits\":" + IntegerToString(digits) + ",";
         quotesJson += "\"point\":" + DoubleToString(point, digits) + ",";
         quotesJson += "\"time\":\"" + TimeToString(tick.time, TIME_SECONDS) + "\",";
         quotesJson += "\"timestamp\":" + IntegerToString((long)tick.time * 1000);
         quotesJson += "}";
         added++;
      }
   }
   quotesJson += "]";

   string json = "{\"quotes\":" + quotesJson + ",\"timestamp\":" + IntegerToString((long)TimeLocal() * 1000) + "}";
   string resp = "";
   PostJson("/mt5/quote", json, resp);
}

//+------------------------------------------------------------------+
//| Push Open Positions (POST /mt5/positions)                        |
//+------------------------------------------------------------------+
void PushPositions()
{
   int total = PositionsTotal();
   string posJson = "[";
   int validCount = 0;

   for(int i = 0; i < total; i++)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket > 0)
      {
         string sym   = PositionGetString(POSITION_SYMBOL);
         int type     = (int)PositionGetInteger(POSITION_TYPE);
         double lots  = PositionGetDouble(POSITION_VOLUME);
         double openP = PositionGetDouble(POSITION_PRICE_OPEN);
         double curP  = PositionGetDouble(POSITION_PRICE_CURRENT);
         double sl    = PositionGetDouble(POSITION_SL);
         double tp    = PositionGetDouble(POSITION_TP);
         double pnl   = PositionGetDouble(POSITION_PROFIT);
         double swap  = PositionGetDouble(POSITION_SWAP);
         long magic   = PositionGetInteger(POSITION_MAGIC);
         datetime ot  = (datetime)PositionGetInteger(POSITION_TIME);

         if(validCount > 0) posJson += ",";
         posJson += "{";
         posJson += "\"ticket\":" + IntegerToString(ticket) + ",";
         posJson += "\"brokerSymbol\":\"" + sym + "\",";
         posJson += "\"direction\":\"" + ((type == POSITION_TYPE_BUY) ? "BUY" : "SELL") + "\",";
         posJson += "\"volume\":" + DoubleToString(lots, 2) + ",";
         posJson += "\"openPrice\":" + DoubleToString(openP, 5) + ",";
         posJson += "\"currentPrice\":" + DoubleToString(curP, 5) + ",";
         posJson += "\"sl\":" + DoubleToString(sl, 5) + ",";
         posJson += "\"tp\":" + DoubleToString(tp, 5) + ",";
         posJson += "\"profit\":" + DoubleToString(pnl, 2) + ",";
         posJson += "\"swap\":" + DoubleToString(swap, 2) + ",";
         posJson += "\"magic\":" + IntegerToString(magic) + ",";
         posJson += "\"openTime\":\"" + TimeToString(ot, TIME_DATE|TIME_SECONDS) + "\"";
         posJson += "}";
         validCount++;
      }
   }
   posJson += "]";

   string json = "{\"positions\":" + posJson + ",\"timestamp\":" + IntegerToString((long)TimeLocal() * 1000) + "}";
   string resp = "";
   PostJson("/mt5/positions", json, resp);
}

//+------------------------------------------------------------------+
//| Push Pending Orders (POST /mt5/pending-orders)                   |
//+------------------------------------------------------------------+
void PushPendingOrders()
{
   int total = OrdersTotal();
   string ordJson = "[";
   int validCount = 0;

   for(int i = 0; i < total; i++)
   {
      ulong ticket = OrderGetTicket(i);
      if(ticket > 0)
      {
         string sym   = OrderGetString(ORDER_SYMBOL);
         ENUM_ORDER_TYPE orderType = (ENUM_ORDER_TYPE)OrderGetInteger(ORDER_TYPE);
         double lots  = OrderGetDouble(ORDER_VOLUME_CURRENT);
         double price = OrderGetDouble(ORDER_PRICE_OPEN);
         double sl    = OrderGetDouble(ORDER_SL);
         double tp    = OrderGetDouble(ORDER_TP);
         datetime exp = (datetime)OrderGetInteger(ORDER_TIME_EXPIRATION);
         long magic   = OrderGetInteger(ORDER_MAGIC);
         datetime ot  = (datetime)OrderGetInteger(ORDER_TIME_SETUP);

         string typeStr = "BUY_LIMIT";
         if(orderType == ORDER_TYPE_SELL_LIMIT) typeStr = "SELL_LIMIT";
         if(orderType == ORDER_TYPE_BUY_STOP)   typeStr = "BUY_STOP";
         if(orderType == ORDER_TYPE_SELL_STOP)  typeStr = "SELL_STOP";

         if(validCount > 0) ordJson += ",";
         ordJson += "{";
         ordJson += "\"ticket\":" + IntegerToString(ticket) + ",";
         ordJson += "\"symbol\":\"" + sym + "\",";
         ordJson += "\"type\":\"" + typeStr + "\",";
         ordJson += "\"volume\":" + DoubleToString(lots, 2) + ",";
         ordJson += "\"price\":" + DoubleToString(price, 5) + ",";
         ordJson += "\"sl\":" + DoubleToString(sl, 5) + ",";
         ordJson += "\"tp\":" + DoubleToString(tp, 5) + ",";
         ordJson += "\"expiration\":\"" + ((exp > 0) ? TimeToString(exp, TIME_DATE|TIME_SECONDS) : "GTC") + "\",";
         ordJson += "\"magic\":" + IntegerToString(magic) + ",";
         ordJson += "\"creationTime\":\"" + TimeToString(ot, TIME_DATE|TIME_SECONDS) + "\"";
         ordJson += "}";
         validCount++;
      }
   }
   ordJson += "]";

   string json = "{\"orders\":" + ordJson + ",\"timestamp\":" + IntegerToString((long)TimeLocal() * 1000) + "}";
   string resp = "";
   PostJson("/mt5/pending-orders", json, resp);
}

//+------------------------------------------------------------------+
//| Push Discovered Symbols & Session Metadata                       |
//+------------------------------------------------------------------+
void PushSymbolsAndSessions()
{
   int total = SymbolsTotal(true);
   string symJson = "[";
   int count = MathMin(total, 60);

   for(int i = 0; i < count; i++)
   {
      string sym = SymbolName(i, true);
      if(i > 0) symJson += ",";
      symJson += "\"" + sym + "\"";
   }
   symJson += "]";

   string json = "{\"symbols\":" + symJson + ",\"timestamp\":" + IntegerToString((long)TimeLocal() * 1000) + "}";
   string resp = "";
   PostJson("/mt5/symbols", json, resp);

   // Push session info for current chart symbol
   string mainSym = _Symbol;
   datetime from = 0, to = 0;
   MqlDateTime dt;
   TimeToStruct(TimeCurrent(), dt);
   ENUM_DAY_OF_WEEK day = (ENUM_DAY_OF_WEEK)dt.day_of_week;

   bool sessionFound = SymbolInfoSessionTrade(mainSym, day, 0, from, to);
   ENUM_SYMBOL_TRADE_MODE tradeMode = (ENUM_SYMBOL_TRADE_MODE)SymbolInfoInteger(mainSym, SYMBOL_TRADE_MODE);
   string tradeModeStr = (tradeMode == SYMBOL_TRADE_MODE_FULL) ? "FULL" : (tradeMode == SYMBOL_TRADE_MODE_CLOSEONLY) ? "CLOSE_ONLY" : "DISABLED";

   string sessJson = "{";
   sessJson += "\"brokerSymbol\":\"" + mainSym + "\",";
   sessJson += "\"tradeMode\":\"" + tradeModeStr + "\",";
   sessJson += "\"sessionStart\":\"" + (sessionFound ? TimeToString(from, TIME_SECONDS) : "00:00:00") + "\",";
   sessJson += "\"sessionEnd\":\"" + (sessionFound ? TimeToString(to, TIME_SECONDS) : "23:59:59") + "\",";
   sessJson += "\"serverTime\":\"" + TimeToString(TimeCurrent(), TIME_DATE|TIME_SECONDS) + "\",";
   sessJson += "\"marketAvailable\":" + ((tradeMode == SYMBOL_TRADE_MODE_FULL && TerminalInfoInteger(TERMINAL_CONNECTED) > 0) ? "true" : "false");
   sessJson += "}";

   string sessPayload = "{\"session\":" + sessJson + ",\"timestamp\":" + IntegerToString((long)TimeLocal() * 1000) + "}";
   PostJson("/mt5/session-info", sessPayload, resp);
}

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   Print("=== [FEF-HTTP] FEF TRADING SOLUTIONS HTTP BRIDGE EA INITIALIZING ===");
   Print("[FEF-HTTP] Target Base URL: ", InpBridgeBaseUrl);
   Print("[FEF-HTTP] Magic Number: ", InpMagicNumber, " | Heartbeat Interval: ", InpHeartbeatSeconds, "s");
   Print("[FEF-HTTP] Operating Mode: ", OPERATING_MODE, " (Strict Read-Only — Zero Execution)");
   Print("[FEF-HTTP] Zero DLL Imports — Native MQL5 WebRequest Transport");

   // Perform immediate initial heartbeat
   PushHeartbeat();

   // Register 1-second cadence timer
   if(!EventSetTimer(1))
   {
      Print("✕ [FEF-HTTP] Failed to register timer! LastError=", GetLastError());
      return INIT_FAILED;
   }

   Print("[FEF-HTTP] 1-second telemetry loop registered successfully.");
   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   Print("=== [FEF-HTTP] FEF TRADING SOLUTIONS HTTP BRIDGE EA TERMINATED ===");
}

//+------------------------------------------------------------------+
//| Master Telemetry Pump (Timer Event)                              |
//+------------------------------------------------------------------+
void OnTimer()
{
   datetime now = TimeLocal();

   // 1. Heartbeat every InpHeartbeatSeconds (default: 2s)
   if(now - g_last_heartbeat_time >= InpHeartbeatSeconds)
   {
      PushHeartbeat();
      g_last_heartbeat_time = now;
   }

   // 2. Real Quotes every 1s
   if(now - g_last_quotes_time >= 1)
   {
      PushQuotes();
      g_last_quotes_time = now;
   }

   // 3. Open Positions every 2s
   if(now - g_last_positions_time >= 2)
   {
      PushPositions();
      g_last_positions_time = now;
   }

   // 4. Pending Orders every 2s
   if(now - g_last_orders_time >= 2)
   {
      PushPendingOrders();
      g_last_orders_time = now;
   }

   // 5. Account Telemetry every 5s
   if(now - g_last_account_time >= 5)
   {
      PushAccount();
      g_last_account_time = now;
   }

   // 6. Symbols & Session Info every 30s
   if(now - g_last_symbols_time >= 30)
   {
      PushSymbolsAndSessions();
      g_last_symbols_time = now;
   }
}

//+------------------------------------------------------------------+
//| OnTick Fallback Pump                                             |
//+------------------------------------------------------------------+
void OnTick()
{
   datetime now = TimeLocal();
   if(now - g_last_heartbeat_time >= InpHeartbeatSeconds)
   {
      PushHeartbeat();
      g_last_heartbeat_time = now;
   }
}
