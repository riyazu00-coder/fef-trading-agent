"""
Safety characterization tests for behavior that must be understood before fixes.

These tests intentionally document the current implementation. They use mocks and
in-memory handlers only: no MT5 terminal, network service, Common Files directory,
or real broker account is accessed.
"""

import io
import json
import os
from pathlib import Path
import threading
import unittest
from types import SimpleNamespace
from unittest.mock import patch

# Keep direct execution of this test module isolated from the production socket
# listener. No MT5 connection is needed for these in-memory characterizations.
os.environ.setdefault("VERCEL", "1")

from api.index import handler as VercelHandler
from backend.execution.mt5_socket_bridge import MT5ServerBridge
from backend.server import FEF_BRIDGE_SECRET_DEFAULT, TradingAgentsApiHandler


class HandlerTestMixin:
    def _make_handler(self, handler_class, path, payload, auth_header=None):
        raw_body = json.dumps(payload).encode("utf-8")
        request_handler = handler_class.__new__(handler_class)
        request_handler.path = path
        request_handler.rfile = io.BytesIO(raw_body)
        request_handler.wfile = io.BytesIO()
        request_handler.headers = {
            "Content-Length": str(len(raw_body)),
            "Content-Type": "application/json",
        }
        if auth_header is not None:
            request_handler.headers["Authorization"] = auth_header

        captured_status = [200]
        request_handler.send_response = lambda code: captured_status.__setitem__(0, code)
        request_handler.send_header = lambda key, value: None
        request_handler.end_headers = lambda: None
        return request_handler, captured_status

    def _run_local_post(self, path, payload, auth_header=None):
        request_handler, captured_status = self._make_handler(
            TradingAgentsApiHandler, path, payload, auth_header
        )
        request_handler.do_POST()
        response_bytes = request_handler.wfile.getvalue()
        response = json.loads(response_bytes.decode("utf-8")) if response_bytes else {}
        return captured_status[0], response


class TestBridgeDeliveryCharacterization(unittest.TestCase):
    @staticmethod
    def _isolated_bridge():
        """Create a bridge without running its socket-listener constructor."""
        bridge = MT5ServerBridge.__new__(MT5ServerBridge)
        bridge.host = "127.0.0.1"
        bridge.port = 5555
        bridge.is_connected = False
        bridge.last_poll_time = 0.0
        bridge.order_queue = []
        bridge._lock = threading.Lock()
        return bridge

    @staticmethod
    def _order(symbol="EURUSD"):
        return SimpleNamespace(
            symbol=symbol,
            action="BUY",
            lot_size=0.10,
            stop_loss=1.09000,
            take_profit=1.12000,
        )

    def test_one_dispatch_currently_populates_file_and_tcp_delivery_paths(self):
        """Characterize the duplicate-delivery risk in the dual bridge."""
        bridge = self._isolated_bridge()
        simulated_result = {"status": "EXECUTED", "message": "paper mirror only"}

        with (
            patch(
                "backend.execution.mt5_socket_bridge.quote_store.write_pending_order"
            ) as write_pending_order,
            patch(
                "backend.execution.mt5_socket_bridge.paper_simulator.execute_order",
                return_value=simulated_result,
            ),
            patch.object(bridge, "get_status", return_value={"connected": False}),
        ):
            bridge.queue_order(self._order())

        write_pending_order.assert_called_once()
        file_payload = write_pending_order.call_args.args[0]
        self.assertEqual(file_payload["action"], "ORDER_SEND")
        self.assertEqual(
            bridge.order_queue,
            [file_payload],
            "The same logical command is also retained for TCP polling.",
        )

        tcp_payload = bridge._handle_client_request(
            {"action": "POLL", "symbol": "XAUUSD", "bid": 0, "ask": 0}
        )
        self.assertEqual(tcp_payload, file_payload)
        self.assertEqual(bridge.order_queue, [])

    def test_requested_symbol_is_preserved_in_python_bridge_payload(self):
        """Python preserves the request, but cannot prove what the EA executes."""
        bridge = self._isolated_bridge()

        with (
            patch(
                "backend.execution.mt5_socket_bridge.quote_store.write_pending_order"
            ) as write_pending_order,
            patch(
                "backend.execution.mt5_socket_bridge.paper_simulator.execute_order",
                return_value={"status": "EXECUTED"},
            ),
            patch.object(bridge, "get_status", return_value={"connected": False}),
        ):
            bridge.queue_order(self._order(symbol="USDJPY"))

        payload = write_pending_order.call_args.args[0]
        self.assertEqual(payload["symbol"], "USDJPY")
        self.assertEqual(bridge.order_queue[0]["symbol"], "USDJPY")

    def test_mql5_source_currently_selects_chart_symbol_for_execution(self):
        """Static characterization; demo-terminal confirmation remains required."""
        repo_root = Path(__file__).resolve().parents[1]
        source = (repo_root / "mql5" / "FEF_TradingAgentsBridge.mq5").read_text(
            encoding="utf-8"
        )
        self.assertIn("string target_sym = _Symbol;", source)
        self.assertIn("trade.Buy(volume, target_sym", source)
        self.assertIn("trade.Sell(volume, target_sym", source)


