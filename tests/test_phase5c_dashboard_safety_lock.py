"""Static checks for Phase 5C dashboard safety-lock visibility."""

from pathlib import Path
import re
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
FRONTEND_PATH = PROJECT_ROOT / "frontend" / "index.html"


class TestPhase5CDashboardSafetyLock(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = FRONTEND_PATH.read_text(encoding="utf-8")
        cls.lower_source = cls.source.lower()

    def test_safety_lock_panel_is_visible_near_trade_controls(self):
        self.assertIn('id="safety-lock-panel"', self.source)
        self.assertIn('aria-label="Execution safety status"', self.source)
        self.assertLess(
            self.source.index('id="safety-lock-panel"'),
            self.source.index('id="btn-quick-buy"'),
        )

    def test_required_lock_and_mode_labels_are_present(self):
        required_labels = (
            "EXECUTION LOCKED",
            "DEMO ONLY",
            "QUOTE ONLY",
            "REAL MONEY NOT APPROVED",
            "BUY/SELL LOCKED",
            "NO LIVE EXECUTION PERMISSION",
        )
        for label in required_labels:
            with self.subTest(label=label):
                self.assertIn(label, self.source)
        self.assertIn("BUY/SELL requires future explicit unlock and approval", self.source)

    def test_risk_guardian_label_has_scope_qualifier(self):
        self.assertIn("RISK GUARDIAN ACTIVE · FULL ANALYSIS PATH", self.source)

    def test_quote_monitoring_and_relay_boundaries_are_explicit(self):
        self.assertIn(
            "Quotes are visible for monitoring only. Execution remains locked.",
            self.source,
        )
        self.assertIn("MT5 RELAY: QUOTES ONLY · NOT TRADE APPROVAL", self.source)
        self.assertIn("MT5 RELAY ACTIVE: QUOTES ONLY · NOT TRADE APPROVAL", self.source)
        self.assertIn("RELAY DOES NOT GRANT TRADE APPROVAL", self.source)

    def test_no_open_positions_notice_uses_existing_account_snapshot(self):
        self.assertIn("No open positions detected", self.source)
        self.assertIn("function updateSafetyLockVisibility(data = {})", self.source)
        helper = self.source.split(
            "function updateSafetyLockVisibility", 1
        )[1].split("function updateQuoteProvenance", 1)[0]
        self.assertIn("account.open_positions", helper)
        self.assertIn("positions.length === 0", helper)
        self.assertIn("safety lock unchanged", helper)
        self.assertNotIn("fetch(", helper)
        self.assertNotIn("closeBrokerPosition", helper)

    def test_existing_buy_sell_handlers_and_routes_remain_present(self):
        self.assertIn('onclick="quickExecute(\'BUY\')" id="btn-quick-buy"', self.source)
        self.assertIn('onclick="quickExecute(\'SELL\')" id="btn-quick-sell"', self.source)
        self.assertIn('fetch("/api/quick_execute"', self.source)
        self.assertIn('fetch("/api/execute"', self.source)
        self.assertIn("function quickExecute(action)", self.source)
        self.assertIn("function executeBrokerOrder()", self.source)

    def test_no_new_literal_api_endpoint_was_added(self):
        literal_routes = set(re.findall(r'fetch\("(/api/[^"?]+)', self.source))
        self.assertEqual(
            literal_routes,
            {
                "/api/status",
                "/api/quick_execute",
                "/api/break_even",
                "/api/close_all",
                "/api/execute",
                "/api/close_position",
            },
        )

    def test_safety_visibility_helper_does_not_change_controls(self):
        helper = self.source.split(
            "function updateSafetyLockVisibility", 1
        )[1].split("function updateQuoteProvenance", 1)[0]
        self.assertNotIn(".disabled", helper)
        self.assertNotIn("quickExecute(", helper)
        self.assertNotIn("executeBrokerOrder(", helper)
        self.assertNotIn("triggerCloseAll(", helper)
        self.assertNotIn("triggerBreakEven(", helper)

    def test_frontend_contains_no_real_money_approval(self):
        forbidden_approval = (
            "real money approved",
            "approved for real-money",
            "approved for live trading",
            "live execution approved",
        )
        for phrase in forbidden_approval:
            with self.subTest(phrase=phrase):
                self.assertNotIn(phrase, self.lower_source)
        self.assertIn("real money not approved", self.lower_source)


if __name__ == "__main__":
    unittest.main()
