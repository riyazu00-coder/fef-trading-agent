"""Deterministic broker-acknowledgement safety tests (no MT5 required)."""

import os
import threading
import time
import unittest
from types import SimpleNamespace
from unittest.mock import patch

os.environ.setdefault("VERCEL", "1")

from backend.execution.mt5_socket_bridge import MT5ServerBridge


class TestBrokerAcknowledgementSafety(unittest.TestCase):
    @staticmethod
    def _bridge(tcp_active=False):
        bridge = MT5ServerBridge.__new__(MT5ServerBridge)
        bridge.host = "127.0.0.1"
        bridge.port = 5555
        bridge.is_connected = tcp_active
        bridge.last_poll_time = time.time() if tcp_active else 0.0
        bridge.order_queue = []
        bridge.command_states = {}
        bridge.acknowledgements = {}
        bridge._lock = threading.Lock()
        return bridge

    @staticmethod
    def _ticket():
        return SimpleNamespace(
            symbol="EURUSD",
            action="BUY",
            lot_size=0.10,
            entry_price=1.10000,
            stop_loss=1.09000,
            take_profit=1.12000,
        )

    @staticmethod
    def _success_ack(command_id, deal_id=456, order_id=123):
        return {
            "command_id": command_id,
            "requested_symbol": "EURUSD",
            "execution_symbol": "EURUSD",
            "action": "BUY",
            "volume": 0.10,
            "price": 1.10001,
            "ticket": order_id,
            "order_id": order_id,
            "deal_id": deal_id,
            "retcode": 10009,
            "success": True,
            "status": "EXECUTED",
            "error_message": "Request completed",
        }

    def test_tcp_order_is_queued_then_pending_until_acknowledged(self):
        bridge = self._bridge(tcp_active=True)
        with (
            patch(
                "backend.execution.mt5_socket_bridge.quote_store.read_execution_acknowledgements",
                return_value=[],
            ),
            patch(
                "backend.execution.mt5_socket_bridge.paper_simulator.execute_order",
                return_value={"status": "EXECUTED", "broker": "PaperSimulator"},
            ),
            patch.object(bridge, "get_status", return_value={"connected": True}),
        ):
            response = bridge.queue_order(self._ticket())

        command_id = response["command_id"]
        self.assertEqual(response["status"], "QUEUED")
        self.assertEqual(response["paper_execution_status"], "EXECUTED")
        self.assertEqual(response["broker_acknowledgement_status"], "PENDING")

        bridge._handle_client_request(
            {"action": "POLL", "symbol": "EURUSD", "bid": 0, "ask": 0}
        )
        with patch(
            "backend.execution.mt5_socket_bridge.quote_store.read_execution_acknowledgements",
            return_value=[],
        ):
            state = bridge.get_command_status(command_id)
        self.assertEqual(state["status"], "PENDING_ACKNOWLEDGEMENT")
        self.assertEqual(state["delivery_status"], "DISPATCHED")

    def test_success_requires_valid_retcode_and_broker_identifier(self):
        bridge = self._bridge()
        with patch(
            "backend.execution.mt5_socket_bridge.quote_store.write_pending_order"
        ):
            command = bridge.queue_command(
                {
                    "action": "ORDER_SEND",
                    "type": "BUY",
                    "symbol": "EURUSD",
                    "requested_symbol": "EURUSD",
                    "volume": 0.10,
                }
            )

        state = bridge.record_acknowledgement(
            self._success_ack(command["command_id"])
        )
        self.assertEqual(state["status"], "EXECUTED")
        self.assertEqual(state["broker_status"], "EXECUTED")

        with patch(
            "backend.execution.mt5_socket_bridge.quote_store.write_pending_order"
        ):
            second = bridge.queue_command(
                {
                    "action": "ORDER_SEND",
                    "type": "BUY",
                    "symbol": "EURUSD",
                    "requested_symbol": "EURUSD",
                    "volume": 0.10,
                }
            )
        ack_without_id = self._success_ack(second["command_id"], deal_id=0, order_id=0)
        failed = bridge.record_acknowledgement(ack_without_id)
        self.assertEqual(failed["status"], "FAILED")

    def test_order_acceptance_without_deal_is_not_reported_as_executed(self):
        bridge = self._bridge()
        with patch(
            "backend.execution.mt5_socket_bridge.quote_store.write_pending_order"
        ):
            command = bridge.queue_command(
                {
                    "action": "ORDER_SEND",
                    "type": "BUY",
                    "symbol": "EURUSD",
                    "requested_symbol": "EURUSD",
                    "volume": 0.10,
                }
            )

        ack = self._success_ack(command["command_id"], deal_id=0, order_id=123)
        ack["retcode"] = 10008
        state = bridge.record_acknowledgement(ack)
        self.assertEqual(state["status"], "ACCEPTED")
        self.assertNotEqual(state["status"], "EXECUTED")

    def test_failed_and_mismatched_acknowledgements_never_report_success(self):
        bridge = self._bridge()
        with patch(
            "backend.execution.mt5_socket_bridge.quote_store.write_pending_order"
        ):
            failed_command = bridge.queue_command(
                {"action": "ORDER_SEND", "type": "BUY", "requested_symbol": "EURUSD"}
            )
            mismatch_command = bridge.queue_command(
                {"action": "ORDER_SEND", "type": "BUY", "requested_symbol": "EURUSD"}
            )

        failed_ack = self._success_ack(failed_command["command_id"])
        failed_ack.update(success=False, retcode=10019, error_message="No money")
        failed_state = bridge.record_acknowledgement(failed_ack)
        self.assertEqual(failed_state["status"], "FAILED")

        mismatch_ack = self._success_ack(mismatch_command["command_id"])
        mismatch_ack["requested_symbol"] = "GBPUSD"
        mismatch_state = bridge.record_acknowledgement(mismatch_ack)
        self.assertEqual(mismatch_state["status"], "INVALID_ACKNOWLEDGEMENT")

    def test_disconnected_mode_is_explicitly_paper_executed(self):
        bridge = self._bridge()
        with (
            patch(
                "backend.execution.mt5_socket_bridge.quote_store.write_pending_order"
            ),
            patch(
                "backend.execution.mt5_socket_bridge.quote_store.read_execution_acknowledgements",
                return_value=[],
            ),
            patch(
                "backend.execution.mt5_socket_bridge.paper_simulator.execute_order",
                return_value={"status": "EXECUTED", "broker": "PaperSimulator"},
            ),
            patch.object(bridge, "get_status", return_value={"connected": False}),
        ):
            response = bridge.queue_order(self._ticket())

        self.assertEqual(response["status"], "PAPER_EXECUTED")
        self.assertEqual(response["execution_mode"], "PAPER")
        self.assertEqual(response["broker_acknowledgement_status"], "NOT_APPLICABLE")

    def test_bridge_status_exposes_latest_acknowledgement(self):
        bridge = self._bridge()
        with patch(
            "backend.execution.mt5_socket_bridge.quote_store.write_pending_order"
        ):
            command = bridge.queue_command(
                {
                    "action": "ORDER_SEND",
                    "type": "BUY",
                    "requested_symbol": "EURUSD",
                    "volume": 0.10,
                }
            )
        acknowledgement = self._success_ack(command["command_id"])
        bridge.record_acknowledgement(acknowledgement)

        with (
            patch(
                "backend.execution.mt5_socket_bridge.quote_store.read_execution_acknowledgements",
                return_value=[],
            ),
            patch(
                "backend.execution.mt5_socket_bridge.quote_store.check_file_bridge"
            ),
        ):
            status = bridge.get_status()

        self.assertEqual(status["pending_acknowledgements"], 0)
        self.assertEqual(
            status["latest_acknowledgement"]["command_id"], command["command_id"]
        )


if __name__ == "__main__":
    unittest.main()
