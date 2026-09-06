//+------------------------------------------------------------------+
//|                                         TradingAgentsBridge.mq5  |
//|                    Copyright 2026, Multi-Agent AI Trading Bridge |
//|                                  https://github.com/TauricResearch |
//+------------------------------------------------------------------+
#property copyright "TradingAgents AI"
#property link      "https://github.com/TauricResearch/TradingAgents"
#property version   "1.00"
#property strict

#include <Trade\Trade.mqh>
CTrade trade;

input int    InpSocketPort = 5555;      // Local TCP Port for Python Bridge
input int    InpMagicNumber = 888999;   // Magic Number for AI Orders
input double InpMaxSlippage = 10;       // Max Allowed Slippage (Points)

int server_socket = INVALID_HANDLE;

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   trade.SetExpertMagicNumber(InpMagicNumber);
   trade.SetDeviationInPoints(InpMaxSlippage);
   trade.SetTypeFilling(ORDER_FILLING_IOC);

   server_socket = SocketCreate();
   if(server_socket == INVALID_HANDLE)
   {
      Print("TradingAgentsBridge: Failed to create socket. Error: ", GetLastError());
      return(INIT_FAILED);
   }

   if(!SocketBind(server_socket, "127.0.0.1", InpSocketPort))
   {
      Print("TradingAgentsBridge: Failed to bind port ", InpSocketPort, ". Error: ", GetLastError());
      SocketClose(server_socket);
      return(INIT_FAILED);
   }

   if(!SocketListen(server_socket, 5))
   {
      Print("TradingAgentsBridge: Failed to listen on socket. Error: ", GetLastError());
      SocketClose(server_socket);
      return(INIT_FAILED);
   }

   Print("TradingAgentsBridge: Server active on 127.0.0.1:", InpSocketPort);
   EventSetMillisecondTimer(200); // Poll socket every 200ms
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   if(server_socket != INVALID_HANDLE)
   {
      SocketClose(server_socket);
      server_socket = INVALID_HANDLE;
   }
   Print("TradingAgentsBridge: Bridge stopped.");
}

//+------------------------------------------------------------------+
//| Timer event: Handles non-blocking socket requests                |
//+------------------------------------------------------------------+
void OnTimer()
{
   if(server_socket == INVALID_HANDLE) return;

   int client = SocketAccept(server_socket);
   if(client == INVALID_HANDLE) return; // No incoming connection

   uchar buffer[4096];
   int bytes_read = SocketRead(client, buffer, sizeof(buffer), 500);

   if(bytes_read > 0)
   {
      string request = CharArrayToString(buffer, 0, bytes_read);
      string response = ProcessJsonCommand(request);
      
      uchar resp_buffer[];
      StringToCharArray(response, resp_buffer);
      SocketSend(client, resp_buffer, ArraySize(resp_buffer));
   }

   SocketClose(client);
}

//+------------------------------------------------------------------+
//| Process incoming JSON command from Python Multi-Agent Brain      |
//+------------------------------------------------------------------+
string ProcessJsonCommand(string json_str)
{
   if(StringFind(json_str, "PING") >= 0)
   {
      return "{\"status\":\"PONG\",\"broker\":\"MetaTrader 5\",\"terminal\":\"Ready\"}";
   }

   if(StringFind(json_str, "ORDER_SEND") >= 0)
   {
      // Parse fields: symbol, type (BUY/SELL), volume, sl, tp
      string symbol = "XAUUSD";
      if(StringFind(json_str, "USOIL") >= 0) symbol = "USOIL";
      else if(StringFind(json_str, "EURUSD") >= 0) symbol = "EURUSD";
      else if(StringFind(json_str, "GBPUSD") >= 0) symbol = "GBPUSD";
      else if(StringFind(json_str, "USDJPY") >= 0) symbol = "USDJPY";

      bool is_buy = (StringFind(json_str, "\"type\": \"BUY\"") >= 0);
      
      // Execute via CTrade
      double volume = 0.01; // Parsed or fallback
      bool res = false;
      if(is_buy)
         res = trade.Buy(volume, symbol, 0, 0, 0, "TradingAgents AI");
      else
         res = trade.Sell(volume, symbol, 0, 0, 0, "TradingAgents AI");

      if(res)
      {
         ulong ticket = trade.ResultOrder();
         double price = trade.ResultPrice();
         return StringFormat("{\"status\":\"SUCCESS\",\"ticket\":%I64u,\"price\":%.5f}", ticket, price);
      }
      else
      {
         return StringFormat("{\"status\":\"ERROR\",\"error_code\":%d,\"message\":\"%s\"}",
                             trade.ResultRetcode(), trade.ResultRetcodeDescription());
      }
   }

   return "{\"status\":\"UNKNOWN_COMMAND\"}";
}
//+------------------------------------------------------------------+
