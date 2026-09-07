"""
FEF TRADING AGENT — Multi-Agent Server & API Gateway
Serves REST endpoints, runs the multi-agent graph, manages MT5/Paper execution,
and delivers the 3D Cinematic Command Center.
"""

from http.server import HTTPServer, SimpleHTTPRequestHandler, ThreadingHTTPServer
import functools
import json
import os
import socket
import sys
import time
import urllib.parse
from dataclasses import asdict

from backend.config import config, INSTRUMENTS
from backend.auth import MUTATING_ENDPOINTS, verify_bearer_token
from backend.data.market_feed import market_feed
from backend.data.macro_feed import macro_feed
from backend.data.public_apis import public_apis_hub
from backend.data.economic_calendar import economic_calendar
from backend.graph.trading_graph import trading_graph
from backend.agents.trader_agent import OrderTicket
from backend.execution.paper_simulator import paper_simulator
from backend.execution.mt5_socket_bridge import mt5_bridge


class ReusableHTTPServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def server_bind(self):
        self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        if hasattr(socket, "SO_REUSEPORT"):
            try:
                self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT, 1)
            except OSError:
                pass
        super().server_bind()


class TradingAgentsApiHandler(SimpleHTTPRequestHandler):
    def _send_json(self, data: dict, status: int = 200):
        body = json.dumps(data, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        params = urllib.parse.parse_qs(parsed.query)

        if path == "/api/status":
            account = paper_simulator.get_account_snapshot()
            macro = macro_feed.get_macro_state()
            mt5_status = mt5_bridge.get_status()

            quotes = {}
            for sym in INSTRUMENTS:
                q = market_feed.get_live_quote(sym)
                quotes[sym] = asdict(q)
                quotes[sym]["name"] = INSTRUMENTS[sym].display_name

            next_event = economic_calendar.get_next_high_impact_event()
            news_blackout = next_event.get("news_blackout", False) if next_event else False

            data = {
                "server_time": time.time(),
                "account": asdict(account),
                "macro": asdict(macro),
                "mt5_bridge": mt5_status,
                "instruments": quotes,
                "upcoming_news": economic_calendar.get_upcoming_events(3),
                "next_event": next_event,
                "news_blackout": news_blackout,
                "public_feeds": public_apis_hub.get_full_status()
            }
            return self._send_json(data)

        elif path == "/api/public-feeds":
            return self._send_json(public_apis_hub.get_full_status())

        elif path == "/api/analyze":
            symbol = params.get("symbol", ["XAUUSD"])[0].upper()
            if symbol not in INSTRUMENTS:
                return self._send_json({"error": f"Invalid symbol {symbol}"}, 400)

            manual_lot_raw = params.get("lot_size", [None])[0]
            manual_lot = float(manual_lot_raw) if manual_lot_raw else None

            result = trading_graph.run(symbol=symbol, account_balance=paper_simulator.balance, manual_lot=manual_lot)
            return self._send_json(result)

        elif path == "/api/positions":
            account = paper_simulator.get_account_snapshot()
            return self._send_json({"positions": account.open_positions, "balance": account.balance, "equity": account.equity})


        # Fallback to serving frontend static files
        super().do_GET()

    def _verify_bearer_token(self, body_raw: str = "") -> bool:
        return verify_bearer_token(
            self.headers.get("Authorization", ""), body_raw
        )

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path.rstrip("/")
        length = int(self.headers.get("Content-Length", 0))
        body_raw = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"
        try:
            payload = json.loads(body_raw)
        except Exception:
            payload = {}

        if path in MUTATING_ENDPOINTS:
            if not self._verify_bearer_token(body_raw):
                return self._send_json({
                    "error": "Unauthorized",
                    "status": "UNAUTHORIZED",
                    "message": "Missing or invalid Bearer authorization token."
                }, 401)

        if path == "/api/execute":
            symbol = payload.get("symbol", "XAUUSD").upper()
            if symbol not in INSTRUMENTS:
                return self._send_json({"error": f"Invalid symbol {symbol}"}, 400)

            manual_lot_raw = payload.get("lot_size") or payload.get("manual_lot")
            manual_lot = float(manual_lot_raw) if manual_lot_raw else None

            result = trading_graph.run(symbol=symbol, account_balance=paper_simulator.balance, auto_execute=True, manual_lot=manual_lot)
            return self._send_json(result)

        elif path == "/api/quick_execute":
            symbol = payload.get("symbol", "XAUUSD").upper()
            action = payload.get("action", "BUY").upper()
            if symbol not in INSTRUMENTS:
                return self._send_json({"error": f"Invalid symbol {symbol}"}, 400)
            if action not in ["BUY", "SELL"]:
                return self._send_json({"error": f"Invalid action {action}"}, 400)

            manual_lot_raw = payload.get("lot_size") or payload.get("manual_lot")
            try:
                manual_lot = float(manual_lot_raw) if manual_lot_raw else 1.00
            except (ValueError, TypeError):
                manual_lot = 1.00
            manual_lot = max(0.01, round(manual_lot, 2))

            spec = INSTRUMENTS[symbol]
            quote = market_feed.get_live_quote(symbol)

            # Auto 100-pip Stop Loss and 200-pip Take Profit guaranteed
            stop_dist = 100.0 * spec.pip_size
            tp_dist = 200.0 * spec.pip_size

            if action == "BUY":
                entry_price = quote.ask
                stop_loss = round(entry_price - stop_dist, spec.digits)
                take_profit = round(entry_price + tp_dist, spec.digits)
            else:
                entry_price = quote.bid
                stop_loss = round(entry_price + stop_dist, spec.digits)
                take_profit = round(entry_price - tp_dist, spec.digits)

            ticket = OrderTicket(
                symbol=symbol,
                action=action,
                lot_size=manual_lot,
                entry_price=entry_price,
                stop_loss=stop_loss,
                take_profit=take_profit,
                stop_pips=100.0,
                tp_pips=200.0,
                risk_reward_ratio=2.0,
                execution_status="READY",
                rationale=f"Instant One-Click {action} on {symbol} (100-pip SL: {stop_loss}, 200-pip TP: {take_profit})"
            )

            exec_res = mt5_bridge.send_order(ticket)
            response_status = exec_res.get("status", "PENDING_ACKNOWLEDGEMENT")
            ticket.execution_status = response_status

            return self._send_json({
                "status": response_status,
                "ticket": asdict(ticket),
                "execution_result": exec_res,
                "message": exec_res.get("message", "Order is awaiting MT5 acknowledgement.")
            })

        elif path == "/api/close_position":
            ticket = int(payload.get("ticket", 0))
            if ticket in paper_simulator.positions:
                pos = paper_simulator.positions[ticket]
                q = market_feed.get_live_quote(pos.symbol)
                exit_price = q.bid if pos.action == "BUY" else q.ask
                paper_simulator._close_position(ticket, "User Close", exit_price, pos.floating_pnl_usd)
                return self._send_json({"status": "CLOSED", "ticket": ticket, "exit_price": exit_price})
            return self._send_json({"error": f"Position {ticket} not found"}, 404)

        elif path == "/api/close_all":
            symbol = payload.get("symbol")
            if symbol:
                symbol = str(symbol).upper()
                if symbol not in INSTRUMENTS:
                    return self._send_json({"error": f"Invalid symbol {symbol}"}, 400)
            ticket_raw = payload["ticket"] if "ticket" in payload else payload.get("position_ticket")
            try:
                position_ticket = int(ticket_raw) if ticket_raw is not None else None
            except (TypeError, ValueError):
                return self._send_json({"error": "Invalid position ticket"}, 400)
            if position_ticket is not None and position_ticket <= 0:
                return self._send_json({"error": "Invalid position ticket"}, 400)

            closed_count = paper_simulator.close_all_positions(symbol=symbol, ticket_id=position_ticket)
            close_payload = {
                "action": "ORDER_CLOSE_ALL",
                "magic_number": config.server.mt5_magic_number,
            }
            if symbol:
                close_payload["requested_symbol"] = symbol
            if position_ticket is not None:
                close_payload["position_ticket"] = position_ticket
            mt5_bridge.queue_command(close_payload)
            return self._send_json({
                "status": "SUCCESS",
                "closed_count": closed_count,
                "message": f"Closed all open positions ({closed_count} positions closed)."
            })

        elif path == "/api/break_even":
            symbol = payload.get("symbol")
            if symbol:
                symbol = str(symbol).upper()
                if symbol not in INSTRUMENTS:
                    return self._send_json({"error": f"Invalid symbol {symbol}"}, 400)
            ticket_raw = payload["ticket"] if "ticket" in payload else payload.get("position_ticket")
            try:
                position_ticket = int(ticket_raw) if ticket_raw is not None else None
            except (TypeError, ValueError):
                return self._send_json({"error": "Invalid position ticket"}, 400)
            if position_ticket is not None and position_ticket <= 0:
                return self._send_json({"error": "Invalid position ticket"}, 400)

            updated_count = paper_simulator.apply_break_even(symbol=symbol, ticket_id=position_ticket)
            be_payload = {
                "action": "ORDER_BREAK_EVEN",
                "magic_number": config.server.mt5_magic_number,
            }
            if symbol:
                be_payload["requested_symbol"] = symbol
            if position_ticket is not None:
                be_payload["position_ticket"] = position_ticket
            mt5_bridge.queue_command(be_payload)
            return self._send_json({
                "status": "SUCCESS",
                "updated_count": updated_count,
                "message": f"Moved Stop Loss to Break-Even (+1p) for {updated_count} positions."
            })

        return self._send_json({"error": "Endpoint not found"}, 404)


def start_server(host: str = "0.0.0.0", port: int = 8000):
    frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend"))
    handler = functools.partial(TradingAgentsApiHandler, directory=frontend_dir)
    server = None
    for attempt in range(5):
        try:
            server = ReusableHTTPServer((host, port), handler)
            break
        except OSError as e:
            if attempt < 4:
                time.sleep(0.5)
            else:
                print(f"⚠️ Port {port} binding failed: {e}")
                raise
    try:
        mt5_bridge.start_server()
    except Exception as e:
        print(f"⚠️ MT5 bridge listener initialization: {e}")
    print(f"🚀 FEF TRADING AGENT Server running at http://localhost:{port}")
    print(f"📡 MetaTrader 5 Bridge listener configured for port {config.server.mt5_socket_port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping FEF TRADING AGENT Server...")
        server.server_close()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else config.server.port
    start_server(port=port)
