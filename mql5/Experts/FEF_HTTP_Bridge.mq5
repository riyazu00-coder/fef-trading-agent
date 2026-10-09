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

//--- Operating Mode Configuration
enum ENUM_FEF_OPERATING_MODE
{
   MODE_READ_ONLY       = 0,  // READ_ONLY (Monitoring & Telemetry Only)
   MODE_DEMO_EXECUTION  = 1   // DEMO_EXECUTION (Controlled MT5 Demo Orders)
};

input ENUM_FEF_OPERATING_MODE InpOperatingMode = MODE_DEMO_EXECUTION; // Canonical Armed Execution Mode

#define OPERATING_MODE (InpOperatingMode == MODE_DEMO_EXECUTION ? "DEMO_EXECUTION" : "READ_ONLY")

//--- Telemetry Timing State
datetime g_last_heartbeat_time = 0;
datetime g_last_account_time   = 0;
datetime g_last_quotes_time    = 0;
datetime g_last_positions_time = 0;
datetime g_last_orders_time    = 0;
datetime g_last_symbols_time   = 0;
datetime g_last_candles_time   = 0;
bool     g_bridge_connected    = false;

//--- Tracked canonical instruments for multi-asset telemetry (26 total across 5 categories)
string g_tracked_canonical[] = {
   // METALS (2)
   "XAUUSD", "XAGUSD",
   // FOREX (10)
   "EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD", "USDCAD", "NZDUSD", "EURJPY", "GBPJPY", "EURGBP",
   // INDICES (6)
   "US30", "US100", "US500", "GER40", "UK100", "JP225",
   // COMMODITIES (3)
   "USOIL", "UKOIL", "NATGAS",
   // CRYPTO (5)
   "BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD", "BNBUSD"
};

// Cached broker symbol resolutions and capability statuses
string g_resolved_broker_symbol[];
string g_symbol_resolution_status[];
bool   g_symbols_resolved = false;

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
//| Helper: Describe MT5 Trade Retcode                               |
//+------------------------------------------------------------------+
string GetRetcodeDescription(uint retcode)
{
   switch(retcode)
   {
      case 10004: return "TRADE_RETCODE_REQUOTE";
      case 10006: return "TRADE_RETCODE_REJECT";
      case 10007: return "TRADE_RETCODE_CANCEL";
      case 10008: return "TRADE_RETCODE_PLACED";
      case 10009: return "TRADE_RETCODE_DONE";
      case 10010: return "TRADE_RETCODE_DONE_PARTIAL";
      case 10011: return "TRADE_RETCODE_ERROR";
      case 10012: return "TRADE_RETCODE_TIMEOUT";
      case 10013: return "TRADE_RETCODE_INVALID";
      case 10014: return "TRADE_RETCODE_INVALID_VOLUME";
      case 10015: return "TRADE_RETCODE_INVALID_PRICE";
      case 10016: return "TRADE_RETCODE_INVALID_STOPS";
      case 10017: return "TRADE_RETCODE_TRADE_DISABLED";
      case 10018: return "TRADE_RETCODE_MARKET_CLOSED";
      case 10019: return "TRADE_RETCODE_NO_MONEY";
      case 10020: return "TRADE_RETCODE_PRICE_CHANGED";
      case 10021: return "TRADE_RETCODE_PRICE_OFF";
      case 10022: return "TRADE_RETCODE_INVALID_EXP";
      case 10023: return "TRADE_RETCODE_ORDER_CHANGED";
      case 10024: return "TRADE_RETCODE_TOO_MANY_REQUESTS";
      case 10025: return "TRADE_RETCODE_NO_CHANGES";
      case 10026: return "TRADE_RETCODE_SERVER_DISABLES_AT";
      case 10027: return "TRADE_RETCODE_CLIENT_DISABLES_AT";
      case 10028: return "TRADE_RETCODE_LOCKED";
      case 10029: return "TRADE_RETCODE_FROZEN";
      case 10030: return "TRADE_RETCODE_INVALID_FILL";
      case 10031: return "TRADE_RETCODE_CONNECTION";
      case 10032: return "TRADE_RETCODE_ONLY_REAL";
      case 10033: return "TRADE_RETCODE_LIMIT_ORDERS";
      case 10034: return "TRADE_RETCODE_LIMIT_VOLUME";
      case 10035: return "TRADE_RETCODE_POSITION_CLOSED";
      default:    return "RETCODE_" + IntegerToString(retcode);
   }
}

//+------------------------------------------------------------------+
//| Helper: Extract String value from flat JSON payload              |
//+------------------------------------------------------------------+
string JsonExtractString(string json, string key)
{
   string needle = "\"" + key + "\":\"";
   int start = StringFind(json, needle);
   if(start < 0) return "";
   start += StringLen(needle);
   int end = StringFind(json, "\"", start);
   if(end < 0) return "";
   return StringSubstr(json, start, end - start);
}

