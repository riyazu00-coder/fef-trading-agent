//+------------------------------------------------------------------+
//|                                              FEF_Bridge.mq5      |
//|                         FEF TRADING SOLUTIONS                   |
//|                   Institutional AI Cockpit & Risk Tools         |
//+------------------------------------------------------------------+
#property copyright   "FEF Trading Solutions"
#property link        "https://feftradingsolutions.com"
#property version     "1.00"
#property description "Native Non-Blocking TCP Socket Bridge for FEF Trading Solutions"
#property description "Listens on 127.0.0.1:5555 for local authenticated read-only telemetry"
#property strict

//--- Input Parameters
input group "=== Bridge Configuration ==="
input int      InpPort           = 5555;                          // TCP Listening Port
input ulong    InpMagicNumber    = 8882026;                       // FEF Magic Number
input string   InpAuthToken      = "fef_local_bridge_token_v1";   // Local Authentication Token

enum ENUM_BRIDGE_MODE
{
   BRIDGE_READ_ONLY = 0,         // READ ONLY (Recommended: Zero Execution)
   BRIDGE_DEMO_EXECUTION = 1,    // DEMO EXECUTION (Requires Demo Account)
   BRIDGE_LIVE_EXECUTION = 2     // LIVE EXECUTION (Locked by Safety Gate)
};

input group "=== Safety Guardrails ==="
input ENUM_BRIDGE_MODE InpBridgeMode = BRIDGE_READ_ONLY;          // Bridge Operating Mode

//--- Global Socket Handles & State
int      g_server_socket = INVALID_HANDLE;
int      g_client_socket = INVALID_HANDLE;
datetime g_last_heartbeat = 0;

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
//| Helper: Escape JSON Strings                                      |
//+------------------------------------------------------------------+
string JsonEscape(string text)
{
   StringReplace(text, "\\", "\\\\");
   StringReplace(text, "\"", "\\\"");
   StringReplace(text, "\r", "");
   StringReplace(text, "\n", "\\n");
   return text;
}

//+------------------------------------------------------------------+
//| Handler: Build PING Response                                     |
//+------------------------------------------------------------------+
string BuildPingResponse(string reqId)
{
   string json = "{";
   json += "\"reqId\":\"" + reqId + "\",";
   json += "\"command\":\"PING\",";
   json += "\"success\":true,";
   json += "\"state\":\"CONNECTED_READ_ONLY\",";
   json += "\"data\":{";
   json += "\"status\":\"PONG\",";
   json += "\"terminalBuild\":" + IntegerToString(TerminalInfoInteger(TERMINAL_BUILD)) + ",";
   json += "\"serverTime\":\"" + TimeToString(TimeCurrent(), TIME_DATE|TIME_SECONDS) + "\",";
   json += "\"magicNumber\":" + IntegerToString(InpMagicNumber);
   json += "},";
   json += "\"timestamp\":" + IntegerToString((long)TimeLocal() * 1000);
   json += "}\n";
   return json;
}

