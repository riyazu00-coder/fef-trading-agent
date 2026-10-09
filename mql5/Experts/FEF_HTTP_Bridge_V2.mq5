//+------------------------------------------------------------------+
//|                                        FEF_HTTP_Bridge_V2.mq5    |
//|                         FEF TRADING SOLUTIONS                    |
//|               Master Consolidation V2: Execution Bridge V2       |
//+------------------------------------------------------------------+
#property copyright   "FEF Trading Solutions"
#property link        "https://feftradingsolutions.com"
#property version     "2.00"
#property description "Execution Bridge V2: Explicit Typed Envelopes & Strict Protocol Separation"
#property description "Communicates with Bridge V2 on 127.0.0.1:5560 via MQL5 WebRequest()"
#property description "DEMO Trading Only — REAL Accounts Strictly HARD-LOCKED"
#property strict

//--- Inputs
input group "=== Bridge V2 Configuration ==="
input string   InpBridgeBaseUrl     = "http://127.0.0.1:5560";     // Bridge V2 Base URL
input string   InpAuthToken         = "fef_local_bridge_v2_token"; // Auth Token
input ulong    InpMagicNumber       = 888002;                      // Cortex V2 Magic Number
input int      InpPollIntervalMs    = 500;                         // Execution Poll Interval (ms)

//--- Operating Mode
enum ENUM_V2_OPERATING_MODE
{
   V2_MODE_DEMO_EXECUTION = 0, // DEMO EXECUTION (Authorized Demo Accounts Only)
   V2_MODE_READ_ONLY      = 1  // READ ONLY (Telemetry & Specs Only)
};

input ENUM_V2_OPERATING_MODE InpOperatingMode = V2_MODE_DEMO_EXECUTION;

//--- State variables
datetime g_last_specs_time     = 0;
datetime g_last_account_time   = 0;
datetime g_last_quotes_time    = 0;
datetime g_last_positions_time = 0;
datetime g_last_poll_time      = 0;
bool     g_is_real_account     = false;
bool     g_safety_lock_active  = false;

// Tracked 26 canonical symbols
string g_symbols[] = {
   "XAUUSD", "XAGUSD",
   "EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD", "USDCAD", "NZDUSD", "EURJPY", "GBPJPY", "EURGBP",
   "US30", "US100", "US500", "GER40", "UK100", "JP225",
   "USOIL", "UKOIL", "NATGAS",
   "BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD", "BNBUSD"
};

//+------------------------------------------------------------------+
//| Helper: Escape JSON String                                       |
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
//| Helper: Resolve Broker Symbol Variant                            |
//+------------------------------------------------------------------+
string ResolveBrokerSymbol(string canonical)
{
   // 1. Direct match
   if(SymbolInfoInteger(canonical, SYMBOL_SELECT) || SymbolSelect(canonical, true))
      return canonical;

   // 2. Common suffix/prefix patterns (.pro, .m, _i, etc.)
   string patterns[] = {
      canonical + ".pro", canonical + ".m", canonical + "_i", canonical + ".r",
      canonical + "m", canonical + ".ecn", canonical + "c"
   };

   for(int i = 0; i < ArraySize(patterns); i++)
   {
      if(SymbolSelect(patterns[i], true))
         return patterns[i];
   }

   // 3. Fallbacks for crypto / indices
   if(canonical == "BTCUSD" && SymbolSelect("BTCUSDT", true)) return "BTCUSDT";
   if(canonical == "ETHUSD" && SymbolSelect("ETHUSDT", true)) return "ETHUSDT";
   if(canonical == "US30" && SymbolSelect("DJ30", true)) return "DJ30";
   if(canonical == "US100" && SymbolSelect("NAS100", true)) return "NAS100";
   if(canonical == "US500" && SymbolSelect("SPX500", true)) return "SPX500";

   return canonical;
}

//+------------------------------------------------------------------+
//| Helper: Make HTTP WebRequest                                     |
//+------------------------------------------------------------------+
int HttpSend(string method, string endpoint, string jsonBody, string &responseOut)
{
   string url = InpBridgeBaseUrl + endpoint;
   string headers = "Content-Type: application/json\r\nAuthorization: Bearer " + InpAuthToken + "\r\n";
   char postData[];
   char result[];
   string resultHeaders;

   if(StringLen(jsonBody) > 0)
   {
      int bytes = StringToCharArray(jsonBody, postData, 0, WHOLE_ARRAY, CP_UTF8);
      if(bytes > 0 && postData[bytes - 1] == 0)
         ArrayResize(postData, bytes - 1);
   }

   ResetLastError();
   int res = WebRequest(
      method,
      url,
      headers,
      3000,
      postData,
      result,
      resultHeaders
   );

   if(res > 0)
   {
      responseOut = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
      if(res >= 400)
      {
         PrintFormat("[BRIDGE-V2 HTTP %d] %s %s -> %s", res, method, endpoint, responseOut);
      }
      return res;
   }

   int err = GetLastError();
   PrintFormat("[BRIDGE-V2 HTTP ERR] %s %s failed. Code: %d", method, url, err);
   return -1;
}

