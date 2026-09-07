//+------------------------------------------------------------------+
//|                                         FEF_TradingAgentsBridge.mq5  |
//|                                  FEF TRADING AGENT AI Bridge     |
//|                    Copyright 2026, Multi-Agent AI Trading System |
//|                                  https://github.com/TauricResearch |
//+------------------------------------------------------------------+
#property copyright "FEF TRADING AGENT"
#property link      "https://github.com/TauricResearch/TradingAgents"
#property version   "2.20"
#property strict

#include <Trade\Trade.mqh>

// Inputs
input int    InpSocketPort   = 5555;      // Local Python Server Port
input ulong  InpMagicNumber  = 888999;    // Magic Number
input ulong  InpDeviation    = 10;        // Max Slippage (Points)
input int    InpPollInterval = 500;       // Poll Interval (Milliseconds)

// Global Variables
CTrade trade;

//+------------------------------------------------------------------+
//| Helper to normalize broker symbol to standard FEF key            |
//+------------------------------------------------------------------+
string NormalizeSymbolName(string raw_symbol)
{
   string s = raw_symbol;
   StringToUpper(s);
   if(StringFind(s, "XAU") >= 0 || StringFind(s, "GOLD") >= 0) return "XAUUSD";
   if(StringFind(s, "OIL") >= 0 || StringFind(s, "WTI") >= 0 || StringFind(s, "XTI") >= 0 || StringFind(s, "CRUDE") >= 0) return "USOIL";
   if(StringFind(s, "EURUSD") >= 0) return "EURUSD";
   if(StringFind(s, "GBPUSD") >= 0) return "GBPUSD";
   if(StringFind(s, "USDJPY") >= 0) return "USDJPY";
   return s;
}

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   trade.SetExpertMagicNumber(InpMagicNumber);
   trade.SetDeviationInPoints(InpDeviation);

   uint filling = (uint)SymbolInfoInteger(_Symbol, SYMBOL_FILLING_MODE);
   if((filling & SYMBOL_FILLING_FOK) != 0)
      trade.SetTypeFilling(ORDER_FILLING_FOK);
   else if((filling & SYMBOL_FILLING_IOC) != 0)
      trade.SetTypeFilling(ORDER_FILLING_IOC);
   else
      trade.SetTypeFilling(ORDER_FILLING_RETURN);

   EventSetMillisecondTimer(InpPollInterval);
   Print("FEF_TradingAgentsBridge v2.2: Active on ", _Symbol);
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   Comment("");
   Print("FEF_TradingAgentsBridge: Stopped.");
}