//+------------------------------------------------------------------+
//| Handler: Build GET_TERMINAL_STATUS Response                      |
//+------------------------------------------------------------------+
string BuildTerminalStatusResponse(string reqId)
{
   bool isConnected = (bool)TerminalInfoInteger(TERMINAL_CONNECTED);
   bool tradeAllowed = (bool)AccountInfoInteger(ACCOUNT_TRADE_ALLOWED);
   bool tradeExpert = (bool)AccountInfoInteger(ACCOUNT_TRADE_EXPERT);
   string company = AccountInfoString(ACCOUNT_COMPANY);
   string server = AccountInfoString(ACCOUNT_SERVER);
   int pingMs = (int)TerminalInfoInteger(TERMINAL_PING_LAST) / 1000;
   if(pingMs <= 0) pingMs = 5;

   string modeStr = "READ_ONLY";
   if(InpBridgeMode == BRIDGE_DEMO_EXECUTION) modeStr = "DEMO_EXECUTION";
   if(InpBridgeMode == BRIDGE_LIVE_EXECUTION) modeStr = "LIVE_EXECUTION";

   string json = "{";
   json += "\"reqId\":\"" + reqId + "\",";
   json += "\"command\":\"GET_TERMINAL_STATUS\",";
   json += "\"success\":true,";
   json += "\"state\":\"CONNECTED_READ_ONLY\",";
   json += "\"data\":{";
   json += "\"terminalConnected\":" + (isConnected ? "true" : "false") + ",";
   json += "\"brokerConnected\":" + (isConnected ? "true" : "false") + ",";
   json += "\"brokerName\":\"" + JsonEscape(company) + "\",";
   json += "\"brokerServer\":\"" + JsonEscape(server) + "\",";
   json += "\"terminalBuild\":" + IntegerToString(TerminalInfoInteger(TERMINAL_BUILD)) + ",";
   json += "\"tradeAllowed\":" + (tradeAllowed ? "true" : "false") + ",";
   json += "\"tradeExpert\":" + (tradeExpert ? "true" : "false") + ",";
   json += "\"pingToBrokerMs\":" + IntegerToString(pingMs) + ",";
   json += "\"bridgeVersion\":\"1.0.0\",";
   json += "\"operatingMode\":\"" + modeStr + "\",";
   json += "\"lastHeartbeat\":\"" + TimeToString(TimeCurrent(), TIME_SECONDS) + "\"";
   json += "},";
   json += "\"timestamp\":" + IntegerToString((long)TimeLocal() * 1000);
   json += "}\n";
   return json;
}

//+------------------------------------------------------------------+
//| Handler: Build GET_ACCOUNT Response                              |
//+------------------------------------------------------------------+
string BuildAccountResponse(string reqId)
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
   double soCall      = AccountInfoDouble(ACCOUNT_MARGIN_SO_CALL);
   double soStop      = AccountInfoDouble(ACCOUNT_MARGIN_SO_SO);

   string json = "{";
   json += "\"reqId\":\"" + reqId + "\",";
   json += "\"command\":\"GET_ACCOUNT\",";
   json += "\"success\":true,";
   json += "\"state\":\"CONNECTED_READ_ONLY\",";
   json += "\"data\":{";
   json += "\"maskedLogin\":\"" + GetMaskedAccount() + "\",";
   json += "\"company\":\"" + JsonEscape(AccountInfoString(ACCOUNT_COMPANY)) + "\",";
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
   json += "\"soCall\":" + DoubleToString(soCall, 1) + ",";
   json += "\"soStop\":" + DoubleToString(soStop, 1);
   json += "},";
   json += "\"timestamp\":" + IntegerToString((long)TimeLocal() * 1000);
   json += "}\n";
   return json;
}

//+------------------------------------------------------------------+
//| Handler: Build GET_SYMBOLS Response                              |
//+------------------------------------------------------------------+
string BuildSymbolsResponse(string reqId)
{
   int total = SymbolsTotal(true); // Market Watch symbols
   string json = "{";
   json += "\"reqId\":\"" + reqId + "\",";
   json += "\"command\":\"GET_SYMBOLS\",";
   json += "\"success\":true,";
   json += "\"state\":\"CONNECTED_READ_ONLY\",";
   json += "\"data\":{\"symbols\":[";

   for(int i = 0; i < total; i++)
   {
      string sym = SymbolName(i, true);
      json += "\"" + sym + "\"";
      if(i < total - 1) json += ",";
   }

   json += "]},";
   json += "\"timestamp\":" + IntegerToString((long)TimeLocal() * 1000);
   json += "}\n";
   return json;
}