//+------------------------------------------------------------------+
//| Helper: Extract string value from simple JSON                    |
//+------------------------------------------------------------------+
string JsonExtractString(string json, string key)
{
   string searchKey = "\"" + key + "\":\"";
   int start = StringFind(json, searchKey);
   if(start < 0) return "";
   start += StringLen(searchKey);
   int end = StringFind(json, "\"", start);
   if(end < 0) return "";
   return StringSubstr(json, start, end - start);
}

//+------------------------------------------------------------------+
//| Helper: Extract number value from simple JSON                    |
//+------------------------------------------------------------------+
double JsonExtractDouble(string json, string key)
{
   string searchKey = "\"" + key + "\":";
   int start = StringFind(json, searchKey);
   if(start < 0) return 0.0;
   start += StringLen(searchKey);
   // Skip whitespace
   while(start < StringLen(json) && (StringGetCharacter(json, start) == ' ' || StringGetCharacter(json, start) == '\t')) start++;
   int end = start;
   while(end < StringLen(json))
   {
      ushort ch = StringGetCharacter(json, end);
      if((ch >= '0' && ch <= '9') || ch == '.' || ch == '-') end++;
      else break;
   }
   return StringToDouble(StringSubstr(json, start, end - start));
}

//+------------------------------------------------------------------+
//| Helper: Extract boolean from JSON                                |
//+------------------------------------------------------------------+
bool JsonExtractBool(string json, string key)
{
   string searchKey = "\"" + key + "\":";
   int start = StringFind(json, searchKey);
   if(start < 0) return false;
   start += StringLen(searchKey);
   string sub = StringSubstr(json, start, 5);
   return (StringFind(sub, "true") >= 0);
}

//+------------------------------------------------------------------+
//| Publish Contract Specifications (Digits, Point, Volume, Stops)   |
//+------------------------------------------------------------------+
void PushContractSpecs()
{
   string specsJson = "{\"specs\":[";
   bool first = true;

   for(int i = 0; i < ArraySize(g_symbols); i++)
   {
      string canonical = g_symbols[i];
      string brokerSym = ResolveBrokerSymbol(canonical);

      if(!SymbolSelect(brokerSym, true)) continue;

      int digits         = (int)SymbolInfoInteger(brokerSym, SYMBOL_DIGITS);
      double point       = SymbolInfoDouble(brokerSym, SYMBOL_POINT);
      double contractSize= SymbolInfoDouble(brokerSym, SYMBOL_TRADE_CONTRACT_SIZE);
      double volMin      = SymbolInfoDouble(brokerSym, SYMBOL_VOLUME_MIN);
      double volMax      = SymbolInfoDouble(brokerSym, SYMBOL_VOLUME_MAX);
      double volStep     = SymbolInfoDouble(brokerSym, SYMBOL_VOLUME_STEP);
      int stopsLevel     = (int)SymbolInfoInteger(brokerSym, SYMBOL_TRADE_STOPS_LEVEL);
      int freezeLevel    = (int)SymbolInfoInteger(brokerSym, SYMBOL_TRADE_FREEZE_LEVEL);
      string baseCurr    = SymbolInfoString(brokerSym, SYMBOL_CURRENCY_BASE);
      string profitCurr  = SymbolInfoString(brokerSym, SYMBOL_CURRENCY_PROFIT);
      int tradeMode      = (int)SymbolInfoInteger(brokerSym, SYMBOL_TRADE_MODE);

      if(!first) specsJson += ",";
      first = false;

      specsJson += StringFormat(
         "{\"symbol\":\"%s\",\"brokerSymbol\":\"%s\",\"digits\":%d,\"point\":%.8f,\"contractSize\":%.2f,\"volumeMin\":%.4f,\"volumeMax\":%.2f,\"volumeStep\":%.4f,\"stopsLevel\":%d,\"freezeLevel\":%d,\"currencyBase\":\"%s\",\"currencyProfit\":\"%s\",\"tradeMode\":%d}",
         canonical, brokerSym, digits, point, contractSize, volMin, volMax, volStep, stopsLevel, freezeLevel, baseCurr, profitCurr, tradeMode
      );
   }

   specsJson += "]}";

   string resp;
   HttpSend("POST", "/v2/telemetry/specs", specsJson, resp);
}

