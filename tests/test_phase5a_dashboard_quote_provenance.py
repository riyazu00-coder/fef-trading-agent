"""Static safety checks for Phase 5A dashboard quote provenance polish."""

from pathlib import Path
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
FRONTEND_PATH = PROJECT_ROOT / "frontend" / "index.html"


class TestPhase5ADashboardQuoteProvenance(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = FRONTEND_PATH.read_text(encoding="utf-8")
        cls.lower_source = cls.source.lower()

    def test_existing_quote_provenance_fields_drive_the_ui(self):
        required_fields = (
            "quote.source",
            "quote.source_label",
            "quote.source_symbol",
            "quote.is_broker_quote",
            "quote.is_tradeable",
            "quote.age_seconds",
            "quote.spread_source",
            "quote.high_low_source",
            "quote.change_source",
        )
        for field in required_fields:
            with self.subTest(field=field):
                self.assertIn(field, self.source)
        self.assertIn("function getQuoteProvenance", self.source)
        self.assertIn("function updateQuoteProvenance", self.source)

    def test_known_sources_have_distinct_labels(self):
        mappings = (
            ('source === "MT5_RELAY"', 'return "MT5 LIVE"'),
            ('source === "FILE_COMMON"', 'return "LIVE"'),
            ('source === "YAHOO_FINANCE_CHART"', 'return "DELAYED REFERENCE"'),
            ('source === "STATIC"', 'return "FALLBACK"'),
            ('source === "REFERENCE_PRICES"', 'return "FALLBACK"'),
        )
        for condition, label in mappings:
            with self.subTest(condition=condition):
                self.assertIn(condition, self.source)
                self.assertIn(label, self.source)

    def test_broker_and_tradeability_badges_are_present(self):
        for label in (
            "BROKER QUOTE",
            "TRADEABLE",
            "NON-BROKER",
            "NON-TRADEABLE",
            "REFERENCE PRICE ONLY",
        ):
            with self.subTest(label=label):
                self.assertIn(label, self.source)
        self.assertIn('id="hero-price-broker"', self.source)
        self.assertIn('id="hero-price-tradeability"', self.source)
        self.assertIn('id="deck-entry-reference"', self.source)
        self.assertIn('id="quick-buy-reference"', self.source)
        self.assertIn('id="quick-sell-reference"', self.source)

    def test_source_symbol_and_age_are_rendered_on_hero_cards_and_entry(self):
        for element_id in (
            "hero-price-meta",
            "pip-eurusd-meta",
            "pip-gbpusd-meta",
            "pip-usoil-meta",
            "pip-usdjpy-meta",
            "deck-entry-meta",
        ):
            with self.subTest(element_id=element_id):
                self.assertIn(f'id="{element_id}"', self.source)
        self.assertIn("SOURCE: ${provenance.source}", self.source)
        self.assertIn("SYMBOL: ${provenance.sourceSymbol}", self.source)
        self.assertIn("AGE: ${provenance.ageLabel}", self.source)

    def test_simulated_derived_fields_are_labeled_explicitly(self):
        for label in (
            "SIMULATED HIGH/LOW",
            "SIMULATED CHANGE",
            "SIMULATED SPREAD",
        ):
            with self.subTest(label=label):
                self.assertIn(label, self.source)
        for element_id in (
            "pip-eurusd-derived",
            "pip-gbpusd-derived",
            "pip-usoil-derived",
            "pip-usdjpy-derived",
        ):
            with self.subTest(element_id=element_id):
                self.assertIn(f'id="{element_id}"', self.source)

    def test_reference_warning_depends_on_non_tradeability(self):
        provenance_helper = self.source.split(
            "function getQuoteProvenance", 1
        )[1].split("function updateQuoteProvenance", 1)[0]
        self.assertIn(
            "const isTradeable = isBrokerQuote && quote.is_tradeable === true",
            provenance_helper,
        )
        self.assertIn(
            "referenceOnly: displayPrice !== null && !isTradeable",
            provenance_helper,
        )

    def test_price_display_still_does_not_depend_on_tradeability(self):
        display_helper = self.source.split(
            "function getBestDisplayPrice", 1
        )[1].split("function formatDisplayPrice", 1)[0]
        self.assertNotIn("is_tradeable", display_helper)
        self.assertIn("if (mid !== null) return mid", display_helper)
        self.assertIn("(bid + ask) / 2", display_helper)

    def test_existing_trade_controls_and_routes_remain_present(self):
        self.assertIn('onclick="quickExecute(\'BUY\')" id="btn-quick-buy"', self.source)
        self.assertIn('onclick="quickExecute(\'SELL\')" id="btn-quick-sell"', self.source)
        self.assertIn('fetch("/api/quick_execute"', self.source)
        self.assertIn('fetch("/api/execute"', self.source)
        self.assertIn("function quickExecute(action)", self.source)
        self.assertIn("function executeBrokerOrder()", self.source)

        provenance_code = self.source.split(
            "function getQuoteProvenance", 1
        )[1].split("function updatePriceElement", 1)[0]
        self.assertNotIn("fetch(", provenance_code)
        self.assertNotIn("disabled =", provenance_code)

    def test_frontend_adds_no_real_money_approval(self):
        forbidden_approval = (
            "approved for real-money",
            "real-money approved",
            "approved for live trading",
        )
        for phrase in forbidden_approval:
            with self.subTest(phrase=phrase):
                self.assertNotIn(phrase, self.lower_source)


if __name__ == "__main__":
    unittest.main()