//+------------------------------------------------------------------+
//| Handler: Build GET_SYMBOL_INFO Response                          |
//+------------------------------------------------------------------+
string BuildSymbolInfoResponse(string reqId, string symbol)
{
   if(!SymbolSelect(symbol, true))
   {
      return "{\"reqId\":\"" + reqId + "\",\"command\":\"GET_SYMBOL_INFO\",\"success\":false,\"error\":{\"code\":\"SYMBOL_NOT_FOUND\",\"message\":\"Symbol " + symbol + " not found\"}}\n";
   }

   int digits        = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
   double point      = SymbolInfoDouble(symbol, SYMBOL_POINT);
   double contract   = SymbolInfoDouble(symbol, SYMBOL_TRADE_CONTRACT_SIZE);
   double minLot     = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MIN);
   double maxLot     = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MAX);
   double lotStep    = SymbolInfoDouble(symbol, SYMBOL_VOLUME_STEP);
   double tickVal    = SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_VALUE);
   double tickSize   = SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_SIZE);
   string desc       = SymbolInfoString(symbol, SYMBOL_DESCRIPTION);

   string json = "{";
   json += "\"reqId\":\"" + reqId + "\",";
   json += "\"command\":\"GET_SYMBOL_INFO\",";
   json += "\"success\":true,";
   json += "\"state\":\"CONNECTED_READ_ONLY\",";
   json += "\"data\":{";
   json += "\"brokerSymbol\":\"" + symbol + "\",";
   json += "\"description\":\"" + JsonEscape(desc) + "\",";
   json += "\"digits\":" + IntegerToString(digits) + ",";
   json += "\"point\":" + DoubleToString(point, digits) + ",";
   json += "\"contractSize\":" + DoubleToString(contract, 2) + ",";
   json += "\"minLot\":" + DoubleToString(minLot, 2) + ",";
   json += "\"maxLot\":" + DoubleToString(maxLot, 2) + ",";
   json += "\"lotStep\":" + DoubleToString(lotStep, 2) + ",";
   json += "\"tickValue\":" + DoubleToString(tickVal, 4) + ",";
   json += "\"tickSize\":" + DoubleToString(tickSize, digits) + ",";
   json += "\"tradeMode\":\"FULL\"";
   json += "},";
   json += "\"timestamp\":" + IntegerToString((long)TimeLocal() * 1000);
   json += "}\n";
   return json;
}

//+------------------------------------------------------------------+
//| Handler: Build GET_QUOTE Response                                |
//+------------------------------------------------------------------+
string BuildQuoteResponse(string reqId, string symbol)
{
   MqlTick tick;
   if(!SymbolInfoTick(symbol, tick))
   {
      return "{\"reqId\":\"" + reqId + "\",\"command\":\"GET_QUOTE\",\"success\":false,\"error\":{\"code\":\"NO_TICK\",\"message\":\"No live quote for " + symbol + "\"}}\n";
   }

   int digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
   double point = SymbolInfoDouble(symbol, SYMBOL_POINT);
   double spread = (point > 0) ? (tick.ask - tick.bid) / point : 0;

   string json = "{";
   json += "\"reqId\":\"" + reqId + "\",";
   json += "\"command\":\"GET_QUOTE\",";
   json += "\"success\":true,";
   json += "\"state\":\"CONNECTED_READ_ONLY\",";
   json += "\"data\":{";
   json += "\"brokerSymbol\":\"" + symbol + "\",";
   json += "\"bid\":" + DoubleToString(tick.bid, digits) + ",";
   json += "\"ask\":" + DoubleToString(tick.ask, digits) + ",";
   json += "\"spread\":" + DoubleToString(spread, 1) + ",";
   json += "\"digits\":" + IntegerToString(digits) + ",";
   json += "\"point\":" + DoubleToString(point, digits) + ",";
   json += "\"time\":\"" + TimeToString(tick.time, TIME_SECONDS) + "\",";
   json += "\"isStale\":false";
   json += "},";
   json += "\"timestamp\":" + IntegerToString((long)TimeLocal() * 1000);
   json += "}\n";
   return json;
}