//+------------------------------------------------------------------+
//| Publish Account Telemetry                                        |
//+------------------------------------------------------------------+
void PushAccountTelemetry()
{
   long tradeModeInt = AccountInfoInteger(ACCOUNT_TRADE_MODE);
   string modeStr = (tradeModeInt == ACCOUNT_TRADE_MODE_REAL) ? "REAL" : "DEMO";

   string body = StringFormat(
      "{\"accountNumber\":%lld,\"broker\":\"%s\",\"currency\":\"%s\",\"balance\":%.2f,\"equity\":%.2f,\"margin\":%.2f,\"freeMargin\":%.2f,\"marginLevel\":%.2f,\"tradeMode\":\"%s\",\"accountTradeMode\":%d,\"tradeAllowed\":%s}",
      AccountInfoInteger(ACCOUNT_LOGIN),
      JsonEscape(AccountInfoString(ACCOUNT_COMPANY)),
      AccountInfoString(ACCOUNT_CURRENCY),
      AccountInfoDouble(ACCOUNT_BALANCE),
      AccountInfoDouble(ACCOUNT_EQUITY),
      AccountInfoDouble(ACCOUNT_MARGIN),
      AccountInfoDouble(ACCOUNT_MARGIN_FREE),
      AccountInfoDouble(ACCOUNT_MARGIN_LEVEL),
      modeStr,
      (int)tradeModeInt,
      (AccountInfoInteger(ACCOUNT_TRADE_ALLOWED) && !g_is_real_account) ? "true" : "false"
   );

   string resp;
   HttpSend("POST", "/v2/telemetry/account", body, resp);
}

//+------------------------------------------------------------------+
//| Publish Real-time Broker Quotes                                  |
//+------------------------------------------------------------------+
void PushQuotesTelemetry()
{
   string quotesJson = "{\"quotes\":[";
   bool first = true;

   for(int i = 0; i < ArraySize(g_symbols); i++)
   {
      string canonical = g_symbols[i];
      string brokerSym = ResolveBrokerSymbol(canonical);

      MqlTick tick;
      if(!SymbolInfoTick(brokerSym, tick)) continue;

      double point = SymbolInfoDouble(brokerSym, SYMBOL_POINT);
      int spreadPoints = (point > 0) ? (int)MathRound((tick.ask - tick.bid) / point) : 0;

      if(!first) quotesJson += ",";
      first = false;

      quotesJson += StringFormat(
         "{\"symbol\":\"%s\",\"brokerSymbol\":\"%s\",\"bid\":%.5f,\"ask\":%.5f,\"spreadPoints\":%d,\"timestamp\":%lld}",
         canonical, brokerSym, tick.bid, tick.ask, spreadPoints, (long)tick.time_msc
      );
   }

   quotesJson += "]}";

   string resp;
   HttpSend("POST", "/v2/telemetry/quotes", quotesJson, resp);
}

//+------------------------------------------------------------------+
//| Publish Live Positions Telemetry                                 |
//+------------------------------------------------------------------+
void PushPositionsTelemetry()
{
   string posJson = "{\"positions\":[";
   bool first = true;
   int total = PositionsTotal();
   for(int i = 0; i < total; i++)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;

      string sym = PositionGetString(POSITION_SYMBOL);
      long type = PositionGetInteger(POSITION_TYPE);
      double vol = PositionGetDouble(POSITION_VOLUME);
      double priceOpen = PositionGetDouble(POSITION_PRICE_OPEN);
      double priceCurrent = PositionGetDouble(POSITION_PRICE_CURRENT);
      double sl = PositionGetDouble(POSITION_SL);
      double tp = PositionGetDouble(POSITION_TP);
      double profit = PositionGetDouble(POSITION_PROFIT);
      double swap = PositionGetDouble(POSITION_SWAP);
      string comment = PositionGetString(POSITION_COMMENT);
      long magic = PositionGetInteger(POSITION_MAGIC);
      long time = (long)PositionGetInteger(POSITION_TIME);

      if(!first) posJson += ",";
      first = false;

      posJson += StringFormat(
         "{\"ticket\":%lld,\"symbol\":\"%s\",\"type\":\"%s\",\"volume\":%.2f,\"openPrice\":%.5f,\"currentPrice\":%.5f,\"sl\":%.5f,\"tp\":%.5f,\"profit\":%.2f,\"swap\":%.2f,\"comment\":\"%s\",\"magic\":%lld,\"openTime\":%lld}",
         ticket, sym, (type == POSITION_TYPE_BUY ? "BUY" : "SELL"), vol, priceOpen, priceCurrent, sl, tp, profit, swap, JsonEscape(comment), magic, time * 1000
      );
   }
   posJson += "]}";

   string resp;
   HttpSend("POST", "/v2/telemetry/positions", posJson, resp);
}

