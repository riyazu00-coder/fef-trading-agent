import unittest
from backend.agents.risk_guardian import risk_guardian
from backend.data.economic_calendar import economic_calendar


class TestRiskGuardian(unittest.TestCase):
    def setUp(self):
        # Reset calendar events to reference schedule for each test
        economic_calendar._populate_reference_events()

    def test_normal_risk_pass(self):
        res = risk_guardian.evaluate(
            symbol="XAUUSD",
            setup_direction="BUY",
            stop_pips=40.0,
            tp_pips=120.0,
            current_open_count=1
        )
        self.assertTrue(res.passed, f"Failed with status: {res.status_label}, reason: {res.reason}")
        self.assertIn("PASSED", res.status_label)

    def test_news_blackout_rejection(self):
        # Inject an event 5 minutes away
        economic_calendar.add_simulated_event(
            name="Emergency FOMC Press Conference",
            currency="USD",
            offset_seconds=300 # 5 mins
        )
        res = risk_guardian.evaluate(
            symbol="XAUUSD",
            setup_direction="BUY",
            stop_pips=40.0,
            tp_pips=120.0,
            current_open_count=0
        )
        self.assertFalse(res.passed)
        self.assertTrue(res.news_blackout_active)
        self.assertIn("REJECTED - NEWS BLACKOUT", res.status_label)

    def test_poor_risk_reward_rejection(self):
        res = risk_guardian.evaluate(
            symbol="EURUSD",
            setup_direction="BUY",
            stop_pips=50.0,
            tp_pips=40.0, # Less than 1:1 R:R
            current_open_count=0
        )
        self.assertFalse(res.passed)
        self.assertIn("POOR R:R", res.status_label)


if __name__ == "__main__":
    unittest.main()
