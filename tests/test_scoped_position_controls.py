"""Scoped MT5 and paper position-control safety tests; no MT5 required."""

import os
from pathlib import Path
import unittest
from types import SimpleNamespace
from unittest.mock import patch

os.environ.setdefault("VERCEL", "1")

from backend.agents.trader_agent import OrderTicket
from backend.config import config
from backend.execution.mt5_socket_bridge import mt5_bridge
from backend.execution.paper_simulator import PaperSimulator, Position


class TestScopedPositionControls(unittest.TestCase):
    def test_stable_fef_magic_number_is_added_to_order_payload(self):
        self.assertEqual(config.server.mt5_magic_number, 888999)
        ticket = OrderTicket(
            symbol="EURUSD",
            action="BUY",
            lot_size=0.10,
            entry_price=1.10000,
            stop_loss=1.09000,
            take_profit=1.12000,
        )

        with (
            patch.object(mt5_bridge, "queue_command", return_value={
                "command_id": "test-command",
                "delivery_transport": "COMMON_FILES",
                "expires_at": 9999999999.0,
            }) as queue_command,
            patch.object(mt5_bridge, "get_status", return_value={"connected": False}),
            patch.object(mt5_bridge, "get_command_status", return_value={
                "status": "PENDING_ACKNOWLEDGEMENT",
                "broker_status": "PENDING",
            }),
            patch(
                "backend.execution.mt5_socket_bridge.paper_simulator.execute_order",
                return_value={"status": "EXECUTED"},
            ),
        ):
            mt5_bridge.queue_order(ticket)

        payload = queue_command.call_args.args[0]
        self.assertEqual(payload["magic_number"], 888999)
        self.assertEqual(payload["requested_symbol"], "EURUSD")

    @staticmethod
    def _position(ticket, symbol, action="BUY"):
        return Position(
            ticket_id=ticket,
            symbol=symbol,
            action=action,
            lots=0.10,
            entry_price=1.10000,
            stop_loss=1.09000,
            take_profit=1.12000,
            open_time=1.0,
        )

    def test_paper_close_all_can_be_scoped_by_symbol_and_ticket(self):
        simulator = PaperSimulator()
        simulator.positions = {
            1001: self._position(1001, "EURUSD"),
            1002: self._position(1002, "EURUSD"),
            1003: self._position(1003, "GBPUSD"),
        }

        with patch(
            "backend.execution.paper_simulator.market_feed.get_live_quote",
            return_value=SimpleNamespace(bid=1.10100, ask=1.10120),
        ):
            closed = simulator.close_all_positions(symbol="EURUSD", ticket_id=1002)

        self.assertEqual(closed, 1)
        self.assertEqual(set(simulator.positions), {1001, 1003})

    def test_paper_break_even_can_be_scoped_by_symbol_and_ticket(self):
        simulator = PaperSimulator()
        simulator.positions = {
            1001: self._position(1001, "EURUSD"),
            1002: self._position(1002, "EURUSD"),
            1003: self._position(1003, "GBPUSD"),
        }
        original_stops = {tid: pos.stop_loss for tid, pos in simulator.positions.items()}

        changed = simulator.apply_break_even(symbol="EURUSD", ticket_id=1001)

        self.assertEqual(changed, 1)
        self.assertNotEqual(simulator.positions[1001].stop_loss, original_stops[1001])
        self.assertEqual(simulator.positions[1002].stop_loss, original_stops[1002])
        self.assertEqual(simulator.positions[1003].stop_loss, original_stops[1003])

    def test_active_mql5_bridge_enforces_magic_symbol_and_ticket_scope(self):
        repo_root = Path(__file__).resolve().parents[1]
        source = (repo_root / "mql5" / "FEF_TradingAgentsBridge.mq5").read_text(
            encoding="utf-8"
        )

        self.assertIn("input ulong  InpMagicNumber  = 888999", source)
        self.assertIn('ExtractJsonLong(json, "magic_number", 0)', source)
        self.assertIn("(ulong)magic_value != InpMagicNumber", source)
        self.assertIn("PositionGetInteger(POSITION_MAGIC)", source)
        self.assertIn("PositionGetString(POSITION_SYMBOL)", source)
        self.assertIn('ExtractJsonLong(json, "position_ticket", 0)', source)
        self.assertIn("PositionMatchesFefScope(ticket, InpMagicNumber", source)
        self.assertIn("trade.SetExpertMagicNumber(InpMagicNumber)", source)

    def test_active_mql5_bridge_rejects_missing_safe_scope(self):
        repo_root = Path(__file__).resolve().parents[1]
        source = (repo_root / "mql5" / "FEF_TradingAgentsBridge.mq5").read_text(
            encoding="utf-8"
        )

        self.assertIn("Missing or mismatched FEF magic number", source)
        self.assertIn("Invalid position_ticket scope", source)
        self.assertNotIn('Print("FEF: ORDER_CLOSE_ALL executed.', source)


if __name__ == "__main__":
    unittest.main()
