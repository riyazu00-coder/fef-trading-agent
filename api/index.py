"""
Vercel Serverless Entrypoint for FEF TRADING AGENT API
Handles live quotes, multi-agent debates, and trade simulator operations.
"""

from http.server import BaseHTTPRequestHandler
from dataclasses import asdict
import json
import os
import re
import sys
import time
from typing import Optional, Tuple, Dict, Any
import urllib.parse
import urllib.request

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
from backend.agents.trader_agent import OrderTicket
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

    @staticmethod
    def _sanitize_tunnel_url(raw_url: str) -> str:
        if not raw_url:
            return ""
        raw = raw_url.strip()
        # Markdown link format [label](url)
        match = re.search(r'\((https?://[^\s)]+)\)', raw)
        if match:
            return match.group(1).strip().rstrip("/")
        # Extract http(s) URL if wrapped in brackets, quotes, or angle brackets
        http_match = re.search(r'https?://[^\s\]\)\'\"<>]+', raw)
        if http_match:
            return http_match.group(0).strip().rstrip("/")
        return raw.strip().rstrip("/")

    def _forward_to_tunnel(self, endpoint_path: str, payload: dict) -> Optional[Tuple[Dict[str, Any], int]]:
        raw_env_url = os.getenv("MT5_TUNNEL_URL", "")
        tunnel_url = self._sanitize_tunnel_url(raw_env_url)
        if not tunnel_url:
            return None

        secret = os.getenv("FEF_BRIDGE_SECRET", "fef_institutional_secure_bridge_default_key_2026").strip()
        target_url = f"{tunnel_url}{endpoint_path}"
        try:
            req_data = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(
                target_url,
                data=req_data,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {secret}",
                    "User-Agent": "FEF-Institutional-Bridge/2.4.0",
                    "Bypass-Tunnel-Reminder": "true"
                },
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=10.0) as resp:
                bridge_res = json.loads(resp.read().decode("utf-8"))
                return bridge_res, resp.status
        except urllib.error.HTTPError as e:
            try:
                raw_body = e.read().decode("utf-8", errors="replace")
            except Exception:
                raw_body = ""

            print(f"⚠️ [Tunnel Forwarding] HTTP {e.code} ({e.reason}) from {target_url}:\n{raw_body}")

            try:
                err_res = json.loads(raw_body)
            except Exception:
                err_res = {
                    "error": f"Bridge HTTP {e.code}: {e.reason}",
                    "status": "BRIDGE_ERROR",
                    "raw_response": raw_body,
                    "tunnel_url": target_url
                }

            if e.code == 503:
                err_res["status"] = "TUNNEL_UNAVAILABLE_503"
                err_res["message"] = "The tunnel endpoint returned HTTP 503 (Tunnel Offline or Local Server Not Reachable)."
                if "raw_response" not in err_res:
                    err_res["raw_response"] = raw_body

            return err_res, e.code
        except Exception as e:
            return {
                "error": "Failed to forward order to local MT5 Bridge",
                "tunnel_url": target_url,
                "details": str(e),
                "status": "TUNNEL_FAILED"
            }, 502

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
            tunnel_res = self._forward_to_tunnel("/api/execute", payload)
            if tunnel_res is not None:
                body, code = tunnel_res
                return self._send_json(body, status=code)

            symbol = payload.get("symbol", "XAUUSD").upper()
            if symbol not in INSTRUMENTS:
                return self._send_json({"error": f"Invalid symbol {symbol}"}, 400)

            manual_lot_raw = payload.get("lot_size") or payload.get("manual_lot")
            manual_lot = float(manual_lot_raw) if manual_lot_raw else None

            result = trading_graph.run(symbol=symbol, account_balance=paper_simulator.balance, auto_execute=True, manual_lot=manual_lot)
            return self._send_json(result)

        elif path in ("/api/quick_execute", "/api/quick_execute/"):
            # Check if environment variable MT5_TUNNEL_URL is configured
            tunnel_res = self._forward_to_tunnel("/api/quick_execute", payload)
            if tunnel_res is not None:
                body, code = tunnel_res
                return self._send_json(body, status=code)

            # Fallback cleanly to paper simulation and return a 200 response indicating execution was handled in-memory
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
                sl = round(fill_price - (100.0 * spec.pip_size), spec.digits)
                tp = round(fill_price + (200.0 * spec.pip_size), spec.digits)
            else:
                sl = round(fill_price + (100.0 * spec.pip_size), spec.digits)
                tp = round(fill_price - (200.0 * spec.pip_size), spec.digits)

            ticket = OrderTicket(
                symbol=symbol,
                action=action,
                lot_size=manual_lot,
                entry_price=fill_price,
                stop_loss=sl,
                take_profit=tp,
                stop_pips=100.0,
                tp_pips=200.0,
                risk_reward_ratio=2.0,
                execution_status="EXECUTED",
                rationale="Instant Quick Execute from Command Deck (In-Memory Paper Simulation)."
            )
            sim_res = paper_simulator.execute_order(ticket)
            return self._send_json({
                "status": "FILLED",
                "execution_mode": "IN_MEMORY_SIMULATION",
                "tunnel_active": False,
                "order": asdict(ticket),
                "simulation_result": sim_res,
                "message": f"Successfully executed {action} {manual_lot} Lots on {symbol} (Handled in-memory via Paper Simulator)."
            }, status=200)

        elif path in ("/api/close_position", "/api/close_position/"):
            ticket = payload.get("ticket")
            if not ticket:
                return self._send_json({"error": "Missing ticket"}, 400)
            closed_order = paper_simulator.close_position(ticket)
            if closed_order:
                return self._send_json({"status": "SUCCESS", "closed_order": asdict(closed_order)})
            return self._send_json({"error": "Position not found or already closed"}, 404)

        elif path in ("/api/close_all", "/api/close_all/"):
            tunnel_res = self._forward_to_tunnel("/api/close_all", payload)
            if tunnel_res is not None:
                body, code = tunnel_res
                return self._send_json(body, status=code)

            closed_count = paper_simulator.close_all_positions()
            return self._send_json({
                "status": "SUCCESS",
                "closed_count": closed_count,
                "message": f"Closed all open positions ({closed_count} positions closed)."
            })

        elif path in ("/api/break_even", "/api/break_even/"):
            tunnel_res = self._forward_to_tunnel("/api/break_even", payload)
            if tunnel_res is not None:
                body, code = tunnel_res
                return self._send_json(body, status=code)

            updated_count = paper_simulator.apply_break_even()
            return self._send_json({
                "status": "SUCCESS",
                "updated_count": updated_count,
                "message": f"Moved Stop Loss to Break-Even (+1p) for {updated_count} positions."
            })

        return self._send_json({"error": f"Endpoint not found: {path}"}, 404)