//+------------------------------------------------------------------+
//| Execution Command Polling & Execution                            |
//+------------------------------------------------------------------+
void PollExecutionCommands()
{
   // Safety Guard 1: Hard lock on REAL account
   if(g_is_real_account)
   {
      Print("[FEF-V2 SAFETY] Real account detected. Order execution disabled.");
      return;
   }

   // Safety Guard 2: Mode must be DEMO_EXECUTION
   if(InpOperatingMode != V2_MODE_DEMO_EXECUTION) return;

   string resp;
   int status = HttpSend("GET", "/v2/execution/poll", "", resp);
   if(status != 200 || StringLen(resp) == 0) return;

   // Check typed envelope
   bool hasCommand = JsonExtractBool(resp, "hasCommand");
   if(!hasCommand) return; // No pending command

   // Extract command object
   int cmdStart = StringFind(resp, "\"command\":{");
   if(cmdStart < 0) return;
   string cmdJson = StringSubstr(resp, cmdStart);

   string executionId = JsonExtractString(cmdJson, "executionId");
   string canonicalSym= JsonExtractString(cmdJson, "symbol");
   string side        = JsonExtractString(cmdJson, "side");
   double volume      = JsonExtractDouble(cmdJson, "volume");
   double reqPrice    = JsonExtractDouble(cmdJson, "requestedPrice");
   double sl          = JsonExtractDouble(cmdJson, "stopLoss");
   double tp          = JsonExtractDouble(cmdJson, "takeProfit");
   int slippage       = (int)JsonExtractDouble(cmdJson, "slippagePoints");
   ulong magic        = (ulong)JsonExtractDouble(cmdJson, "magicNumber");
   if(magic == 0) magic = InpMagicNumber;

   PrintFormat("[FEF-V2 EXEC] Received command: ID=%s, Sym=%s, Side=%s, Vol=%.2f, Price=%.5f",
      executionId, canonicalSym, side, volume, reqPrice);

   // 1. Send Explicit ACK immediately
   string ackJson = StringFormat("{\"executionId\":\"%s\",\"terminalId\":\"MT5_V2\",\"receivedAt\":%lld}",
      executionId, (long)TimeCurrent() * 1000);
   string ackResp;
   HttpSend("POST", "/v2/execution/ack", ackJson, ackResp);

   // 2. Resolve broker symbol
   string brokerSym = ResolveBrokerSymbol(canonicalSym);
   if(!SymbolSelect(brokerSym, true))
   {
      string failJson = StringFormat("{\"executionId\":\"%s\",\"status\":\"REJECTED\",\"failureReasonCode\":\"SYMBOL_UNAVAILABLE_ON_BROKER\",\"executedAt\":%lld}",
         executionId, (long)TimeCurrent() * 1000);
      string fResp;
      HttpSend("POST", "/v2/execution/result", failJson, fResp);
      return;
   }

   // 3. Prepare MqlTradeRequest
   MqlTick currentTick;
   if(!SymbolInfoTick(brokerSym, currentTick))
   {
      string failJson = StringFormat("{\"executionId\":\"%s\",\"status\":\"REJECTED\",\"failureReasonCode\":\"TICK_DATA_UNAVAILABLE\",\"executedAt\":%lld}",
         executionId, (long)TimeCurrent() * 1000);
      string fResp;
      HttpSend("POST", "/v2/execution/result", failJson, fResp);
      return;
   }

   MqlTradeRequest request;
   MqlTradeResult  result;
   ZeroMemory(request);
   ZeroMemory(result);

   request.action   = TRADE_ACTION_DEAL;
   request.symbol   = brokerSym;
   request.volume   = volume;
   request.type     = (side == "BUY" ? ORDER_TYPE_BUY : ORDER_TYPE_SELL);
   request.price    = (side == "BUY" ? currentTick.ask : currentTick.bid);
   request.sl       = sl;
   request.tp       = tp;
   request.deviation= slippage > 0 ? slippage : 10;
   request.magic    = magic;
   request.comment  = "CORTEX-V2:" + StringSubstr(executionId, 0, 15);
   request.type_filling = ORDER_FILLING_IOC;

   // Adjust filling mode if broker does not support IOC
   uint filling = (uint)SymbolInfoInteger(brokerSym, SYMBOL_FILLING_MODE);
   if((filling & SYMBOL_FILLING_IOC) == 0)
   {
      if((filling & SYMBOL_FILLING_FOK) != 0) request.type_filling = ORDER_FILLING_FOK;
      else request.type_filling = ORDER_FILLING_RETURN;
   }

   // 4. Send Order to MT5 Broker
   ResetLastError();
   bool sent = OrderSend(request, result);
   int lastErr = GetLastError();

   bool filled = (sent && (result.retcode == TRADE_RETCODE_DONE || result.retcode == TRADE_RETCODE_PLACED));

   PrintFormat("[FEF-V2 EXEC RESULT] ID=%s Sent=%s Retcode=%d Order=%lld Price=%.5f Vol=%.2f Err=%d",
      executionId, (sent ? "TRUE" : "FALSE"), result.retcode, result.order, result.price, result.volume, lastErr);

   // 5. Report Result back to Bridge V2
   string resultStatus = filled ? "FILLED" : "REJECTED";
   string resultJson = StringFormat(
      "{\"executionId\":\"%s\",\"status\":\"%s\",\"ticket\":%lld,\"fillPrice\":%.5f,\"filledVolume\":%.4f,\"retcode\":%d,\"comment\":\"%s\",\"executedAt\":%lld,\"failureReasonCode\":\"%s\"}",
      executionId,
      resultStatus,
      result.order,
      result.price,
      result.volume,
      result.retcode,
      JsonEscape(result.comment),
      (long)TimeCurrent() * 1000,
      filled ? "" : StringFormat("MT5_RETCODE_%d", result.retcode)
   );

   string rResp;
   HttpSend("POST", "/v2/execution/result", resultJson, rResp);
}

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   Print("=================================================");
   Print("FEF CORTEX — EXECUTION BRIDGE V2 INITIALIZING");
   PrintFormat("Bridge V2 Target: %s", InpBridgeBaseUrl);

   // Check account trade mode
   long tradeMode = AccountInfoInteger(ACCOUNT_TRADE_MODE);
   if(tradeMode == ACCOUNT_TRADE_MODE_REAL)
   {
      g_is_real_account = true;
      g_safety_lock_active = true;
      Print("*************************************************");
      Print("SAFETY ALERT: REAL ACCOUNT DETECTED (TRADE_MODE_REAL)");
      Print("Live trading is strictly HARD-LOCKED in Cortex V2.");
      Print("EA will operate in TELEMETRY ONLY mode.");
      Print("*************************************************");
   }
   else
   {
      g_is_real_account = false;
      PrintFormat("Account Mode: DEMO (Login: %lld, Company: %s)",
         AccountInfoInteger(ACCOUNT_LOGIN), AccountInfoString(ACCOUNT_COMPANY));
   }

   // Initial sync
   PushContractSpecs();
   PushAccountTelemetry();
   PushQuotesTelemetry();
   PushPositionsTelemetry();

   EventSetMillisecondTimer(InpPollIntervalMs);
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   Print("FEF CORTEX — EXECUTION BRIDGE V2 DEINITIALIZED.");
}

//+------------------------------------------------------------------+
//| Expert timer function                                            |
//+------------------------------------------------------------------+
void OnTimer()
{
   datetime now = TimeCurrent();

   // Poll commands at high cadence
   PollExecutionCommands();

   // Quotes every 1 second
   if(now - g_last_quotes_time >= 1)
   {
      PushQuotesTelemetry();
      g_last_quotes_time = now;
   }

   // Account every 2 seconds
   if(now - g_last_account_time >= 2)
   {
      PushAccountTelemetry();
      g_last_account_time = now;
   }

   // Positions every 2 seconds
   if(now - g_last_positions_time >= 2)
   {
      PushPositionsTelemetry();
      g_last_positions_time = now;
   }

   // Specs every 30 seconds
   if(now - g_last_specs_time >= 30)
   {
      PushContractSpecs();
      g_last_specs_time = now;
   }
}

//+------------------------------------------------------------------+
//| Expert tick function                                             |
//+------------------------------------------------------------------+
void OnTick()
{
   // Push live quote on tick and check execution queue
   PollExecutionCommands();
}
//+------------------------------------------------------------------+