class TestApiSafetyCharacterization(HandlerTestMixin, unittest.TestCase):
    def test_local_mutating_endpoint_authentication_matrix(self):
        """Four bulk/execution routes require auth; close_position currently does not."""
        protected = (
            "/api/execute",
            "/api/quick_execute",
            "/api/break_even",
            "/api/close_all",
        )
        for endpoint in protected:
            with self.subTest(endpoint=endpoint):
                status, response = self._run_local_post(endpoint, {})
                self.assertEqual(status, 401)
                self.assertEqual(response.get("status"), "UNAUTHORIZED")

        status, response = self._run_local_post(
            "/api/close_position", {"ticket": 999999}
        )
        self.assertEqual(
            status,
            404,
            "A 404 proves the request reached position lookup without Bearer auth.",
        )
        self.assertIn("not found", response.get("error", ""))

    def test_quick_execute_bypasses_graph_and_risk_guardian(self):
        """Characterize direct ticket dispatch without debate/risk evaluation."""
        quote = SimpleNamespace(bid=2500.00, ask=2500.20)
        execution_result = {"status": "EXECUTED", "broker": "mock only"}

        with (
            patch.dict(os.environ, {"FEF_BRIDGE_SECRET": FEF_BRIDGE_SECRET_DEFAULT}),
            patch("backend.server.market_feed.get_live_quote", return_value=quote),
            patch("backend.server.trading_graph.run") as graph_run,
            patch("backend.graph.trading_graph.risk_guardian.evaluate") as risk_evaluate,
            patch(
                "backend.server.mt5_bridge.send_order", return_value=execution_result
            ) as send_order,
        ):
            status, response = self._run_local_post(
                "/api/quick_execute",
                {"symbol": "XAUUSD", "action": "BUY", "lot_size": 0.10},
                auth_header=f"Bearer {FEF_BRIDGE_SECRET_DEFAULT}",
            )

        self.assertEqual(status, 200)
        self.assertEqual(response["status"], "EXECUTED")
        graph_run.assert_not_called()
        risk_evaluate.assert_not_called()
        send_order.assert_called_once()

    def test_vercel_close_position_exposes_missing_simulator_method(self):
        """The current Vercel route raises before it can return an API response."""
        self.assertFalse(hasattr(__import__(
            "backend.execution.paper_simulator",
            fromlist=["paper_simulator"],
        ).paper_simulator, "close_position"))

        request_handler, _ = self._make_handler(
            VercelHandler,
            "/api/close_position",
            {"ticket": 999999},
        )
        with self.assertRaisesRegex(AttributeError, "close_position"):
            request_handler.do_POST()


if __name__ == "__main__":
    unittest.main()
