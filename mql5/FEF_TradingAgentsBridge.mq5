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
input int    InpQuoteExportIntervalSeconds = 2; // Quote-only JSON interval (0 disables)
input int    InpQuoteMaxTickAgeSeconds = 10;    // Skip stale broker ticks
input string InpQuoteXAUUSDBrokerSymbol = "";  // Optional exact broker mapping
input string InpQuoteUSOILBrokerSymbol  = "";  // Optional exact broker mapping
input string InpQuoteEURUSDBrokerSymbol = "";  // Optional exact broker mapping
input string InpQuoteGBPUSDBrokerSymbol = "";  // Optional exact broker mapping
input string InpQuoteUSDJPYBrokerSymbol = "";  // Optional exact broker mapping

// Global Variables
CTrade trade;
ulong g_last_quote_export_ms = 0;

#define FEF_QUOTE_EXPORT_FILE      "fef_mt5_quote_snapshot.json"
#define FEF_QUOTE_EXPORT_TEMP_FILE "fef_mt5_quote_snapshot.json.tmp"

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
//| Return an operator-supplied exact quote symbol mapping            |
//+------------------------------------------------------------------+
string ConfiguredQuoteBrokerSymbol(string canonical_symbol)
{
   if(canonical_symbol == "XAUUSD") return InpQuoteXAUUSDBrokerSymbol;
   if(canonical_symbol == "USOIL")  return InpQuoteUSOILBrokerSymbol;
   if(canonical_symbol == "EURUSD") return InpQuoteEURUSDBrokerSymbol;
   if(canonical_symbol == "GBPUSD") return InpQuoteGBPUSDBrokerSymbol;
   if(canonical_symbol == "USDJPY") return InpQuoteUSDJPYBrokerSymbol;
   return "";
}

//+------------------------------------------------------------------+
//| Match only known prefix/suffix forms for quote discovery          |
//+------------------------------------------------------------------+
bool IsKnownQuoteSymbolVariant(string candidate, string canonical_symbol)
{
   StringToUpper(candidate);
   StringToUpper(canonical_symbol);
   if(candidate == canonical_symbol)
      return true;

   int position = StringFind(candidate, canonical_symbol);
   if(position < 0)
      return false;

   string prefix = StringSubstr(candidate, 0, position);
   string suffix = StringSubstr(candidate, position + StringLen(canonical_symbol));
   bool known_prefix = (StringLen(prefix) == 0 || prefix == "M" ||
                        prefix == "PRO" || prefix == "RAW");
   if(!known_prefix && StringLen(prefix) > 0)
   {
      string last_prefix_character = StringSubstr(prefix, StringLen(prefix) - 1, 1);
      known_prefix = (last_prefix_character == "." || last_prefix_character == "_" ||
                      last_prefix_character == "-" || last_prefix_character == "#");
   }

   bool known_suffix = (StringLen(suffix) == 0 || suffix == "M" ||
                        suffix == "PRO" || suffix == "RAW" || suffix == "CASH");
   if(!known_suffix && StringLen(suffix) > 0)
   {
      string first_suffix_character = StringSubstr(suffix, 0, 1);
      known_suffix = (first_suffix_character == "." || first_suffix_character == "_" ||
                      first_suffix_character == "-" || first_suffix_character == "#");
   }
   return(known_prefix && known_suffix);
}

//+------------------------------------------------------------------+
//| Select a broker symbol and require a fresh, usable MT5 tick       |
//+------------------------------------------------------------------+
bool ReadQuoteTick(string broker_symbol, MqlTick &tick)
{
   ResetLastError();
   if(!SymbolSelect(broker_symbol, true))
      return false;
   if(SymbolInfoInteger(broker_symbol, SYMBOL_TRADE_MODE) == SYMBOL_TRADE_MODE_DISABLED)
      return false;
   if(!SymbolInfoTick(broker_symbol, tick) || tick.bid <= 0.0 ||
      tick.ask < tick.bid || tick.time <= 0)
      return false;

   long age_seconds = (long)TimeCurrent() - (long)tick.time;
   if(age_seconds < 0)
      age_seconds = 0;
   return(InpQuoteMaxTickAgeSeconds > 0 &&
          age_seconds <= InpQuoteMaxTickAgeSeconds);
}

