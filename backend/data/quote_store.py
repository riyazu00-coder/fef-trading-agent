"""
Shared In-Memory Quote Store for Real-Time Broker Feeds.
Monitors both live socket connections and MT5 Common Files directory.
"""

from typing import Dict, Any, Optional
import json
import os
import time

MT5_COMMON_DIR = "/Users/mac/Library/Application Support/net.metaquotes.wine.metatrader5/drive_c/users/user/AppData/Roaming/MetaQuotes/Terminal/Common/Files"
LIVE_QUOTES_FILE = os.path.join(MT5_COMMON_DIR, "fef_live_quotes.json")
PENDING_ORDER_FILE = os.path.join(MT5_COMMON_DIR, "fef_pending_order.json")


class QuoteStore:
    def __init__(self):
        self.quotes: Dict[str, Dict[str, Any]] = {}
        self.last_update: float = 0.0

    def update(self, symbol: str, bid: float, ask: float, balance: float = 0.0, equity: float = 0.0, raw_symbol: str = ""):
        self.quotes[symbol] = {
            "bid": float(bid),
            "ask": float(ask) if ask > 0 else float(bid),
            "balance": float(balance) if balance > 0 else None,
            "equity": float(equity) if equity > 0 else None,
            "raw_symbol": raw_symbol,
            "timestamp": time.time(),
            "source": "SOCKET"
        }
        self.last_update = time.time()

    def check_file_bridge(self):
        """Reads real-time tick file written by MT5 EA."""
        if os.path.exists(LIVE_QUOTES_FILE):
            try:
                mtime = os.path.getmtime(LIVE_QUOTES_FILE)
                if time.time() - mtime < 30.0:
                    with open(LIVE_QUOTES_FILE, "rb") as f:
                        raw_bytes = f.read()

                    content = ""
                    if raw_bytes.startswith(b"\xff\xfe") or raw_bytes.startswith(b"\xfe\xff"):
                        content = raw_bytes.decode("utf-16")
                    else:
                        try:
                            content = raw_bytes.decode("utf-8")
                        except Exception:
                            content = raw_bytes.decode("utf-16", errors="ignore")

                    data = json.loads(content)
                    sym = data.get("symbol", "XAUUSD")
                    bid = float(data.get("bid", 0.0))
                    ask = float(data.get("ask", 0.0))
                    bal = float(data.get("balance", 0.0))
                    eq  = float(data.get("equity", 0.0))
                    if bid > 0:
                        self.quotes[sym] = {
                            "bid": bid,
                            "ask": ask if ask > 0 else bid,
                            "balance": bal if bal > 0 else None,
                            "equity": eq if eq > 0 else None,
                            "raw_symbol": data.get("raw_symbol", sym),
                            "timestamp": time.time(),
                            "source": "FILE_COMMON"
                        }
                        self.last_update = time.time()

                        if bal > 0:
                            try:
                                from backend.execution.paper_simulator import paper_simulator
                                paper_simulator.balance = bal
                                if eq > 0:
                                    paper_simulator.initial_balance = eq
                                    paper_simulator.mt5_equity = eq
                            except Exception:
                                pass
            except Exception:
                pass

    def get(self, symbol: str, max_age_seconds: float = 30.0) -> Optional[Dict[str, Any]]:
        self.check_file_bridge()
        now = time.time()
        for k, v in self.quotes.items():
            if k == symbol or (symbol == "XAUUSD" and "XAU" in k) or (symbol == "USOIL" and ("OIL" in k or "WTI" in k)):
                if now - v.get("timestamp", 0) <= max_age_seconds:
                    return v
        return None

    def write_pending_order(self, order_dict: dict):
        try:
            os.makedirs(MT5_COMMON_DIR, exist_ok=True)
            with open(PENDING_ORDER_FILE, "w") as f:
                json.dump(order_dict, f)
        except Exception:
            pass


quote_store = QuoteStore()
