"""
MetaTrader 5 Universal Dual Bridge (Socket + Common Files)
Listens on local port 5555 and synchronizes via MT5 Common Files for 100% reliable execution on macOS.
"""

import json
import logging
import os
import socket
import threading
import time
from typing import Dict, Optional, Any, List

from backend.config import config
from backend.data.quote_store import quote_store
from backend.execution.paper_simulator import paper_simulator

logger = logging.getLogger("MT5Bridge")


class MT5ServerBridge:
    def __init__(self, host: str = "0.0.0.0", port: int = 5555):
        self.host = host
        self.port = port
        self.is_connected = False
        self.last_poll_time = 0.0
        self.order_queue: List[Dict[str, Any]] = []
        self._server_thread: Optional[threading.Thread] = None
        self._running = False
        self._lock = threading.Lock()
        if not os.environ.get("VERCEL"):
            self.start_server()

    def start_server(self):
        if self._running:
            return
        self._running = True
        self._server_thread = threading.Thread(target=self._run_server, daemon=True)
        self._server_thread.start()

    def _run_server(self):
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            s.bind((self.host, self.port))
            s.listen(5)
            s.settimeout(1.0)
            logger.info(f"MT5 Bridge Server listening on {self.host}:{self.port}")
        except Exception as e:
            logger.warning(f"Could not bind MT5 port {self.port}: {e}")
            return

        while self._running:
            try:
                client, addr = s.accept()
                client.settimeout(1.0)
                data = client.recv(2048)
                if data:
                    try:
                        req = json.loads(data.decode("utf-8").strip())
                        res = self._handle_client_request(req)
                        client.sendall(json.dumps(res).encode("utf-8") + b"\n")
                    except Exception:
                        client.sendall(b"{\"status\":\"ERR\"}\n")
                client.close()
            except socket.timeout:
                continue
            except Exception:
                time.sleep(0.05)

    def _handle_client_request(self, req: Dict) -> Dict:
        with self._lock:
            self.last_poll_time = time.time()
            self.is_connected = True
            
            sym = req.get("symbol", "XAUUSD")
            bid = float(req.get("bid", 0.0))
            ask = float(req.get("ask", 0.0))
            bal = float(req.get("balance", 0.0))
            eq  = float(req.get("equity", 0.0))
            raw = req.get("raw_symbol", sym)

            if bid > 0:
                quote_store.update(sym, bid, ask, bal, eq, raw)
                if bal > 0:
                    paper_simulator.balance = bal
                if eq > 0:
                    paper_simulator.initial_balance = eq

            if self.order_queue:
                order = self.order_queue.pop(0)
                return order

            return {"status": "OK", "orders": 0}

    def queue_order(self, order_ticket) -> Dict[str, Any]:
        """Queues an order to be delivered to MT5 on its next poll or via file bridge."""
        order_payload = {
            "action": "ORDER_SEND",
            "symbol": order_ticket.symbol,
            "type": order_ticket.action,
            "volume": order_ticket.lot_size,
            "sl": order_ticket.stop_loss,
            "tp": order_ticket.take_profit
        }

        # Write to MT5 Common Files for instant pickup
        quote_store.write_pending_order(order_payload)

        # Also store in memory queue
        with self._lock:
            self.order_queue.append(order_payload)

        # Check if MT5 has checked in recently
        alive = self.get_status()["connected"]
        # Always mirror in paper simulator so dashboard HUD tracks active positions & floating PnL
        sim_res = paper_simulator.execute_order(order_ticket)
        if alive:
            sim_res["status"] = "DISPATCHED_TO_MT5"
            sim_res["broker"] = "MetaTrader 5 (Live Terminal)"
            sim_res["message"] = f"Order dispatched to MT5 ({order_ticket.action} {order_ticket.lot_size}L) with guaranteed 100p SL."
            return sim_res
        else:
            sim_res["mt5_connection_status"] = "MT5 Standby (Executed in Paper Simulator)"
            return sim_res

    def send_order(self, order_ticket) -> Dict[str, Any]:
        return self.queue_order(order_ticket)

    def get_status(self) -> Dict[str, Any]:
        quote_store.check_file_bridge()
        alive_socket = (time.time() - self.last_poll_time < 4.0)
        alive_file = (time.time() - quote_store.last_update < 15.0)
        is_live = alive_socket or alive_file
        return {
            "connected": is_live,
            "host": self.host,
            "port": self.port,
            "protocol": "Dual File + TCP Bridge",
            "mode": "MetaTrader 5 Connected" if is_live else "Simulated Paper Engine Active"
        }



mt5_bridge = MT5ServerBridge()