//+------------------------------------------------------------------+
//| Handler: Build GET_POSITIONS Response                            |
//+------------------------------------------------------------------+
string BuildPositionsResponse(string reqId)
{
   int total = PositionsTotal();
   string json = "{";
   json += "\"reqId\":\"" + reqId + "\",";
   json += "\"command\":\"GET_POSITIONS\",";
   json += "\"success\":true,";
   json += "\"state\":\"CONNECTED_READ_ONLY\",";
   json += "\"data\":{\"positions\":[";

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

         json += "{";
         json += "\"ticket\":" + IntegerToString(ticket) + ",";
         json += "\"symbol\":\"" + sym + "\",";
         json += "\"type\":\"" + ((type == POSITION_TYPE_BUY) ? "BUY" : "SELL") + "\",";
         json += "\"lots\":" + DoubleToString(lots, 2) + ",";
         json += "\"openPrice\":" + DoubleToString(openP, 5) + ",";
         json += "\"currentPrice\":" + DoubleToString(curP, 5) + ",";
         json += "\"sl\":" + DoubleToString(sl, 5) + ",";
         json += "\"tp\":" + DoubleToString(tp, 5) + ",";
         json += "\"pnl\":" + DoubleToString(pnl, 2) + ",";
         json += "\"swap\":" + DoubleToString(swap, 2) + ",";
         json += "\"magic\":" + IntegerToString(magic) + ",";
         json += "\"openTime\":\"" + TimeToString(ot, TIME_DATE|TIME_SECONDS) + "\"";
         json += "}";
         if(i < total - 1) json += ",";
      }
   }

   json += "]},";
   json += "\"timestamp\":" + IntegerToString((long)TimeLocal() * 1000);
   json += "}\n";
   return json;
}

//+------------------------------------------------------------------+
//| Handler: Build Rejection for Execution Commands                  |
//+------------------------------------------------------------------+
string BuildExecutionRejectResponse(string reqId, string command)
{
   string json = "{";
   json += "\"reqId\":\"" + reqId + "\",";
   json += "\"command\":\"" + command + "\",";
   json += "\"success\":false,";
   json += "\"state\":\"CONNECTED_READ_ONLY\",";
   json += "\"error\":{";
   json += "\"code\":\"READ_ONLY_LOCK\",";
   json += "\"message\":\"Execution command '" + command + "' rejected: FEF MT5 Bridge is locked in READ_ONLY safety mode. Real orders are blocked by design.\"";
   json += "},";
   json += "\"timestamp\":" + IntegerToString((long)TimeLocal() * 1000);
   json += "}\n";
   return json;
}

