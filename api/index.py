"""
Vercel Serverless Entrypoint for FEF TRADING AGENT API
Handles live quotes, multi-agent debates, and trade simulator operations.
"""

from http.server import BaseHTTPRequestHandler
from dataclasses import asdict
import json
import os
import sys
import time
import urllib.parse

# Ensure project root is available in module search path
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from backend.config import config, INSTRUMENTS
from backend.data.market_feed import market_feed
from backend.data.macro_feed import macro_feed
from backend.data.public_apis import public_apis_hub
from backend.data.economic_calendar import economic_calendar
from backend.graph.trading_graph import trading_graph
from backend.execution.paper_simulator import paper_simulator
from backend.execution.mt5_socket_bridge import mt5_bridge


class handler(BaseHTTPRequestHandler):
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

        if path in ("/api/status", "/api/status/"):
            account = paper_simulator.get_account_snapshot()
            macro = macro_feed.get_macro_state()
            mt5_status = mt5_bridge.get_status()

            quotes = {}
            for sym in INSTRUMENTS:
                q = market_feed.get_live_quote(sym)
                quotes[sym] = {
                    "symbol": sym,
                    "name": INSTRUMENTS[sym].display_name,
                    "bid": q.bid,
                    "ask": q.ask,
                    "spread_pips": q.spread_pips,
                    "change_pct": q.change_pct,
                    "pip_change": q.pip_change,
                    "high_24h": q.high_24h,
                    "low_24h": q.low_24h
                }

            data = {
                "server_time": time.time(),
                "account": asdict(account),
                "macro": asdict(macro),
                "mt5_bridge": mt5_status,
                "instruments": quotes,
                "upcoming_news": economic_calendar.get_upcoming_events(3),
                "public_feeds": public_apis_hub.get_full_status()
            }
            return self._send_json(data)

        elif path in ("/api/public-feeds", "/api/public-feeds/"):
            return self._send_json(public_apis_hub.get_full_status())

        elif path in ("/api/analyze", "/api/analyze/"):
            symbol = params.get("symbol", ["XAUUSD"])[0].upper()
            if symbol not in INSTRUMENTS:
                return self._send_json({"error": f"Invalid symbol {symbol}"}, 400)

            manual_lot_raw = params.get("lot_size", [None])[0]
            manual_lot = float(manual_lot_raw) if manual_lot_raw else None

            result = trading_graph.run(symbol=symbol, account_balance=paper_simulator.balance, manual_lot=manual_lot)
            return self._send_json(result)

        elif path in ("/api/positions", "/api/positions/"):
            account = paper_simulator.get_account_snapshot()
            return self._send_json({"positions": account.open_positions, "balance": account.balance, "equity": account.equity})

        return self._send_json({"error": f"Endpoint not found: {path}"}, 404)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        length = int(self.headers.get("Content-Length", 0))
        body_raw = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"
        try:
            payload = json.loads(body_raw)
        except Exception:
            payload = {}

        if path in ("/api/execute", "/api/execute/"):
            symbol = payload.get("symbol", "XAUUSD").upper()
            if symbol not in INSTRUMENTS:
                return self._send_json({"error": f"Invalid symbol {symbol}"}, 400)

            manual_lot_raw = payload.get("lot_size") or payload.get("manual_lot")
            manual_lot = float(manual_lot_raw) if manual_lot_raw else None

            result = trading_graph.run(symbol=symbol, account_balance=paper_simulator.balance, auto_execute=True, manual_lot=manual_lot)
            return self._send_json(result)

        elif path in ("/api/quick_execute", "/api/quick_execute/"):
            symbol = payload.get("symbol", "XAUUSD").upper()
            action = payload.get("action", "BUY").upper()
            if symbol not in INSTRUMENTS:
                return self._send_json({"error": f"Invalid symbol {symbol}"}, 400)
            if action not in ["BUY", "SELL"]:
                return self._send_json({"error": f"Invalid action {action}"}, 400)

            manual_lot_raw = payload.get("lot_size") or payload.get("manual_lot")
            try:
                manual_lot = float(manual_lot_raw) if manual_lot_raw else 1.00
            except Exception:
                manual_lot = 1.00

            spec = INSTRUMENTS[symbol]
            quote = market_feed.get_live_quote(symbol)
            fill_price = quote.ask if action == "BUY" else quote.bid

            if action == "BUY":
                sl = round(fill_price - (25.0 * spec.pip_size), spec.digits)
                tp = round(fill_price + (50.0 * spec.pip_size), spec.digits)
            else:
                sl = round(fill_price + (25.0 * spec.pip_size), spec.digits)
                tp = round(fill_price - (50.0 * spec.pip_size), spec.digits)

            order = paper_simulator.execute_order(
                symbol=symbol,
                action=action,
                lots=manual_lot,
                stop_loss=sl,
                take_profit=tp,
                rationale="Instant Quick Execute from Command Deck."
            )
            return self._send_json({"status": "FILLED", "order": asdict(order)})

        elif path in ("/api/close_position", "/api/close_position/"):
            ticket = payload.get("ticket")
            if not ticket:
                return self._send_json({"error": "Missing ticket"}, 400)
            closed_order = paper_simulator.close_position(ticket)
            if closed_order:
                return self._send_json({"status": "SUCCESS", "closed_order": asdict(closed_order)})
            return self._send_json({"error": "Position not found or already closed"}, 404)

        elif path in ("/api/close_all", "/api/close_all/"):
            closed_count = paper_simulator.close_all_positions()
            return self._send_json({
                "status": "SUCCESS",
                "closed_count": closed_count,
                "message": f"Closed all open positions ({closed_count} positions closed)."
            })

        elif path in ("/api/break_even", "/api/break_even/"):
            updated_count = paper_simulator.apply_break_even()
            return self._send_json({
                "status": "SUCCESS",
                "updated_count": updated_count,
                "message": f"Moved Stop Loss to Break-Even (+1p) for {updated_count} positions."
            })

        return self._send_json({"error": f"Endpoint not found: {path}"}, 404)
