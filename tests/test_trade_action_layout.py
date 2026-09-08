"""Static checks for the responsive, locked footer action layout."""

from pathlib import Path
import re
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
FRONTEND_PATH = PROJECT_ROOT / "frontend" / "index.html"


class TestTradeActionLayout(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = FRONTEND_PATH.read_text(encoding="utf-8")

    def _button_tag(self, element_id):
        match = re.search(
            rf'<button\b[^>]*\bid="{re.escape(element_id)}"[^>]*>',
            self.source,
        )
        self.assertIsNotNone(match, element_id)
        return match.group(0)

    def test_footer_clips_horizontal_overflow(self):
        footer = re.search(r"<footer\b[^>]*>", self.source)
        self.assertIsNotNone(footer)
        self.assertIn("overflow-x-hidden", footer.group(0))

    def test_trade_deck_wraps_with_bounded_children(self):
        self.assertIn(".trade-deck-layout", self.source)
        self.assertIn("flex-wrap: wrap", self.source)
        self.assertIn(".trade-parameters", self.source)
        self.assertIn("min-width: 0", self.source)
        self.assertIn('class="trade-deck-layout', self.source)
        self.assertIn('class="trade-parameters', self.source)

    def test_action_controls_use_responsive_minmax_grid(self):
        self.assertIn(".trade-action-controls", self.source)
        self.assertIn("grid-template-columns: repeat(4, minmax(0, 1fr))", self.source)
        self.assertIn("@media (max-width: 1180px)", self.source)
        self.assertIn("grid-template-columns: repeat(2, minmax(0, 1fr))", self.source)
        self.assertIn(".trade-action-controls > button", self.source)
        self.assertIn("min-width: 0 !important", self.source)
        self.assertIn("max-width: 100%", self.source)

    def test_buy_and_sell_controls_remain_enabled_and_keep_handlers(self):
        buy = self._button_tag("btn-quick-buy")
        sell = self._button_tag("btn-quick-sell")
        self.assertIn("quickExecute('BUY')", buy)
        self.assertIn("quickExecute('SELL')", sell)
        self.assertNotIn(" disabled", buy)
        self.assertNotIn(" disabled", sell)

    def test_confirm_control_is_visibly_and_semantically_locked(self):
        confirm = self._button_tag("btn-main-execute")
        self.assertIn("executeBrokerOrder()", confirm)
        self.assertIn(" disabled", confirm)
        self.assertIn('aria-disabled="true"', confirm)
        self.assertIn("EXECUTION LOCKED", self.source)
        self.assertIn("cursor: not-allowed !important", self.source)
        self.assertNotIn("CONFIRM &amp; EXECUTE", self.source)
        self.assertNotIn("CONFIRM & EXECUTE</span>", self.source)

    def test_existing_frontend_execution_routes_are_unchanged(self):
        self.assertIn('fetch("/api/quick_execute"', self.source)
        self.assertIn('fetch("/api/execute"', self.source)
        self.assertIn("function quickExecute(action)", self.source)
        self.assertIn("function executeBrokerOrder()", self.source)


if __name__ == "__main__":
    unittest.main()
