import unittest
from backend.graph.trading_graph import trading_graph


class TestTradingGraph(unittest.TestCase):
    def test_end_to_end_gold_run(self):
        result = trading_graph.run(symbol="XAUUSD", account_balance=50000.0, risk_pct=1.0)
        self.assertEqual(result["symbol"], "XAUUSD")
        self.assertIn("macro_report", result)
        self.assertIn("commodity_report", result)
        self.assertIn("technical_report", result)
        self.assertIn("debate_outcome", result)
        self.assertIn("order_ticket", result)

        ticket = result["order_ticket"]
        self.assertEqual(ticket["action"], "BUY")
        self.assertGreater(ticket["lot_size"], 0.0)
        self.assertEqual(ticket["execution_status"], "READY")

    def test_end_to_end_oil_run(self):
        result = trading_graph.run(symbol="USOIL", account_balance=50000.0, risk_pct=0.5)
        self.assertEqual(result["symbol"], "USOIL")
        ticket = result["order_ticket"]
        self.assertEqual(ticket["action"], "SELL")
        self.assertGreater(ticket["lot_size"], 0.0)


if __name__ == "__main__":
    unittest.main()