//+------------------------------------------------------------------+
//| Timer event: Updates live tick feed and checks pending orders    |
//+------------------------------------------------------------------+
void OnTimer()
{
   MqlTick last_tick;
   if(!SymbolInfoTick(_Symbol, last_tick) || last_tick.bid <= 0.0)
   {
      last_tick.bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
      last_tick.ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   }

   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   double equity  = AccountInfoDouble(ACCOUNT_EQUITY);
   string norm_sym = NormalizeSymbolName(_Symbol);

   // 1. Instant File Bridge via FILE_COMMON
   int h = FileOpen("fef_live_quotes.json", FILE_WRITE|FILE_TXT|FILE_COMMON);
   if(h != INVALID_HANDLE)
   {
      string json_quote = StringFormat("{\"symbol\":\"%s\",\"raw_symbol\":\"%s\",\"bid\":%.5f,\"ask\":%.5f,\"balance\":%.2f,\"equity\":%.2f,\"time\":%d}",
                                       norm_sym, _Symbol, last_tick.bid, last_tick.ask, balance, equity, (int)TimeCurrent());
      FileWriteString(h, json_quote);
      FileClose(h);
   }

   // 2. Check for Pending Orders from Python
   if(FileIsExist("fef_pending_order.json", FILE_COMMON))
   {
      int oh = FileOpen("fef_pending_order.json", FILE_READ|FILE_TXT|FILE_COMMON);
      if(oh != INVALID_HANDLE)
      {
         string order_json = FileReadString(oh);
         FileClose(oh);
         FileDelete("fef_pending_order.json", FILE_COMMON);
         HandleIncomingCommand(order_json);
      }
   }

   // 3. Parallel TCP Socket Bridge
   int sock = SocketCreate();
   if(sock != INVALID_HANDLE)
   {
      if(SocketConnect(sock, "127.0.0.1", InpSocketPort, 200))
      {
         string msg = StringFormat("{\"action\":\"POLL\",\"symbol\":\"%s\",\"raw_symbol\":\"%s\",\"bid\":%.5f,\"ask\":%.5f,\"balance\":%.2f,\"equity\":%.2f}\r\n",
                                   norm_sym, _Symbol, last_tick.bid, last_tick.ask, balance, equity);
         uchar send_buf[];
         int send_len = StringToCharArray(msg, send_buf, 0, StringLen(msg), CP_UTF8);
         if(SocketSend(sock, send_buf, send_len) > 0)
         {
            uchar recv_buf[2048];
            int bytes_read = SocketRead(sock, recv_buf, sizeof(recv_buf), 300);
            if(bytes_read > 0)
            {
               string response = CharArrayToString(recv_buf, 0, bytes_read, CP_UTF8);
               HandleIncomingCommand(response);
            }
         }
         SocketClose(sock);
      }
      else
      {
         SocketClose(sock);
      }
   }

   // On-Chart telemetry
   Comment(StringFormat("=========================================\n" +
                        "FEF TRADING AGENT AI BRIDGE v2.2\n" +
                        "Status: LIVE STREAMING ACTIVE\n" +
                        "Chart Symbol: %s -> Normalized: %s\n" +
                        "Live Bid: %.5f | Ask: %.5f\n" +
                        "Account Balance: $%.2f | Equity: $%.2f\n" +
                        "=========================================",
                        _Symbol, norm_sym, last_tick.bid, last_tick.ask, balance, equity));
}

//+------------------------------------------------------------------+
//| Helper to parse double value from JSON                           |
//+------------------------------------------------------------------+
double ExtractJsonDouble(string json, string key, double default_val)
{
   string search = "\"" + key + "\":";
   int pos = StringFind(json, search);
   if(pos < 0)
   {
      search = "\"" + key + "\" :";
      pos = StringFind(json, search);
      if(pos < 0) return default_val;
   }

   int start = pos + StringLen(search);
   while(start < StringLen(json) && (StringGetCharacter(json, start) == ' ' || StringGetCharacter(json, start) == '\"'))
      start++;

   string val_str = "";
   while(start < StringLen(json))
   {
      ushort ch = StringGetCharacter(json, start);
      if((ch >= '0' && ch <= '9') || ch == '.' || ch == '-')
      {
         val_str += ShortToString(ch);
         start++;
      }
      else
         break;
   }

   if(StringLen(val_str) > 0)
      return StringToDouble(val_str);

   return default_val;
}

//+------------------------------------------------------------------+
//| Helper to parse a quoted string value from JSON                  |
//+------------------------------------------------------------------+
string ExtractJsonString(string json, string key, string default_val)
{
   string search = "\"" + key + "\":";
   int pos = StringFind(json, search);
   if(pos < 0)
   {
      search = "\"" + key + "\" :";
      pos = StringFind(json, search);
      if(pos < 0) return default_val;
   }

   int start = pos + StringLen(search);
   while(start < StringLen(json) && StringGetCharacter(json, start) == ' ')
      start++;

   if(start >= StringLen(json) || StringGetCharacter(json, start) != '\"')
      return default_val;

   start++;
   int finish = start;
   while(finish < StringLen(json) && StringGetCharacter(json, finish) != '\"')
      finish++;

   if(finish <= start || finish >= StringLen(json))
      return default_val;

   return StringSubstr(json, start, finish - start);
}