//+------------------------------------------------------------------+
//| Resolve one canonical symbol without falling back to chart symbol|
//+------------------------------------------------------------------+
bool ResolveQuoteBrokerSymbol(string canonical_symbol, string &broker_symbol,
                              MqlTick &tick)
{
   broker_symbol = "";

   // Exact broker symbol is always preferred.
   if(ReadQuoteTick(canonical_symbol, tick))
   {
      broker_symbol = canonical_symbol;
      return true;
   }

   // An operator mapping is safer than guessing an unusual broker alias.
   string configured = ConfiguredQuoteBrokerSymbol(canonical_symbol);
   if(StringLen(configured) > 0)
   {
      if(ReadQuoteTick(configured, tick))
      {
         broker_symbol = configured;
         return true;
      }
      return false;
   }

   // Discover only known prefix/suffix forms, and reject ambiguity.
   int matches = 0;
   string resolved = "";
   MqlTick resolved_tick;
   int symbol_count = SymbolsTotal(false);
   for(int i = 0; i < symbol_count; i++)
   {
      string candidate = SymbolName(i, false);
      if(candidate == canonical_symbol ||
         !IsKnownQuoteSymbolVariant(candidate, canonical_symbol))
         continue;

      MqlTick candidate_tick;
      if(ReadQuoteTick(candidate, candidate_tick))
      {
         matches++;
         resolved = candidate;
         resolved_tick = candidate_tick;
      }
   }

   if(matches != 1)
      return false;

   broker_symbol = resolved;
   tick = resolved_tick;
   return true;
}

//+------------------------------------------------------------------+
//| Build one quote-only relay object                                |
//+------------------------------------------------------------------+
bool BuildQuoteJson(string canonical_symbol, string &quote_json)
{
   string broker_symbol = "";
   MqlTick tick;
   if(!ResolveQuoteBrokerSymbol(canonical_symbol, broker_symbol, tick))
      return false;

   int digits = (int)SymbolInfoInteger(broker_symbol, SYMBOL_DIGITS);
   int calculated_digits = digits + 1;
   if(calculated_digits > 12)
      calculated_digits = 12;
   double mid = (tick.bid + tick.ask) / 2.0;
   double spread = tick.ask - tick.bid;
   long age_seconds = (long)TimeCurrent() - (long)tick.time;
   if(age_seconds < 0)
      age_seconds = 0;

   quote_json = "{\"symbol\":\"" + canonical_symbol +
                "\",\"broker_symbol\":\"" + EscapeJsonString(broker_symbol) +
                "\",\"bid\":" + DoubleToString(tick.bid, digits) +
                ",\"ask\":" + DoubleToString(tick.ask, digits) +
                ",\"mid\":" + DoubleToString(mid, calculated_digits) +
                ",\"spread\":" + DoubleToString(spread, calculated_digits) +
                ",\"timestamp\":" + IntegerToString((long)tick.time) +
                ",\"age_seconds\":" + IntegerToString(age_seconds) +
                ",\"source\":\"MT5_RELAY\"" +
                ",\"source_label\":\"MT5 LIVE\"" +
                ",\"is_broker_quote\":true" +
                ",\"is_tradeable\":true}";
   return true;
}

//+------------------------------------------------------------------+
//| Replace the public quote file only after a complete temp write   |
//+------------------------------------------------------------------+
bool WriteQuoteSnapshotAtomically(string snapshot_json)
{
   FileDelete(FEF_QUOTE_EXPORT_TEMP_FILE, FILE_COMMON);
   int handle = FileOpen(FEF_QUOTE_EXPORT_TEMP_FILE,
                         FILE_WRITE|FILE_TXT|FILE_ANSI|FILE_COMMON, 0, CP_UTF8);
   if(handle == INVALID_HANDLE)
   {
      Print("FEF quote temp-file open failed: ", GetLastError());
      return false;
   }

   uint written = FileWriteString(handle, snapshot_json);
   FileFlush(handle);
   FileClose(handle);
   if(written != StringLen(snapshot_json))
   {
      FileDelete(FEF_QUOTE_EXPORT_TEMP_FILE, FILE_COMMON);
      Print("FEF quote temp-file write was incomplete.");
      return false;
   }

   if(!FileMove(FEF_QUOTE_EXPORT_TEMP_FILE, FILE_COMMON,
                FEF_QUOTE_EXPORT_FILE, FILE_COMMON|FILE_REWRITE))
   {
      Print("FEF quote atomic replace failed: ", GetLastError());
      FileDelete(FEF_QUOTE_EXPORT_TEMP_FILE, FILE_COMMON);
      return false;
   }
   return true;
}

