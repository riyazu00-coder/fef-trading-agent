"""Static checks for safe frontend stop-loss wording."""

from pathlib import Path
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
FRONTEND_PATH = PROJECT_ROOT / "frontend" / "index.html"


class TestFrontendSafetyWording(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = FRONTEND_PATH.read_text(encoding="utf-8")
        cls.lower_source = cls.source.lower()

    def test_unsafe_guaranteed_stop_loss_claim_is_absent(self):
        self.assertNotIn(
            "GUARANTEED 100-PIP STOP LOSS AUTO-ATTACHED TO ALL EXECUTIONS",
            self.source,
        )
        self.assertNotIn("guaranteed", self.lower_source)

    def test_planning_only_replacement_is_present(self):
        self.assertIn(
            "Execution locked. Stop-loss preview shown for planning only.",
            self.source,
        )

    def test_execution_lock_visibility_remains_present(self):
        self.assertIn("EXECUTION LOCKED", self.source)
        self.assertIn('id="safety-lock-panel"', self.source)
        self.assertIn('id="btn-main-execute" disabled', self.source)

    def test_no_real_money_approval_is_introduced(self):
        for phrase in (
            "real money approved",
            "approved for real-money",
            "approved for live trading",
            "live execution approved",
        ):
            with self.subTest(phrase=phrase):
                self.assertNotIn(phrase, self.lower_source)
        self.assertIn("REAL MONEY NOT APPROVED", self.source)

    def test_buy_sell_handlers_and_routes_remain_present(self):
        self.assertIn('onclick="quickExecute(\'BUY\')" id="btn-quick-buy"', self.source)
        self.assertIn('onclick="quickExecute(\'SELL\')" id="btn-quick-sell"', self.source)
        self.assertIn("function quickExecute(action)", self.source)
        self.assertIn('fetch("/api/quick_execute"', self.source)
        self.assertIn('fetch("/api/execute"', self.source)


if __name__ == "__main__":
    unittest.main()