//+------------------------------------------------------------------+
//| Restrict commands to the configured FEF instrument universe      |
//+------------------------------------------------------------------+
bool IsSupportedRequestedSymbol(string symbol)
{
   return(symbol == "XAUUSD" || symbol == "USOIL" ||
          symbol == "EURUSD" || symbol == "GBPUSD" ||
          symbol == "USDJPY");
}

//+------------------------------------------------------------------+
//| Select and validate an exact broker symbol                       |
//+------------------------------------------------------------------+
bool ValidateBrokerSymbol(string symbol, string &reason)
{
   ResetLastError();
   if(!SymbolSelect(symbol, true))
   {
      reason = StringFormat("SymbolSelect failed for %s (error %d)", symbol, GetLastError());
      return false;
   }

   long trade_mode = SymbolInfoInteger(symbol, SYMBOL_TRADE_MODE);
   if(trade_mode == SYMBOL_TRADE_MODE_DISABLED)
   {
      reason = StringFormat("Symbol %s is not enabled for trading", symbol);
      return false;
   }

   MqlTick tick;
   if(!SymbolInfoTick(symbol, tick) || tick.bid <= 0.0 || tick.ask <= 0.0)
   {
      reason = StringFormat("Symbol %s has no usable Market Watch tick", symbol);
      return false;
   }

   reason = "";
   return true;
}

//+------------------------------------------------------------------+
//| Resolve canonical request to one unambiguous broker symbol       |
//+------------------------------------------------------------------+
bool ResolveRequestedSymbol(string requested_symbol, string &execution_symbol, string &reason)
{
   execution_symbol = "";
   StringToUpper(requested_symbol);

   if(StringLen(requested_symbol) == 0)
   {
      reason = "Missing requested_symbol";
      return false;
   }

   if(!IsSupportedRequestedSymbol(requested_symbol))
   {
      reason = StringFormat("Unsupported requested_symbol %s", requested_symbol);
      return false;
   }

   // Prefer an exact broker symbol and never substitute the chart symbol.
   string exact_reason = "";
   if(SymbolSelect(requested_symbol, true))
   {
      if(!ValidateBrokerSymbol(requested_symbol, exact_reason))
      {
         reason = exact_reason;
         return false;
      }
      execution_symbol = requested_symbol;
      return true;
   }

   // Support broker suffixes/prefixes only when normalization produces one
   // unique, tradeable match. Ambiguity is rejected rather than guessed.
   int matches = 0;
   string resolved = "";
   int symbol_count = SymbolsTotal(false);
   for(int i = 0; i < symbol_count; i++)
   {
      string candidate = SymbolName(i, false);
      if(NormalizeSymbolName(candidate) != requested_symbol)
         continue;

      string candidate_reason = "";
      if(ValidateBrokerSymbol(candidate, candidate_reason))
      {
         matches++;
         resolved = candidate;
      }
   }

   if(matches == 0)
   {
      reason = StringFormat("No available Market Watch symbol for %s", requested_symbol);
      return false;
   }

   if(matches > 1)
   {
      reason = StringFormat("Ambiguous broker symbol mapping for %s (%d matches)", requested_symbol, matches);
      return false;
   }

   execution_symbol = resolved;
   reason = "";
   return true;
}

//+------------------------------------------------------------------+
//| Emit a structured terminal result for symbol-routing audits      |
//+------------------------------------------------------------------+
void LogExecutionResult(string status, string requested_symbol, string execution_symbol,
                        ulong order_id, uint retcode, string description)
{
   PrintFormat("FEF_EXECUTION_RESULT status=%s requested_symbol=%s execution_symbol=%s order_id=%I64u retcode=%u message=%s",
               status, requested_symbol, execution_symbol, order_id, retcode, description);
}