//+------------------------------------------------------------------+
//| Export all currently usable broker quotes; never dispatch trades |
//+------------------------------------------------------------------+
void ExportQuoteSnapshot()
{
   string canonical_symbols[5] = {
      "XAUUSD", "USOIL", "EURUSD", "GBPUSD", "USDJPY"
   };
   string snapshot_json = "{\"quotes\":[";
   int quote_count = 0;

   for(int i = 0; i < ArraySize(canonical_symbols); i++)
   {
      string quote_json = "";
      if(!BuildQuoteJson(canonical_symbols[i], quote_json))
         continue;
      if(quote_count > 0)
         snapshot_json += ",";
      snapshot_json += quote_json;
      quote_count++;
   }
   snapshot_json += "]}";

   // Retain the previous complete snapshot when no fresh ticks are available.
   // Its embedded timestamps will age out at the relay validator.
   if(quote_count > 0)
      WriteQuoteSnapshotAtomically(snapshot_json);
}

//+------------------------------------------------------------------+
//| Run quote export on its own bounded schedule                     |
//+------------------------------------------------------------------+
void ExportQuoteSnapshotIfDue()
{
   if(InpQuoteExportIntervalSeconds <= 0)
      return;
   ulong now_ms = GetTickCount64();
   ulong interval_ms = (ulong)InpQuoteExportIntervalSeconds * 1000;
   if(g_last_quote_export_ms != 0 &&
      now_ms - g_last_quote_export_ms < interval_ms)
      return;
   g_last_quote_export_ms = now_ms;
   ExportQuoteSnapshot();
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

   // Independent quote-only relay export. This does not read or dispatch
   // commands and intentionally contains no account or authentication data.
   ExportQuoteSnapshotIfDue();

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
//| Helper to parse a non-negative integer value from JSON           |
//+------------------------------------------------------------------+
long ExtractJsonLong(string json, string key, long default_val)
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
   while(start < StringLen(json) && (StringGetCharacter(json, start) == ' ' ||
                                     StringGetCharacter(json, start) == '\"'))
      start++;

   string value = "";
   while(start < StringLen(json))
   {
      ushort ch = StringGetCharacter(json, start);
      if(ch >= '0' && ch <= '9')
      {
         value += ShortToString(ch);
         start++;
      }
      else
         break;
   }

   if(StringLen(value) == 0)
      return default_val;
   return StringToInteger(value);
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
//| Validate command ID before using it in an acknowledgement path  |
//+------------------------------------------------------------------+
bool IsSafeCommandId(string command_id)
{
   int length = StringLen(command_id);
   if(length < 1 || length > 64)
      return false;
   for(int i = 0; i < length; i++)
   {
      ushort ch = StringGetCharacter(command_id, i);
      bool allowed = ((ch >= '0' && ch <= '9') ||
                      (ch >= 'a' && ch <= 'z') ||
                      (ch >= 'A' && ch <= 'Z') || ch == '-' || ch == '_');
      if(!allowed)
         return false;
   }
   return true;
}

//+------------------------------------------------------------------+
//| Escape terminal text before embedding it in JSON                 |
//+------------------------------------------------------------------+
string EscapeJsonString(string value)
{
   StringReplace(value, "\\", "\\\\");
   StringReplace(value, "\"", "\\\"");
   StringReplace(value, "\r", " ");
   StringReplace(value, "\n", " ");
   return value;
}

//+------------------------------------------------------------------+
//| Persist a structured broker acknowledgement for Python          |
//+------------------------------------------------------------------+
void PublishExecutionAcknowledgement(string command_id, string status, bool success,
                                    string requested_symbol, string execution_symbol,
                                    string action, double volume, double price,
                                    ulong order_id, ulong deal_id, uint retcode,
                                    string description)
{
   string safe_description = EscapeJsonString(description);
   string json_ack = StringFormat(
      "{\"command_id\":\"%s\",\"requested_symbol\":\"%s\",\"execution_symbol\":\"%s\","
      "\"action\":\"%s\",\"volume\":%.2f,\"price\":%.10f,\"ticket\":%I64u,"
      "\"order_id\":%I64u,\"deal_id\":%I64u,\"retcode\":%u,\"success\":%s,"
      "\"status\":\"%s\",\"error_message\":\"%s\",\"timestamp\":%I64d}",
      command_id, requested_symbol, execution_symbol, action, volume, price,
      order_id, order_id, deal_id, retcode, (success ? "true" : "false"),
      status, safe_description, (long)TimeCurrent());

   string ack_file = "fef_execution_ack_" + command_id + ".json";
   int handle = FileOpen(ack_file, FILE_WRITE|FILE_TXT|FILE_COMMON);
   if(handle != INVALID_HANDLE)
   {
      FileWriteString(handle, json_ack);
      FileClose(handle);
   }
   else
   {
      Print("FEF acknowledgement write failed for command_id=", command_id,
            " error=", GetLastError());
   }

   PrintFormat("FEF_EXECUTION_RESULT command_id=%s status=%s requested_symbol=%s execution_symbol=%s order_id=%I64u deal_id=%I64u retcode=%u message=%s",
               command_id, status, requested_symbol, execution_symbol,
               order_id, deal_id, retcode, description);
}

//+------------------------------------------------------------------+
//| Confirm a position belongs to the requested FEF scope            |
//+------------------------------------------------------------------+
bool PositionMatchesFefScope(ulong ticket, ulong magic_number,
                             string execution_symbol, ulong requested_ticket)
{
   if(ticket == 0 || (requested_ticket > 0 && ticket != requested_ticket))
      return false;
   if(!PositionSelectByTicket(ticket))
      return false;
   if((ulong)PositionGetInteger(POSITION_MAGIC) != magic_number)
      return false;
   if(StringLen(execution_symbol) > 0 &&
      PositionGetString(POSITION_SYMBOL) != execution_symbol)
      return false;
   return true;
}

//+------------------------------------------------------------------+
//| Execute orders received from Python AI Trader                    |
//+------------------------------------------------------------------+
void HandleIncomingCommand(string json)
{
   string command_action = "";
   if(StringFind(json, "ORDER_CLOSE_ALL") >= 0)
      command_action = "ORDER_CLOSE_ALL";
   else if(StringFind(json, "ORDER_BREAK_EVEN") >= 0)
      command_action = "ORDER_BREAK_EVEN";
   else if(StringFind(json, "ORDER_SEND") >= 0)
      command_action = "ORDER_SEND";
   else
      return;

   string command_id = ExtractJsonString(json, "command_id", "");
   if(!IsSafeCommandId(command_id))
   {
      Print("FEF command rejected because command_id is missing or invalid.");
      return;
   }

   string command_requested_symbol = ExtractJsonString(json, "requested_symbol", "");
   StringToUpper(command_requested_symbol);

   long magic_value = ExtractJsonLong(json, "magic_number", 0);
   if(magic_value <= 0 || (ulong)magic_value != InpMagicNumber)
   {
      PublishExecutionAcknowledgement(command_id, "FAILED", false,
                                      command_requested_symbol, "",
                                      command_action, 0.0, 0.0, 0, 0, 0,
                                      "Missing or mismatched FEF magic number");
      return;
   }

   if(command_action == "ORDER_CLOSE_ALL" || command_action == "ORDER_BREAK_EVEN")
   {
      string requested_scope_symbol = command_requested_symbol;
      string execution_scope_symbol = "";
      string scope_error = "";
      if(StringLen(requested_scope_symbol) > 0 &&
         !ResolveRequestedSymbol(requested_scope_symbol, execution_scope_symbol, scope_error))
      {
         PublishExecutionAcknowledgement(command_id, "FAILED", false,
                                         requested_scope_symbol, "",
                                         command_action, 0.0, 0.0, 0, 0, 0,
                                         scope_error);
         return;
      }

      long ticket_value = ExtractJsonLong(json, "position_ticket", 0);
      bool ticket_was_supplied = (StringFind(json, "\"position_ticket\"") >= 0);
      if(ticket_was_supplied && ticket_value <= 0)
      {
         PublishExecutionAcknowledgement(command_id, "FAILED", false,
                                         requested_scope_symbol,
                                         execution_scope_symbol, command_action,
                                         0.0, 0.0, 0, 0, 0,
                                         "Invalid position_ticket scope");
         return;
      }
      ulong requested_ticket = (ticket_value > 0 ? (ulong)ticket_value : 0);
      int matched = 0;
      int changed = 0;
      int failed = 0;
      int total = PositionsTotal();

      for(int i = total - 1; i >= 0; i--)
      {
         ulong ticket = PositionGetTicket(i);
         if(!PositionMatchesFefScope(ticket, InpMagicNumber,
                                     execution_scope_symbol, requested_ticket))
            continue;

         matched++;
         bool operation_ok = false;
         if(command_action == "ORDER_CLOSE_ALL")
         {
            operation_ok = trade.PositionClose(ticket);
         }
         else if(PositionSelectByTicket(ticket))
         {
            double open_price = PositionGetDouble(POSITION_PRICE_OPEN);
            double current_tp = PositionGetDouble(POSITION_TP);
            operation_ok = trade.PositionModify(ticket, open_price, current_tp);
         }

         if(operation_ok)
            changed++;
         else
            failed++;
      }

      string control_description = StringFormat(
         "Scoped control completed: matched=%d changed=%d failed=%d magic=%I64u",
         matched, changed, failed, InpMagicNumber);
      PublishExecutionAcknowledgement(command_id,
                                      (failed == 0 ? "COMPLETED" : "FAILED"),
                                      (failed == 0), requested_scope_symbol,
                                      execution_scope_symbol, command_action,
                                      0.0, 0.0, requested_ticket, 0,
                                      (failed == 0 ? 0 : trade.ResultRetcode()),
                                      control_description);
      return;
   }

   string requested_sym = command_requested_symbol;
   if(StringLen(requested_sym) == 0)
      requested_sym = ExtractJsonString(json, "symbol", "");
   StringToUpper(requested_sym);

   bool is_buy = (StringFind(json, "\"type\":\"BUY\"") >= 0 || StringFind(json, "\"type\": \"BUY\"") >= 0);
   string order_action = (is_buy ? "BUY" : "SELL");
   double volume = ExtractJsonDouble(json, "volume", 0.01);

   string execution_sym = "";
   string symbol_error = "";
   if(!ResolveRequestedSymbol(requested_sym, execution_sym, symbol_error))
   {
      PublishExecutionAcknowledgement(command_id, "FAILED", false, requested_sym,
                                      "", order_action, volume, 0.0, 0, 0, 0,
                                      symbol_error);
      return;
   }

   // Filling policy must come from the resolved execution symbol, not the
   // chart that happens to host this EA.
   if(!trade.SetTypeFillingBySymbol(execution_sym))
   {
      PublishExecutionAcknowledgement(command_id, "FAILED", false, requested_sym,
                                      execution_sym, order_action, volume, 0.0,
                                      0, 0, 0,
                                      "Unable to configure filling mode for execution symbol");
      return;
   }

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

   uint retcode = trade.ResultRetcode();
   ulong order_id = trade.ResultOrder();
   ulong deal_id = trade.ResultDeal();
   double result_price = trade.ResultPrice();
   bool accepted_retcode = (retcode == TRADE_RETCODE_PLACED ||
                            retcode == TRADE_RETCODE_DONE ||
                            retcode == TRADE_RETCODE_DONE_PARTIAL);
   bool acknowledged_success = (res && accepted_retcode &&
                                (order_id > 0 || deal_id > 0));
   string result_status = acknowledged_success ?
                          (deal_id > 0 ? "EXECUTED" : "ACCEPTED") : "FAILED";

   PublishExecutionAcknowledgement(command_id, result_status,
                                   acknowledged_success, requested_sym,
                                   execution_sym, order_action, volume,
                                   result_price, order_id, deal_id, retcode,
                                   trade.ResultRetcodeDescription());
}
//+------------------------------------------------------------------+