//+------------------------------------------------------------------+
//| Helper: Extract Double value from flat JSON payload              |
//+------------------------------------------------------------------+
double JsonExtractDouble(string json, string key)
{
   string needle = "\"" + key + "\":";
   int start = StringFind(json, needle);
   if(start < 0) return 0.0;
   start += StringLen(needle);
   while(start < StringLen(json) && (StringGetCharacter(json, start) == ' ' || StringGetCharacter(json, start) == '\"'))
      start++;
   int end = start;
   while(end < StringLen(json))
   {
      ushort ch = StringGetCharacter(json, end);
      if((ch >= '0' && ch <= '9') || ch == '.' || ch == '-')
         end++;
      else
         break;
   }
   if(end <= start) return 0.0;
   return StringToDouble(StringSubstr(json, start, end - start));
}

//+------------------------------------------------------------------+
//| Helper: Extract Long value from flat JSON payload                |
//+------------------------------------------------------------------+
long JsonExtractLong(string json, string key)
{
   string needle = "\"" + key + "\":";
   int start = StringFind(json, needle);
   if(start < 0) return 0;
   start += StringLen(needle);
   while(start < StringLen(json) && (StringGetCharacter(json, start) == ' ' || StringGetCharacter(json, start) == '\"'))
      start++;
   int end = start;
   while(end < StringLen(json))
   {
      ushort ch = StringGetCharacter(json, end);
      if((ch >= '0' && ch <= '9') || ch == '-')
         end++;
      else
         break;
   }
   if(end <= start) return 0;
   return StringToInteger(StringSubstr(json, start, end - start));
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
//| Get Known Broker Aliases for Canonical Instrument                |
//+------------------------------------------------------------------+
int GetCanonicalAliases(string canon, string &aliases[])
{
   string aliasCsv = "";
   if(canon == "XAUUSD") aliasCsv = "XAUUSD,XAUUSDm,XAUUSD.a,XAUUSD.r,XAUUSDc,GOLD,GOLDm,XAUUSD_i,XAUUSD.pro,XAUUSD.ecn,XAUUSD+,XAUUSD.raw,GOLD.pro,GOLD.ecn,XAU/USD";
   else if(canon == "XAGUSD") aliasCsv = "XAGUSD,XAGUSDm,XAGUSD.a,XAGUSD.r,XAGUSDc,SILVER,SILVERm,XAGUSD.pro,XAGUSD.ecn,XAGUSD+,XAGUSD.raw,SILVER.pro,SILVER.ecn,XAG/USD";
   else if(canon == "EURUSD") aliasCsv = "EURUSD,EURUSDm,EURUSD.a,EURUSD.r,EURUSDc,EURUSD_i,EURUSD.pro,EURUSD.ecn,EURUSD+,EURUSD.raw,EUR/USD";
   else if(canon == "GBPUSD") aliasCsv = "GBPUSD,GBPUSDm,GBPUSD.a,GBPUSD.r,GBPUSDc,GBPUSD_i,GBPUSD.pro,GBPUSD.ecn,GBPUSD+,GBPUSD.raw,GBP/USD";
   else if(canon == "USDJPY") aliasCsv = "USDJPY,USDJPYm,USDJPY.a,USDJPY.r,USDJPYc,USDJPY_i,USDJPY.pro,USDJPY.ecn,USDJPY+,USDJPY.raw,USD/JPY";
   else if(canon == "USDCHF") aliasCsv = "USDCHF,USDCHFm,USDCHF.a,USDCHF.r,USDCHFc,USDCHF.pro,USDCHF.ecn,USDCHF+,USDCHF.raw,USD/CHF";
   else if(canon == "AUDUSD") aliasCsv = "AUDUSD,AUDUSDm,AUDUSD.a,AUDUSD.r,AUDUSDc,AUDUSD.pro,AUDUSD.ecn,AUDUSD+,AUDUSD.raw,AUD/USD";
   else if(canon == "USDCAD") aliasCsv = "USDCAD,USDCADm,USDCAD.a,USDCAD.r,USDCADc,USDCAD.pro,USDCAD.ecn,USDCAD+,USDCAD.raw,USD/CAD";
   else if(canon == "NZDUSD") aliasCsv = "NZDUSD,NZDUSDm,NZDUSD.a,NZDUSD.r,NZDUSDc,NZDUSD.pro,NZDUSD.ecn,NZDUSD+,NZDUSD.raw,NZD/USD";
   else if(canon == "EURJPY") aliasCsv = "EURJPY,EURJPYm,EURJPY.a,EURJPY.r,EURJPYc,EURJPY.pro,EURJPY.ecn,EURJPY+,EURJPY.raw,EUR/JPY";
   else if(canon == "GBPJPY") aliasCsv = "GBPJPY,GBPJPYm,GBPJPY.a,GBPJPY.r,GBPJPYc,GBPJPY.pro,GBPJPY.ecn,GBPJPY+,GBPJPY.raw,GBP/JPY";
   else if(canon == "EURGBP") aliasCsv = "EURGBP,EURGBPm,EURGBP.a,EURGBP.r,EURGBPc,EURGBP.pro,EURGBP.ecn,EURGBP+,EURGBP.raw,EUR/GBP";
   else if(canon == "US30") aliasCsv = "US30,US30m,US30.a,US30.r,DJ30,WS30,YM,US30.pro,US30.ecn,US30Cash,DJ30.pro";
   else if(canon == "US100") aliasCsv = "US100,US100m,USTEC,USTECm,USTEC.a,NAS100,NAS100m,NQ,US100.pro,US100.ecn,US100Cash,USTEC.pro,NAS100.pro";
   else if(canon == "US500") aliasCsv = "US500,US500m,US500.a,US500.r,SPX500,SP500,ES,US500.pro,US500.ecn,US500Cash,SPX500.pro";
   else if(canon == "GER40") aliasCsv = "GER40,GER40m,DE40,DE40m,DAX40,DAX,GER40Cash,DE40Cash,GER40.pro";
   else if(canon == "UK100") aliasCsv = "UK100,UK100m,FTSE100,FTSE,UK100Cash,UK100.pro";
   else if(canon == "JP225") aliasCsv = "JP225,JP225m,N225,NIKKEI,JP225Cash,JP225.pro";
   else if(canon == "USOIL") aliasCsv = "USOIL,USOILm,USOIL.a,USOIL.r,USOILc,WTI,WTICRUDE,CRUDE,USOIL.pro,USOIL.ecn,WTI.pro,CL,XTIUSD";
   else if(canon == "UKOIL") aliasCsv = "UKOIL,UKOILm,UKOIL.a,UKOIL.r,BRENT,BRENTCRUDE,UKOIL.pro,CO,XBRUSD";
   else if(canon == "NATGAS") aliasCsv = "NATGAS,NATGASm,XNGUSD,NG,NATURALGAS,NATGAS.pro";
   else if(canon == "BTCUSD") aliasCsv = "BTCUSD,BTCUSDm,BTCUSDT,BTCUSD.r,BTCUSD.a,BTCUSDc,BTCUSD.pro,BTCUSD.ecn,BTC/USD,BTCUSD+";
   else if(canon == "ETHUSD") aliasCsv = "ETHUSD,ETHUSDm,ETHUSDT,ETHUSD.r,ETHUSD.a,ETHUSDc,ETHUSD.pro,ETHUSD.ecn,ETH/USD,ETHUSD+";
   else if(canon == "SOLUSD") aliasCsv = "SOLUSD,SOLUSDm,SOLUSDT,SOLUSD.r,SOLUSD.a,SOLUSDc,SOLUSD.pro,SOLUSD.ecn,SOL/USD,SOLUSD+";
   else if(canon == "XRPUSD") aliasCsv = "XRPUSD,XRPUSDm,XRPUSDT,XRPUSD.r,XRPUSD.a,XRPUSDc,XRPUSD.pro,XRPUSD.ecn,XRP/USD,XRPUSD+";
   else if(canon == "BNBUSD") aliasCsv = "BNBUSD,BNBUSDm,BNBUSDT,BNBUSD.r,BNBUSD.a,BNBUSDc,BNBUSD.pro,BNBUSD.ecn,BNB/USD,BNBUSD+";
   else aliasCsv = canon;

   return StringSplit(aliasCsv, ',', aliases);
}

//+------------------------------------------------------------------+
//| Dynamic Broker Symbol Resolver with Server Catalog & Caching     |
//+------------------------------------------------------------------+
string ResolveBrokerSymbol(string canonical)
{
   // Check cache first
   int totalTracked = ArraySize(g_tracked_canonical);
   for(int i = 0; i < totalTracked; i++)
   {
      if(g_tracked_canonical[i] == canonical && g_symbols_resolved)
      {
         if(StringLen(g_resolved_broker_symbol[i]) > 0)
            return g_resolved_broker_symbol[i];
      }
   }

   string aliases[];
   int numAliases = GetCanonicalAliases(canonical, aliases);

   // 1. First Pass: check each alias with SymbolSelect(alias, true)
   for(int i = 0; i < numAliases; i++)
   {
      if(SymbolSelect(aliases[i], true))
      {
         return aliases[i];
      }
   }

   // 2. Second Pass: search Market Watch (SymbolsTotal(true)) for exact match
   int mwTotal = SymbolsTotal(true);
   for(int i = 0; i < mwTotal; i++)
   {
      string sName = SymbolName(i, true);
      for(int a = 0; a < numAliases; a++)
      {
         if(StringCompare(sName, aliases[a], false) == 0)
         {
            SymbolSelect(sName, true);
            return sName;
         }
      }
   }

   // 3. Third Pass: search full broker server catalog (SymbolsTotal(false))
   int serverTotal = SymbolsTotal(false);
   for(int i = 0; i < serverTotal; i++)
   {
      string sName = SymbolName(i, false);
      for(int a = 0; a < numAliases; a++)
      {
         if(StringCompare(sName, aliases[a], false) == 0)
         {
            SymbolSelect(sName, true); // Bring into Market Watch!
            return sName;
         }
      }
   }

   // 4. Fourth Pass: prefix match on server catalog (avoid loose substring collisions)
   for(int i = 0; i < serverTotal; i++)
   {
      string sName = SymbolName(i, false);
      string sUpper = sName;
      StringToUpper(sUpper);
      if(StringFind(sUpper, canonical) == 0)
      {
         if(StringLen(sUpper) - StringLen(canonical) <= 5)
         {
            SymbolSelect(sName, true);
            return sName;
         }
      }
   }

   return ""; // Fail closed: instrument not offered by broker
}

//+------------------------------------------------------------------+
//| Initialize / Refresh Multi-Asset Symbol Resolution Status        |
//+------------------------------------------------------------------+
void InitializeSymbolResolution()
{
   int total = ArraySize(g_tracked_canonical);
   ArrayResize(g_resolved_broker_symbol, total);
   ArrayResize(g_symbol_resolution_status, total);

   int liveCount = 0;
   int supportedCount = 0;

   for(int i = 0; i < total; i++)
   {
      string canon = g_tracked_canonical[i];
      string resolved = ResolveBrokerSymbol(canon);
      g_resolved_broker_symbol[i] = resolved;

      if(StringLen(resolved) > 0)
      {
         MqlTick tick;
         if(SymbolInfoTick(resolved, tick) && (tick.bid > 0 || tick.ask > 0))
         {
            g_symbol_resolution_status[i] = "LIVE";
            liveCount++;
         }
         else
         {
            g_symbol_resolution_status[i] = "SUPPORTED_BY_BROKER";
            supportedCount++;
         }
      }
      else
      {
         g_symbol_resolution_status[i] = "NOT_SUPPORTED_BY_BROKER";
      }
   }
   g_symbols_resolved = true;
   Print("[FEF-HTTP] Multi-Asset Symbol Resolution: ", liveCount, " LIVE, ", supportedCount, " SUPPORTED, ", (total - liveCount - supportedCount), " NOT SUPPORTED out of ", total, " canonical instruments.");
}

void HandlePendingOrder(string resp);

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
   int httpStatus = PostJson("/mt5/heartbeat", json, resp);

   if(httpStatus >= 200 && httpStatus < 300)
   {
      HandlePendingOrder(resp);
   }
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
   if(!g_symbols_resolved) InitializeSymbolResolution();

   int count = ArraySize(g_tracked_canonical);
   string quotesJson = "[";

   int added = 0;
   for(int i = 0; i < count; i++)
   {
      string canonical = g_tracked_canonical[i];
      string brokerSym = g_resolved_broker_symbol[i];
      if(StringLen(brokerSym) == 0) continue;

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
   if(!g_symbols_resolved) InitializeSymbolResolution();

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

   // Collect dynamic broker specifications for tracked canonical symbols
   string specJson = "[";
   int specCount = 0;

   for(int i = 0; i < ArraySize(g_tracked_canonical); i++)
   {
      string canon = g_tracked_canonical[i];
      string brokerSym = g_resolved_broker_symbol[i];
      if(StringLen(brokerSym) == 0) continue;

      if(SymbolSelect(brokerSym, true))
      {
         double minLot    = SymbolInfoDouble(brokerSym, SYMBOL_VOLUME_MIN);
         double maxLot    = SymbolInfoDouble(brokerSym, SYMBOL_VOLUME_MAX);
         double lotStep   = SymbolInfoDouble(brokerSym, SYMBOL_VOLUME_STEP);
         double contract  = SymbolInfoDouble(brokerSym, SYMBOL_TRADE_CONTRACT_SIZE);
         double tickVal   = SymbolInfoDouble(brokerSym, SYMBOL_TRADE_TICK_VALUE);
         double tickValProfit = SymbolInfoDouble(brokerSym, SYMBOL_TRADE_TICK_VALUE_PROFIT);
         double tickValLoss   = SymbolInfoDouble(brokerSym, SYMBOL_TRADE_TICK_VALUE_LOSS);
         double tickSize  = SymbolInfoDouble(brokerSym, SYMBOL_TRADE_TICK_SIZE);
         double point     = SymbolInfoDouble(brokerSym, SYMBOL_POINT);
         int    digits    = (int)SymbolInfoInteger(brokerSym, SYMBOL_DIGITS);
         int    stopsLvl  = (int)SymbolInfoInteger(brokerSym, SYMBOL_TRADE_STOPS_LEVEL);
         int    freezeLvl = (int)SymbolInfoInteger(brokerSym, SYMBOL_TRADE_FREEZE_LEVEL);
         ENUM_SYMBOL_TRADE_MODE sTradeMode = (ENUM_SYMBOL_TRADE_MODE)SymbolInfoInteger(brokerSym, SYMBOL_TRADE_MODE);
         string sTradeModeStr = (sTradeMode == SYMBOL_TRADE_MODE_FULL) ? "FULL" : (sTradeMode == SYMBOL_TRADE_MODE_CLOSEONLY) ? "CLOSE_ONLY" : "DISABLED";
         string curBase   = SymbolInfoString(brokerSym, SYMBOL_CURRENCY_BASE);
         string curProfit = SymbolInfoString(brokerSym, SYMBOL_CURRENCY_PROFIT);
         string curMargin = SymbolInfoString(brokerSym, SYMBOL_CURRENCY_MARGIN);
         string desc      = JsonEscape(SymbolInfoString(brokerSym, SYMBOL_DESCRIPTION));
         double bid       = SymbolInfoDouble(brokerSym, SYMBOL_BID);
         double ask       = SymbolInfoDouble(brokerSym, SYMBOL_ASK);
         int    spread    = (int)SymbolInfoInteger(brokerSym, SYMBOL_SPREAD);

         if(specCount > 0) specJson += ",";
         specJson += "{";
         specJson += "\"canonicalSymbol\":\"" + canon + "\",";
         specJson += "\"brokerSymbol\":\"" + brokerSym + "\",";
         specJson += "\"description\":\"" + desc + "\",";
         specJson += "\"digits\":" + IntegerToString(digits) + ",";
         specJson += "\"point\":" + DoubleToString(point, digits) + ",";
         specJson += "\"contractSize\":" + DoubleToString(contract, 2) + ",";
         specJson += "\"minLot\":" + DoubleToString(minLot, 2) + ",";
         specJson += "\"maxLot\":" + DoubleToString(maxLot, 2) + ",";
         specJson += "\"lotStep\":" + DoubleToString(lotStep, 2) + ",";
         specJson += "\"tickValue\":" + DoubleToString(tickVal, 4) + ",";
         specJson += "\"tickValueProfit\":" + DoubleToString(tickValProfit, 4) + ",";
         specJson += "\"tickValueLoss\":" + DoubleToString(tickValLoss, 4) + ",";
         specJson += "\"tickSize\":" + DoubleToString(tickSize, digits) + ",";
         specJson += "\"stopsLevel\":" + IntegerToString(stopsLvl) + ",";
         specJson += "\"freezeLevel\":" + IntegerToString(freezeLvl) + ",";
         specJson += "\"tradeMode\":\"" + sTradeModeStr + "\",";
         specJson += "\"currencyBase\":\"" + curBase + "\",";
         specJson += "\"currencyProfit\":\"" + curProfit + "\",";
         specJson += "\"currencyMargin\":\"" + curMargin + "\",";
         specJson += "\"bid\":" + DoubleToString(bid, digits) + ",";
         specJson += "\"ask\":" + DoubleToString(ask, digits) + ",";
         specJson += "\"spread\":" + IntegerToString(spread);
         specJson += "}";
         specCount++;
      }
   }
   specJson += "]";

   // Asset diagnostics
   string diagJson = "{";
   for(int i = 0; i < ArraySize(g_tracked_canonical); i++)
   {
      if(i > 0) diagJson += ",";
      diagJson += "\"" + g_tracked_canonical[i] + "\":{";
      diagJson += "\"canonicalSymbol\":\"" + g_tracked_canonical[i] + "\",";
      diagJson += "\"brokerSymbol\":\"" + g_resolved_broker_symbol[i] + "\",";
      diagJson += "\"resolutionStatus\":\"" + g_symbol_resolution_status[i] + "\"";
      diagJson += "}";
   }
   diagJson += "}";

   string json = "{\"symbols\":" + symJson + ",\"specs\":" + specJson + ",\"assetDiagnostics\":" + diagJson + ",\"timestamp\":" + IntegerToString((long)TimeLocal() * 1000) + "}";
   string resp = "";
   PostJson("/mt5/symbols", json, resp);

   // Push multi-asset session info
   string sessListJson = "[";
   int sessCount = 0;
   MqlDateTime dt;
   TimeToStruct(TimeCurrent(), dt);
   ENUM_DAY_OF_WEEK day = (ENUM_DAY_OF_WEEK)dt.day_of_week;

   string mainSym = _Symbol;
   datetime mainFrom = 0, mainTo = 0;
   bool mainSessionFound = SymbolInfoSessionTrade(mainSym, day, 0, mainFrom, mainTo);
   ENUM_SYMBOL_TRADE_MODE mainTradeMode = (ENUM_SYMBOL_TRADE_MODE)SymbolInfoInteger(mainSym, SYMBOL_TRADE_MODE);
   string mainTradeModeStr = (mainTradeMode == SYMBOL_TRADE_MODE_FULL) ? "FULL" : (mainTradeMode == SYMBOL_TRADE_MODE_CLOSEONLY) ? "CLOSE_ONLY" : "DISABLED";

   for(int i = 0; i < ArraySize(g_tracked_canonical); i++)
   {
      string canon = g_tracked_canonical[i];
      string brokerSym = g_resolved_broker_symbol[i];
      if(StringLen(brokerSym) == 0) continue;

      datetime from = 0, to = 0;
      bool sessionFound = SymbolInfoSessionTrade(brokerSym, day, 0, from, to);
      ENUM_SYMBOL_TRADE_MODE tradeMode = (ENUM_SYMBOL_TRADE_MODE)SymbolInfoInteger(brokerSym, SYMBOL_TRADE_MODE);
      string tradeModeStr = (tradeMode == SYMBOL_TRADE_MODE_FULL) ? "FULL" : (tradeMode == SYMBOL_TRADE_MODE_CLOSEONLY) ? "CLOSE_ONLY" : "DISABLED";

      if(sessCount > 0) sessListJson += ",";
      sessListJson += "{";
      sessListJson += "\"canonicalSymbol\":\"" + canon + "\",";
      sessListJson += "\"brokerSymbol\":\"" + brokerSym + "\",";
      sessListJson += "\"tradeMode\":\"" + tradeModeStr + "\",";
      sessListJson += "\"sessionStart\":\"" + (sessionFound ? TimeToString(from, TIME_SECONDS) : "00:00:00") + "\",";
      sessListJson += "\"sessionEnd\":\"" + (sessionFound ? TimeToString(to, TIME_SECONDS) : "23:59:59") + "\",";
      sessListJson += "\"serverTime\":\"" + TimeToString(TimeCurrent(), TIME_DATE|TIME_SECONDS) + "\",";
      sessListJson += "\"marketAvailable\":" + ((tradeMode == SYMBOL_TRADE_MODE_FULL && TerminalInfoInteger(TERMINAL_CONNECTED) > 0) ? "true" : "false");
      sessListJson += "}";
      sessCount++;
   }
   sessListJson += "]";

   string sessJson = "{";
   sessJson += "\"brokerSymbol\":\"" + mainSym + "\",";
   sessJson += "\"tradeMode\":\"" + mainTradeModeStr + "\",";
   sessJson += "\"sessionStart\":\"" + (mainSessionFound ? TimeToString(mainFrom, TIME_SECONDS) : "00:00:00") + "\",";
   sessJson += "\"sessionEnd\":\"" + (mainSessionFound ? TimeToString(mainTo, TIME_SECONDS) : "23:59:59") + "\",";
   sessJson += "\"serverTime\":\"" + TimeToString(TimeCurrent(), TIME_DATE|TIME_SECONDS) + "\",";
   sessJson += "\"marketAvailable\":" + ((mainTradeMode == SYMBOL_TRADE_MODE_FULL && TerminalInfoInteger(TERMINAL_CONNECTED) > 0) ? "true" : "false");
   sessJson += "}";

   string sessPayload = "{\"session\":" + sessJson + ",\"sessions\":" + sessListJson + ",\"timestamp\":" + IntegerToString((long)TimeLocal() * 1000) + "}";
   PostJson("/mt5/session-info", sessPayload, resp);
}

//+------------------------------------------------------------------+
//| Push Real OHLC Rates / Candles (POST /mt5/candles)               |
//+------------------------------------------------------------------+
void PushCandlesForSymbol(string canonical, string brokerSym, ENUM_TIMEFRAMES period, string tfStr)
{
   if(!SymbolSelect(brokerSym, true)) return;

   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   int copied = CopyRates(brokerSym, period, 0, 35, rates);
   if(copied <= 0) return;

   int digits = (int)SymbolInfoInteger(brokerSym, SYMBOL_DIGITS);
   string candlesJson = "[";

   // Transmit in chronological order (oldest -> newest)
   for(int i = copied - 1; i >= 0; i--)
   {
      if(i < copied - 1) candlesJson += ",";
      candlesJson += "{";
      candlesJson += "\"timestamp\":" + IntegerToString((long)rates[i].time * 1000) + ",";
      candlesJson += "\"open\":" + DoubleToString(rates[i].open, digits) + ",";
      candlesJson += "\"high\":" + DoubleToString(rates[i].high, digits) + ",";
      candlesJson += "\"low\":" + DoubleToString(rates[i].low, digits) + ",";
      candlesJson += "\"close\":" + DoubleToString(rates[i].close, digits) + ",";
      candlesJson += "\"tickVolume\":" + IntegerToString(rates[i].tick_volume);
      candlesJson += "}";
   }
   candlesJson += "]";

   string payload = "{";
   payload += "\"canonicalSymbol\":\"" + canonical + "\",";
   payload += "\"brokerSymbol\":\"" + brokerSym + "\",";
   payload += "\"timeframe\":\"" + tfStr + "\",";
   payload += "\"candleCount\":" + IntegerToString(copied) + ",";
   payload += "\"candles\":" + candlesJson + ",";
   payload += "\"timestamp\":" + IntegerToString((long)TimeLocal() * 1000);
   payload += "}";

   string resp = "";
   PostJson("/mt5/candles", payload, resp);
}

void PushCandles()
{
   if(!g_symbols_resolved) InitializeSymbolResolution();

   int total = ArraySize(g_tracked_canonical);
   for(int s = 0; s < total; s++)
   {
      string canon = g_tracked_canonical[s];
      string brokerSym = g_resolved_broker_symbol[s];
      if(StringLen(brokerSym) == 0) continue;

      PushCandlesForSymbol(canon, brokerSym, PERIOD_M1, "M1");
      PushCandlesForSymbol(canon, brokerSym, PERIOD_M5, "M5");
      PushCandlesForSymbol(canon, brokerSym, PERIOD_M15, "M15");
      PushCandlesForSymbol(canon, brokerSym, PERIOD_M30, "M30");
      PushCandlesForSymbol(canon, brokerSym, PERIOD_H1, "H1");
      PushCandlesForSymbol(canon, brokerSym, PERIOD_H4, "H4");
      PushCandlesForSymbol(canon, brokerSym, PERIOD_D1, "D1");
   }
}

//+------------------------------------------------------------------+
//| Execute Controlled Demo Order (DEMO ONLY)                        |
//+------------------------------------------------------------------+
void HandlePendingOrder(string resp)
{
   // Safety check 1: Hard block on Real accounts
   ENUM_ACCOUNT_TRADE_MODE tradeMode = (ENUM_ACCOUNT_TRADE_MODE)AccountInfoInteger(ACCOUNT_TRADE_MODE);
   if(tradeMode == ACCOUNT_TRADE_MODE_REAL)
   {
      Print("✕ [FEF-SECURITY] Real account execution blocked! InpOperatingMode forced to READ_ONLY.");
      return;
   }

   // Safety check 2: EA Operating mode
   if(InpOperatingMode != MODE_DEMO_EXECUTION)
   {
      Print("✕ [FEF-SECURITY] Operating mode is READ_ONLY. Execution rejected. Set InpOperatingMode=MODE_DEMO_EXECUTION to dispatch.");
      return;
   }

   int orderPos = StringFind(resp, "\"pendingOrder\":{");
   int ordersArrayPos = StringFind(resp, "\"orders\":[");
   if(orderPos < 0 && ordersArrayPos < 0) return; // No pending order

   string requestId   = "";
   string brokerSym   = "";
   string orderType   = "";
   double volume      = 0.0;
   double sl          = 0.0;
   double tp          = 0.0;
   double maxSlippage = 3.0;

   if(ordersArrayPos >= 0)
   {
      string orderSub = StringSubstr(resp, ordersArrayPos);
      requestId   = JsonExtractString(orderSub, "id");
      if(StringLen(requestId) == 0) requestId = JsonExtractString(orderSub, "requestId");
      brokerSym   = JsonExtractString(orderSub, "symbol");
      if(StringLen(brokerSym) == 0) brokerSym = JsonExtractString(orderSub, "brokerSymbol");

      long cmd = JsonExtractLong(orderSub, "cmd");
      orderType = JsonExtractString(orderSub, "orderType");
      if(StringLen(orderType) == 0) orderType = JsonExtractString(orderSub, "direction");
      if(StringLen(orderType) == 0)
      {
         orderType = (cmd == 0) ? "BUY" : "SELL";
      }

      volume      = JsonExtractDouble(orderSub, "volume");
      sl          = JsonExtractDouble(orderSub, "sl");
      tp          = JsonExtractDouble(orderSub, "tp");
      maxSlippage = JsonExtractDouble(orderSub, "maxSlippagePips");
   }
   else if(orderPos >= 0)
   {
      string orderSub = StringSubstr(resp, orderPos);
      requestId   = JsonExtractString(orderSub, "requestId");
      if(StringLen(requestId) == 0) requestId = JsonExtractString(orderSub, "id");
      brokerSym   = JsonExtractString(orderSub, "brokerSymbol");
      if(StringLen(brokerSym) == 0) brokerSym = JsonExtractString(orderSub, "symbol");
      orderType   = JsonExtractString(orderSub, "orderType");
      if(StringLen(orderType) == 0) orderType = JsonExtractString(orderSub, "direction");
      volume      = JsonExtractDouble(orderSub, "volume");
      sl          = JsonExtractDouble(orderSub, "sl");
      tp          = JsonExtractDouble(orderSub, "tp");
      maxSlippage = JsonExtractDouble(orderSub, "maxSlippagePips");
   }

   if(maxSlippage <= 0) maxSlippage = 3.0;

   if(StringLen(requestId) == 0 || StringLen(brokerSym) == 0)
   {
      Print("✕ [FEF-DEMO-EXECUTE] Malformed order payload: missing requestId or brokerSymbol.");
      return;
   }

   string resolved = ResolveBrokerSymbol(brokerSym);
   if(StringLen(resolved) > 0)
   {
      brokerSym = resolved;
   }

   Print("⚡ [FEF-DEMO-EXECUTE] Dispatching demo order: ReqID=", requestId, " | ", orderType, " ", DoubleToString(volume, 2), " ", brokerSym, " | SL: ", DoubleToString(sl, 5), " | TP: ", DoubleToString(tp, 5));

   MqlTradeRequest req;
   MqlTradeResult  res;
   ZeroMemory(req);
   ZeroMemory(res);

   req.action = TRADE_ACTION_DEAL;
   req.symbol = brokerSym;
   req.volume = volume;
   req.type   = (orderType == "SELL" ? ORDER_TYPE_SELL : ORDER_TYPE_BUY);
   req.price  = (req.type == ORDER_TYPE_BUY ? SymbolInfoDouble(brokerSym, SYMBOL_ASK) : SymbolInfoDouble(brokerSym, SYMBOL_BID));
   req.sl     = sl;
   req.tp     = tp;

   // Point & Slippage
   double point = SymbolInfoDouble(brokerSym, SYMBOL_POINT);
   int digits = (int)SymbolInfoInteger(brokerSym, SYMBOL_DIGITS);
   double pipSize = (digits == 3 || digits == 5) ? point * 10 : point;
   if(pipSize <= 0) pipSize = point > 0 ? point : 0.0001;
   req.deviation = (ulong)MathRound((maxSlippage * pipSize) / (point > 0 ? point : 1));

   req.magic = InpMagicNumber;
   req.comment = "FEF-" + StringSubstr(requestId, 0, 16);

   // Determine supported filling mode
   uint filling = (uint)SymbolInfoInteger(brokerSym, SYMBOL_FILLING_MODE);
   if((filling & SYMBOL_FILLING_IOC) != 0)
      req.type_filling = ORDER_FILLING_IOC;
   else if((filling & SYMBOL_FILLING_FOK) != 0)
      req.type_filling = ORDER_FILLING_FOK;
   else
      req.type_filling = ORDER_FILLING_RETURN;

   ResetLastError();
   bool sent = OrderSend(req, res);
   int lastErr = GetLastError();

   double currentBid = SymbolInfoDouble(brokerSym, SYMBOL_BID);
   double currentAsk = SymbolInfoDouble(brokerSym, SYMBOL_ASK);
   double spreadPips = (currentAsk - currentBid) / (pipSize > 0 ? pipSize : 1.0);

   bool success = sent && (res.retcode == TRADE_RETCODE_DONE || res.retcode == TRADE_RETCODE_PLACED);
   string retDesc = GetRetcodeDescription(res.retcode);

   if(success)
   {
      Print("✓ [FEF-DEMO-EXECUTE] Order SUCCESS: Ticket=", res.order, " Deal=", res.deal, " Retcode=", res.retcode, " (", retDesc, ") Volume=", DoubleToString(res.volume, 2), " Price=", DoubleToString(res.price, digits));
   }
   else
   {
      Print("✕ [FEF-DEMO-EXECUTE] Order REJECTED/FAILED: Retcode=", res.retcode, " (", retDesc, ") LastError=", lastErr);
   }

   string resultJson = "{";
   resultJson += "\"requestId\":\"" + JsonEscape(requestId) + "\",";
   resultJson += "\"success\":" + (success ? "true" : "false") + ",";
   resultJson += "\"ticket\":" + IntegerToString((long)res.order) + ",";
   resultJson += "\"orderTicket\":" + IntegerToString((long)res.order) + ",";
   resultJson += "\"deal\":" + IntegerToString((long)res.deal) + ",";
   resultJson += "\"symbol\":\"" + JsonEscape(brokerSym) + "\",";
   resultJson += "\"volume\":" + DoubleToString(res.volume > 0 ? res.volume : volume, 2) + ",";
   resultJson += "\"price\":" + DoubleToString(res.price > 0 ? res.price : req.price, digits) + ",";
   resultJson += "\"bid\":" + DoubleToString(currentBid, digits) + ",";
   resultJson += "\"ask\":" + DoubleToString(currentAsk, digits) + ",";
   resultJson += "\"spread\":" + DoubleToString(spreadPips, 1) + ",";
   resultJson += "\"retcode\":" + IntegerToString(res.retcode) + ",";
   resultJson += "\"retcodeDescription\":\"" + JsonEscape(retDesc) + "\",";
   resultJson += "\"comment\":\"" + JsonEscape(res.comment) + "\",";
   resultJson += "\"timestamp\":" + IntegerToString((long)TimeLocal() * 1000);
   resultJson += "}";

   string postResp = "";
   PostJson("/mt5/order-result", resultJson, postResp);
   PostJson("/mt5/execution-result", resultJson, postResp);

   // Immediately push refreshed positions and account
   PushPositions();
   PushAccount();
}

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   Print("=== [FEF-HTTP] FEF TRADING SOLUTIONS HTTP BRIDGE EA INITIALIZING ===");
   Print("[FEF-HTTP] Target Base URL: ", InpBridgeBaseUrl);
   Print("[FEF-HTTP] Magic Number: ", InpMagicNumber, " | Heartbeat Interval: ", InpHeartbeatSeconds, "s");
   Print("[FEF-HTTP] Operating Mode: ", OPERATING_MODE);
   Print("[FEF-HTTP] Zero DLL Imports — Native MQL5 WebRequest Transport");

   // CRITICAL SECURITY ENFORCEMENT: LIVE ACCOUNTS ARE PERMANENTLY LOCKED OUT OF EXECUTION
   ENUM_ACCOUNT_TRADE_MODE tradeMode = (ENUM_ACCOUNT_TRADE_MODE)AccountInfoInteger(ACCOUNT_TRADE_MODE);
   if(tradeMode == ACCOUNT_TRADE_MODE_REAL)
   {
      if(InpOperatingMode == MODE_DEMO_EXECUTION)
      {
         Alert("CRITICAL SECURITY ERROR: LIVE ACCOUNTS ARE NOT PERMITTED FOR EXECUTION. InpOperatingMode must be MODE_READ_ONLY on real accounts.");
         Print("✕ [FEF-HTTP] REAL ACCOUNT DETECTED WITH DEMO_EXECUTION. Terminating EA.");
         return INIT_FAILED;
      }
      Print("⚠ [FEF-HTTP] Real account detected. Strict read-only telemetry only. Execution locked.");
   }

   // Perform initial multi-asset symbol discovery & resolution
   InitializeSymbolResolution();

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

   // 7. OHLC Candles every 10s
   if(now - g_last_candles_time >= 10)
   {
      PushCandles();
      g_last_candles_time = now;
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