//+------------------------------------------------------------------+
//| Execute orders received from Python AI Trader                    |
//+------------------------------------------------------------------+
void HandleIncomingCommand(string json)
{
   if(StringFind(json, "ORDER_CLOSE_ALL") >= 0)
   {
      int total = PositionsTotal();
      int closed = 0;
      for(int i = total - 1; i >= 0; i--)
      {
         ulong ticket = PositionGetTicket(i);
         if(ticket > 0)
         {
            if(trade.PositionClose(ticket))
               closed++;
         }
      }
      Print("FEF: ORDER_CLOSE_ALL executed. Closed ", closed, " positions.");
      return;
   }

   if(StringFind(json, "ORDER_BREAK_EVEN") >= 0)
   {
      int total = PositionsTotal();
      int updated = 0;
      for(int i = total - 1; i >= 0; i--)
      {
         ulong ticket = PositionGetTicket(i);
         if(ticket > 0 && PositionSelectByTicket(ticket))
         {
            double open_price = PositionGetDouble(POSITION_PRICE_OPEN);
            double current_tp = PositionGetDouble(POSITION_TP);
            if(trade.PositionModify(ticket, open_price, current_tp))
               updated++;
         }
      }
      Print("FEF: ORDER_BREAK_EVEN executed. Modified ", updated, " positions.");
      return;
   }

   if(StringFind(json, "ORDER_SEND") < 0)
      return;

   string requested_sym = ExtractJsonString(json, "requested_symbol", "");
   if(StringLen(requested_sym) == 0)
      requested_sym = ExtractJsonString(json, "symbol", "");
   StringToUpper(requested_sym);

   string execution_sym = "";
   string symbol_error = "";
   if(!ResolveRequestedSymbol(requested_sym, execution_sym, symbol_error))
   {
      LogExecutionResult("REJECTED_SYMBOL", requested_sym, "", 0, 0, symbol_error);
      return;
   }

   // Filling policy must come from the resolved execution symbol, not the
   // chart that happens to host this EA.
   if(!trade.SetTypeFillingBySymbol(execution_sym))
   {
      LogExecutionResult("REJECTED_SYMBOL", requested_sym, execution_sym, 0, 0,
                         "Unable to configure filling mode for execution symbol");
      return;
   }

   bool is_buy = (StringFind(json, "\"type\":\"BUY\"") >= 0 || StringFind(json, "\"type\": \"BUY\"") >= 0);
   
   double volume = ExtractJsonDouble(json, "volume", 0.01);
   double sl     = ExtractJsonDouble(json, "sl", 0.0);
   double tp     = ExtractJsonDouble(json, "tp", 0.0);

   // Auto 100-pip Stop Loss safety guard if not specified
   if(sl <= 0.0)
   {
      double pt = SymbolInfoDouble(execution_sym, SYMBOL_POINT);
      int dig   = (int)SymbolInfoInteger(execution_sym, SYMBOL_DIGITS);
      double pip_val = (dig == 3 || dig == 5) ? (10.0 * pt) : (1.0 * pt);
      if(is_buy)
         sl = NormalizeDouble(SymbolInfoDouble(execution_sym, SYMBOL_BID) - (100.0 * pip_val), dig);
      else
         sl = NormalizeDouble(SymbolInfoDouble(execution_sym, SYMBOL_ASK) + (100.0 * pip_val), dig);
   }

   Print("FEF Signal: ", (is_buy ? "BUY " : "SELL "), volume,
         " Lots requested=", requested_sym, " execution=", execution_sym,
         " SL:", sl, " TP:", tp);

   bool res = false;
   if(is_buy)
      res = trade.Buy(volume, execution_sym, 0.0, sl, tp, "FEF TRADING AGENT");
   else
      res = trade.Sell(volume, execution_sym, 0.0, sl, tp, "FEF TRADING AGENT");

   if(res)
   {
      ulong ticket = trade.ResultOrder();
      LogExecutionResult("SUCCESS", requested_sym, execution_sym, ticket,
                         trade.ResultRetcode(), trade.ResultRetcodeDescription());
   }
   else
   {
      LogExecutionResult("FAILED", requested_sym, execution_sym, 0,
                         trade.ResultRetcode(), trade.ResultRetcodeDescription());
   }
}
//+------------------------------------------------------------------+
