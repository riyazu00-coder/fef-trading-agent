import json
import unittest
from backend.config import INSTRUMENTS
from backend.execution.paper_simulator import paper_simulator
from backend.agents.trader_agent import OrderTicket
from backend.data.market_feed import market_feed


class TestQuickExecutionAndControls(unittest.TestCase):
    def setUp(self):
        paper_simulator.positions.clear()
        paper_simulator.closed_trades.clear()

    def test_quick_execute_buy_100_pip_sl(self):
        """Verify BUY execution strictly attaches a 100-pip Stop Loss and 200-pip Take Profit."""
        symbol = "XAUUSD"
        spec = INSTRUMENTS[symbol]
        quote = market_feed.get_live_quote(symbol)
        
        entry = quote.ask
        stop_loss = round(entry - (100.0 * spec.pip_size), spec.digits)
        take_profit = round(entry + (200.0 * spec.pip_size), spec.digits)

        ticket = OrderTicket(
            symbol=symbol,
            action="BUY",
            lot_size=1.00,
            entry_price=entry,
            stop_loss=stop_loss,
            take_profit=take_profit,
            stop_pips=100.0,
            tp_pips=200.0
        )

        res = paper_simulator.execute_order(ticket)
        self.assertIn("Simulated order", res["message"])
        self.assertEqual(len(paper_simulator.positions), 1)

        pos = list(paper_simulator.positions.values())[0]
        self.assertEqual(pos.action, "BUY")
        self.assertEqual(pos.lots, 1.00)
        self.assertAlmostEqual(pos.entry_price - pos.stop_loss, 100.0 * spec.pip_size, places=2)
        self.assertAlmostEqual(pos.take_profit - pos.entry_price, 200.0 * spec.pip_size, places=2)

    def test_quick_execute_sell_100_pip_sl(self):
        """Verify SELL execution strictly attaches a 100-pip Stop Loss and 200-pip Take Profit."""
        symbol = "EURUSD"
        spec = INSTRUMENTS[symbol]
        quote = market_feed.get_live_quote(symbol)

        entry = quote.bid
        stop_loss = round(entry + (100.0 * spec.pip_size), spec.digits)
        take_profit = round(entry - (200.0 * spec.pip_size), spec.digits)

        ticket = OrderTicket(
            symbol=symbol,
            action="SELL",
            lot_size=0.50,
            entry_price=entry,
            stop_loss=stop_loss,
            take_profit=take_profit,
            stop_pips=100.0,
            tp_pips=200.0
        )

        res = paper_simulator.execute_order(ticket)
        self.assertEqual(len(paper_simulator.positions), 1)

        pos = list(paper_simulator.positions.values())[0]
        self.assertEqual(pos.action, "SELL")
        self.assertEqual(pos.lots, 0.50)
        self.assertAlmostEqual(pos.stop_loss - pos.entry_price, 100.0 * spec.pip_size, places=4)
        self.assertAlmostEqual(pos.entry_price - pos.take_profit, 200.0 * spec.pip_size, places=4)

    def test_break_even_feature(self):
        """Verify break-even adjusts stop loss to entry price (+1 pip buffer)."""
        symbol = "XAUUSD"
        spec = INSTRUMENTS[symbol]
        quote = market_feed.get_live_quote(symbol)

        # Create a BUY position
        ticket = OrderTicket(
            symbol=symbol,
            action="BUY",
            lot_size=1.00,
            entry_price=quote.ask,
            stop_loss=round(quote.ask - 10.0, 2),
            take_profit=round(quote.ask + 20.0, 2)
        )
        paper_simulator.execute_order(ticket)
        pos = list(paper_simulator.positions.values())[0]
        initial_sl = pos.stop_loss

        # Apply Break-Even
        updated_count = paper_simulator.apply_break_even()
        self.assertEqual(updated_count, 1)
        expected_sl = round(pos.entry_price + (1.0 * spec.pip_size), spec.digits)
        self.assertEqual(pos.stop_loss, expected_sl)
        self.assertNotEqual(pos.stop_loss, initial_sl)

    def test_close_all_feature(self):
        """Verify close_all liquidates all active positions at current market quotes."""
        # Open 3 positions
        for sym in ["XAUUSD", "EURUSD", "USOIL"]:
            q = market_feed.get_live_quote(sym)
            t = OrderTicket(symbol=sym, action="BUY", lot_size=0.10, entry_price=q.ask, stop_loss=0, take_profit=0)
            paper_simulator.execute_order(t)

        self.assertEqual(len(paper_simulator.positions), 3)

        closed = paper_simulator.close_all_positions()
        self.assertEqual(closed, 3)
        self.assertEqual(len(paper_simulator.positions), 0)
        self.assertEqual(len(paper_simulator.closed_trades), 3)


if __name__ == "__main__":
    unittest.main()