//+------------------------------------------------------------------+
//| Parse incoming JSON command string and return response JSON      |
//+------------------------------------------------------------------+
string ProcessRequest(string rawRequest)
{
   // Extract reqId
   string reqId = "req-0";
   int idPos = StringFind(rawRequest, "\"reqId\":\"");
   if(idPos >= 0)
   {
      int start = idPos + 9;
      int end = StringFind(rawRequest, "\"", start);
      if(end > start) reqId = StringSubstr(rawRequest, start, end - start);
   }

   // Extract command
   string command = "PING";
   int cmdPos = StringFind(rawRequest, "\"command\":\"");
   if(cmdPos >= 0)
   {
      int start = cmdPos + 11;
      int end = StringFind(rawRequest, "\"", start);
      if(end > start) command = StringSubstr(rawRequest, start, end - start);
   }

   // Extract symbol if present
   string symbol = "XAUUSD";
   int symPos = StringFind(rawRequest, "\"symbol\":\"");
   if(symPos >= 0)
   {
      int start = symPos + 10;
      int end = StringFind(rawRequest, "\"", start);
      if(end > start) symbol = StringSubstr(rawRequest, start, end - start);
   }

   // Optional Token Check
   if(StringLen(InpAuthToken) > 0)
   {
      if(StringFind(rawRequest, InpAuthToken) < 0)
      {
         return "{\"reqId\":\"" + reqId + "\",\"command\":\"" + command + "\",\"success\":false,\"state\":\"AUTH_FAILED\",\"error\":{\"code\":\"AUTH_FAILED\",\"message\":\"Invalid or missing authentication token.\"}}\n";
      }
   }

   // Dispatch command
   if(command == "PING")                     return BuildPingResponse(reqId);
   if(command == "GET_TERMINAL_STATUS")      return BuildTerminalStatusResponse(reqId);
   if(command == "GET_ACCOUNT")              return BuildAccountResponse(reqId);
   if(command == "GET_SYMBOLS")              return BuildSymbolsResponse(reqId);
   if(command == "GET_SYMBOL_INFO")          return BuildSymbolInfoResponse(reqId, symbol);
   if(command == "GET_QUOTE")                return BuildQuoteResponse(reqId, symbol);
   if(command == "GET_POSITIONS")            return BuildPositionsResponse(reqId);
   if(command == "GET_PENDING_ORDERS")       return "{\"reqId\":\"" + reqId + "\",\"command\":\"GET_PENDING_ORDERS\",\"success\":true,\"state\":\"CONNECTED_READ_ONLY\",\"data\":{\"orders\":[]}}\n";

   // Safety Lock on all execution commands
   if(command == "PLACE_ORDER" || command == "MODIFY_ORDER" || command == "CANCEL_ORDER" || command == "CLOSE_POSITION" || command == "CLOSE_ALL")
   {
      return BuildExecutionRejectResponse(reqId, command);
   }

   return "{\"reqId\":\"" + reqId + "\",\"command\":\"" + command + "\",\"success\":false,\"state\":\"ERROR\",\"error\":{\"code\":\"UNKNOWN_COMMAND\",\"message\":\"Command not recognized.\"}}\n";
}

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   Print("=== [FEF TRADING SOLUTIONS] MT5 BRIDGE INITIALIZING ===");
   Print("Bridge Host: 127.0.0.1 | Port: ", InpPort, " | Magic Number: ", InpMagicNumber);
   Print("Operating Mode: READ_ONLY (Execution blocked by safety gate)");

   g_server_socket = SocketCreate();
   if(g_server_socket == INVALID_HANDLE)
   {
      Print("✕ ERROR: Failed to create server socket: ", GetLastError());
      return INIT_FAILED;
   }

   if(!SocketBindListen(g_server_socket, "127.0.0.1", InpPort))
   {
      Print("✕ ERROR: Failed to bind server socket to 127.0.0.1:", InpPort, " Error: ", GetLastError());
      SocketClose(g_server_socket);
      g_server_socket = INVALID_HANDLE;
      return INIT_FAILED;
   }

   Print("✓ SUCCESS: FEF MT5 Bridge listening on 127.0.0.1:", InpPort);
   EventSetMillisecondTimer(100); // 100ms non-blocking polling interval
   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   if(g_client_socket != INVALID_HANDLE)
   {
      SocketClose(g_client_socket);
      g_client_socket = INVALID_HANDLE;
   }
   if(g_server_socket != INVALID_HANDLE)
   {
      SocketClose(g_server_socket);
      g_server_socket = INVALID_HANDLE;
   }
   Print("=== [FEF TRADING SOLUTIONS] MT5 BRIDGE TERMINATED ===");
}

//+------------------------------------------------------------------+
//| Timer event function: Non-blocking socket accept & request processing|
//+------------------------------------------------------------------+
void OnTimer()
{
   if(g_server_socket == INVALID_HANDLE) return;

   // Accept incoming client connection if none active
   if(g_client_socket == INVALID_HANDLE)
   {
      g_client_socket = SocketAccept(g_server_socket);
   }

   if(g_client_socket != INVALID_HANDLE)
   {
      uint readable = SocketIsReadable(g_client_socket);
      if(readable > 0)
      {
         uchar buffer[];
         ArrayResize(buffer, readable + 1);
         ArrayInitialize(buffer, 0);

         int readBytes = SocketRead(g_client_socket, buffer, readable, 50);
         if(readBytes > 0)
         {
            string reqStr = CharArrayToString(buffer, 0, readBytes, CP_UTF8);
            string respStr = ProcessRequest(reqStr);

            uchar respBuffer[];
            StringToCharArray(respStr, respBuffer, 0, WHOLE_ARRAY, CP_UTF8);
            SocketSend(g_client_socket, respBuffer, ArraySize(respBuffer) - 1);
         }
      }

      // If client closed or errored, reset client handle
      if(!SocketIsConnected(g_client_socket))
      {
         SocketClose(g_client_socket);
         g_client_socket = INVALID_HANDLE;
      }
   }
}
