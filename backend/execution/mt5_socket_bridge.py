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
import uuid
from typing import Dict, Optional, Any, List

from backend.config import config
from backend.data.quote_store import quote_store
from backend.execution.paper_simulator import paper_simulator

logger = logging.getLogger("MT5Bridge")

COMMAND_TTL_SECONDS = 15.0
TCP_ACTIVE_WINDOW_SECONDS = 4.0
SUCCESS_RETCODES = {10008, 10009, 10010}


class MT5ServerBridge:
    def __init__(self, host: str = "0.0.0.0", port: int = 5555):
        self.host = host
        self.port = port
        self.is_connected = False
        self.last_poll_time = 0.0
        self.order_queue: List[Dict[str, Any]] = []
        self.command_states: Dict[str, Dict[str, Any]] = {}
        self.acknowledgements: Dict[str, Dict[str, Any]] = {}
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
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            if hasattr(socket, "SO_REUSEPORT"):
                try:
                    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT, 1)
                except OSError:
                    pass
            s.bind((self.host, self.port))
            s.listen(5)
            s.settimeout(1.0)
            logger.info(f"MT5 Bridge Server listening on {self.host}:{self.port}")
        except Exception as e:
            logger.warning(f"Could not bind MT5 port {self.port}: {e}")
            self._running = False
            return

        try:
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
        finally:
            try:
                s.close()
            except Exception:
                pass

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

            # Expired TCP commands must not be delivered after a delayed poll.
            now = time.time()
            while self.order_queue:
                order = self.order_queue.pop(0)
                expires_at = order.get("expires_at")
                if expires_at is None or float(expires_at) > now:
                    self._mark_dispatched(order["command_id"])
                    return order
                state = self.command_states.get(order.get("command_id"))
                if state:
                    state["status"] = "EXPIRED"
                    state["delivery_status"] = "EXPIRED"

            return {"status": "OK", "orders": 0}

    def queue_command(
        self,
        command_payload: Dict[str, Any],
        ttl_seconds: float = COMMAND_TTL_SECONDS,
    ) -> Dict[str, Any]:
        """Deliver one logical command through exactly one active transport.

        TCP is preferred only when the EA has polled recently. Otherwise the
        Common Files bridge is used. Both transports remain supported, but the
        same command is never placed on both by this method.
        """
        now = time.time()
        command = dict(command_payload)
        command["command_id"] = uuid.uuid4().hex
        command["created_at"] = now
        command["expires_at"] = now + max(float(ttl_seconds), 0.0)

        state = {
            "command_id": command["command_id"],
            "action": command.get("action"),
            "order_action": command.get("type"),
            "volume": command.get("volume"),
            "requested_symbol": command.get("requested_symbol") or command.get("symbol"),
            "status": "QUEUED",
            "delivery_status": "QUEUED",
            "broker_status": "PENDING",
            "created_at": now,
            "expires_at": command["expires_at"],
        }

        with self._lock:
            self.command_states[command["command_id"]] = state
            tcp_active = (now - self.last_poll_time) < TCP_ACTIVE_WINDOW_SECONDS
            if tcp_active:
                command["delivery_transport"] = "TCP"
                self.order_queue.append(command)

        if not tcp_active:
            command["delivery_transport"] = "COMMON_FILES"
            quote_store.write_pending_order(command)
            with self._lock:
                self._mark_dispatched(command["command_id"])

        return command

    def _mark_dispatched(self, command_id: str):
        state = self.command_states.get(command_id)
        if state:
            state["status"] = "PENDING_ACKNOWLEDGEMENT"
            state["delivery_status"] = "DISPATCHED"

    def record_acknowledgement(self, acknowledgement: Dict[str, Any]) -> Dict[str, Any]:
        """Validate and record an MT5 broker acknowledgement by command ID."""
        command_id = str(acknowledgement.get("command_id", ""))
        with self._lock:
            state = self.command_states.get(command_id)
            if not state:
                return {"status": "IGNORED_UNKNOWN_COMMAND", "command_id": command_id}

            requested = acknowledgement.get("requested_symbol")
            action = acknowledgement.get("action")
            if requested != state.get("requested_symbol") or action != state.get("order_action"):
                state["status"] = "INVALID_ACKNOWLEDGEMENT"
                state["broker_status"] = "FAILED"
                state["error"] = "Acknowledgement command fields do not match"
                return dict(state)

            success = acknowledgement.get("success") is True
            try:
                retcode = int(acknowledgement.get("retcode", 0) or 0)
                ids = {
                    key: int(acknowledgement.get(key, 0) or 0)
                    for key in ("ticket", "order_id", "deal_id")
                }
            except (TypeError, ValueError):
                retcode = 0
                ids = {"ticket": 0, "order_id": 0, "deal_id": 0}
            broker_id = any(value > 0 for value in ids.values())
            execution_symbol = str(acknowledgement.get("execution_symbol", ""))

            if success and retcode in SUCCESS_RETCODES and broker_id and execution_symbol:
                broker_status = "EXECUTED" if ids["deal_id"] > 0 else "ACCEPTED"
                state["status"] = broker_status
                state["broker_status"] = broker_status
            else:
                state["status"] = "FAILED"
                state["broker_status"] = "FAILED"

            state["acknowledgement"] = dict(acknowledgement)
            self.acknowledgements[command_id] = dict(acknowledgement)
            return dict(state)

    def refresh_acknowledgements(self):
        for acknowledgement in quote_store.read_execution_acknowledgements():
            self.record_acknowledgement(acknowledgement)

    def get_command_status(self, command_id: str) -> Optional[Dict[str, Any]]:
        self.refresh_acknowledgements()
        with self._lock:
            state = self.command_states.get(command_id)
            return dict(state) if state else None

    def queue_order(self, order_ticket) -> Dict[str, Any]:
        """Queues an order for one-transport delivery and mirrors it in paper mode."""
        order_payload = {
            "action": "ORDER_SEND",
            "symbol": order_ticket.symbol,
            "requested_symbol": order_ticket.symbol,
            "type": order_ticket.action,
            "volume": order_ticket.lot_size,
            "sl": order_ticket.stop_loss,
            "tp": order_ticket.take_profit
        }

        command = self.queue_command(order_payload)

        # Check if MT5 has checked in recently and consume any immediate ack.
        alive = self.get_status()["connected"]
        # Always mirror in paper simulator so dashboard HUD tracks active positions & floating PnL
        sim_res = paper_simulator.execute_order(order_ticket)
        sim_res["command_id"] = command["command_id"]
        sim_res["delivery_transport"] = command["delivery_transport"]
        sim_res["command_expires_at"] = command["expires_at"]
        sim_res["requested_symbol"] = order_ticket.symbol
        # Populated only by a future broker acknowledgement; dispatch alone
        # cannot truthfully claim which symbol MT5 executed.
        sim_res["mt5_execution_symbol"] = None
        command_state = self.get_command_status(command["command_id"])
        sim_res["paper_execution_status"] = sim_res.get("status")
        sim_res["broker_acknowledgement_status"] = command_state["broker_status"]
        if command_state.get("acknowledgement"):
            sim_res["acknowledgement"] = command_state["acknowledgement"]
            sim_res["mt5_execution_symbol"] = command_state["acknowledgement"].get("execution_symbol")

        if alive:
            sim_res["status"] = command_state["status"]
            sim_res["broker"] = "MetaTrader 5 (Live Terminal)"
            sim_res["message"] = (
                f"Order {command_state['status'].lower().replace('_', ' ')} "
                f"for MT5 ({order_ticket.action} {order_ticket.lot_size}L)."
            )
            return sim_res
        else:
            sim_res["status"] = "PAPER_EXECUTED"
            sim_res["execution_mode"] = "PAPER"
            sim_res["broker_acknowledgement_status"] = "NOT_APPLICABLE"
            sim_res["mt5_connection_status"] = "MT5 Standby (Executed in Paper Simulator)"
            return sim_res

    def send_order(self, order_ticket) -> Dict[str, Any]:
        return self.queue_order(order_ticket)

    def get_status(self) -> Dict[str, Any]:
        self.refresh_acknowledgements()
        quote_store.check_file_bridge()
        alive_socket = (time.time() - self.last_poll_time < TCP_ACTIVE_WINDOW_SECONDS)
        alive_file = (time.time() - quote_store.last_update < 15.0)
        is_live = alive_socket or alive_file
        with self._lock:
            latest_ack = next(reversed(self.acknowledgements.values()), None) if self.acknowledgements else None
            pending_count = sum(
                1 for state in self.command_states.values()
                if state["status"] in ("QUEUED", "PENDING_ACKNOWLEDGEMENT")
            )
        return {
            "connected": is_live,
            "host": self.host,
            "port": self.port,
            "protocol": "Dual File + TCP Bridge",
            "mode": "MetaTrader 5 Connected" if is_live else "Simulated Paper Engine Active",
            "pending_acknowledgements": pending_count,
            "latest_acknowledgement": latest_ack,
        }



mt5_bridge = MT5ServerBridge()
