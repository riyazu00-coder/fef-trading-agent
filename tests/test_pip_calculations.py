import unittest
from backend.config import INSTRUMENTS
from backend.agents.trader_agent import trader_agent
from backend.agents.technical_analyst import TechnicalAnalysisReport
from backend.agents.debate_engine import DebateOutcome
from backend.agents.risk_guardian import RiskCheckResult


class TestPipAndLotCalculations(unittest.TestCase):
    def test_instrument_specifications(self):
        self.assertIn("XAUUSD", INSTRUMENTS)
        self.assertIn("USOIL", INSTRUMENTS)
        self.assertIn("EURUSD", INSTRUMENTS)
        self.assertIn("GBPUSD", INSTRUMENTS)
        self.assertIn("USDJPY", INSTRUMENTS)

        self.assertEqual(INSTRUMENTS["XAUUSD"].contract_size, 100.0)
        self.assertEqual(INSTRUMENTS["USOIL"].contract_size, 1000.0)
        self.assertEqual(INSTRUMENTS["EURUSD"].contract_size, 100000.0)

    def test_gold_lot_calculation(self):
        """
        Account = $50,000
        Risk = 1.0% = $500
        Gold Stop = 45 pips ($4.50 distance)
        Tick value = $10.00 per pip per lot
        Expected raw lots = 500 / (45 * 10) = 1.111 -> 1.11 lots
        """
        tech_mock = TechnicalAnalysisReport(
            setup_direction="BUY",
            proposed_entry=2514.80,
            proposed_stop_loss=2510.30,
            proposed_take_profit=2528.30,
            stop_pips=45.0,
            tp_pips=135.0,
            current_price=2514.80
        )
        debate_mock = DebateOutcome(symbol="XAUUSD", approved_for_trader=True, consensus_score=0.75)
        risk_mock = RiskCheckResult(
            passed=True, status_label="PASSED", reason="OK",
            var_pct=1.2, portfolio_exposure_pct=3.5, current_spread_pips=1.2,
            max_allowed_spread_pips=4.0, news_blackout_active=False
        )

        ticket = trader_agent.create_order_ticket(
            symbol="XAUUSD",
            account_balance=50000.0,
            tech_rep=tech_mock,
            debate_rep=debate_mock,
            risk_rep=risk_mock,
            risk_pct=1.0
        )

        self.assertEqual(ticket.action, "BUY")
        self.assertEqual(ticket.lot_size, 1.11)
        self.assertAlmostEqual(ticket.cash_at_risk_usd, 499.50, delta=5.0)
        self.assertGreater(ticket.expected_profit_usd, 1400.0)
        self.assertEqual(ticket.execution_status, "READY")

    def test_eurusd_lot_calculation(self):
        """
        Account = $50,000
        Risk = 1.0% = $500
        EURUSD Stop = 20 pips
        Tick value = $10.00 per pip per lot
        Expected raw lots = 500 / (20 * 10) = 2.50 lots
        """
        tech_mock = TechnicalAnalysisReport(
            setup_direction="BUY",
            proposed_entry=1.10950,
            proposed_stop_loss=1.10750,
            proposed_take_profit=1.11550,
            stop_pips=20.0,
            tp_pips=60.0,
            current_price=1.10950
        )
        debate_mock = DebateOutcome(symbol="EURUSD", approved_for_trader=True, consensus_score=0.70)
        risk_mock = RiskCheckResult(
            passed=True, status_label="PASSED", reason="OK",
            var_pct=1.2, portfolio_exposure_pct=3.5, current_spread_pips=0.8,
            max_allowed_spread_pips=2.0, news_blackout_active=False
        )

        ticket = trader_agent.create_order_ticket(
            symbol="EURUSD",
            account_balance=50000.0,
            tech_rep=tech_mock,
            debate_rep=debate_mock,
            risk_rep=risk_mock,
            risk_pct=1.0
        )

        self.assertEqual(ticket.lot_size, 2.50)
        self.assertEqual(ticket.cash_at_risk_usd, 500.0)

    def test_manual_lot_override(self):
        tech_mock = TechnicalAnalysisReport(
            setup_direction="BUY",
            proposed_entry=4430.26,
            proposed_stop_loss=4420.26,
            proposed_take_profit=4455.26,
            stop_pips=100.0,
            tp_pips=250.0,
            current_price=4430.26
        )
        debate_mock = DebateOutcome(symbol="XAUUSD", approved_for_trader=True, consensus_score=0.80)
        risk_mock = RiskCheckResult(
            passed=True, status_label="PASSED", reason="OK",
            var_pct=1.2, portfolio_exposure_pct=3.5, current_spread_pips=0.5,
            max_allowed_spread_pips=4.0, news_blackout_active=False
        )

        # Test Manual 1.00 Lot override
        ticket_1 = trader_agent.create_order_ticket(
            symbol="XAUUSD",
            account_balance=2135254.92,
            tech_rep=tech_mock,
            debate_rep=debate_mock,
            risk_rep=risk_mock,
            manual_lot_size=1.00
        )
        self.assertEqual(ticket_1.lot_size, 1.00)
        self.assertIn("Manual lot size active: 1.0 Lots", ticket_1.rationale)

        # Test Manual 0.10 Lot override
        ticket_01 = trader_agent.create_order_ticket(
            symbol="XAUUSD",
            account_balance=50000.0,
            tech_rep=tech_mock,
            debate_rep=debate_mock,
            risk_rep=risk_mock,
            manual_lot_size=0.10
        )
        self.assertEqual(ticket_01.lot_size, 0.10)

    def test_auto_100_pips_stop_loss(self):
        from backend.agents.technical_analyst import technical_analyst
        
        # Test Gold (XAUUSD): 1 pip = 0.10, 100 pips = $10.00
        rep_gold = technical_analyst.analyze("XAUUSD")
        self.assertEqual(rep_gold.stop_pips, 100.0)
        if rep_gold.setup_direction == "BUY":
            self.assertAlmostEqual(rep_gold.proposed_entry - rep_gold.proposed_stop_loss, 10.0, places=2)
        else:
            self.assertAlmostEqual(rep_gold.proposed_stop_loss - rep_gold.proposed_entry, 10.0, places=2)

        # Test US Oil (USOIL): 1 pip = 0.01, 100 pips = $1.00
        rep_oil = technical_analyst.analyze("USOIL")
        self.assertEqual(rep_oil.stop_pips, 100.0)
        if rep_oil.setup_direction == "SELL":
            self.assertAlmostEqual(rep_oil.proposed_stop_loss - rep_oil.proposed_entry, 1.00, places=2)


if __name__ == "__main__":
    unittest.main()

