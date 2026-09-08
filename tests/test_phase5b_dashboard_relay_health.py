"""Static checks for Phase 5B relay-health and stale-quote UI."""

from pathlib import Path
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
FRONTEND_PATH = PROJECT_ROOT / "frontend" / "index.html"


class TestPhase5BDashboardRelayHealth(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = FRONTEND_PATH.read_text(encoding="utf-8")
        cls.lower_source = cls.source.lower()

    def test_compact_relay_health_area_exists(self):
        for element_id in (
            "relay-health-panel",
            "relay-health-dot",
            "relay-health-label",
            "relay-health-detail",
            "relay-bridge-detail",
        ):
            with self.subTest(element_id=element_id):
                self.assertIn(f'id="{element_id}"', self.source)
        self.assertIn("function updateRelayHealthUI", self.source)

    def test_fresh_warning_and_stale_thresholds_are_explicit(self):
        self.assertIn("const QUOTE_FRESH_MAX_AGE_SECONDS = 5", self.source)
        self.assertIn("const QUOTE_WARNING_MAX_AGE_SECONDS = 10", self.source)
        self.assertIn("ageSeconds > QUOTE_FRESH_MAX_AGE_SECONDS", self.source)
        self.assertIn("ageSeconds > QUOTE_WARNING_MAX_AGE_SECONDS", self.source)
        self.assertIn('label: "RELAY FRESH"', self.source)
        self.assertIn('label: "RELAY AGE WARNING"', self.source)
        self.assertIn('label: "RELAY STALE"', self.source)

    def test_mt5_relay_health_paths_are_clear(self):
        self.assertIn('source === "MT5_RELAY"', self.source)
        self.assertIn('healthLabel = "Relay healthy"', self.source)
        self.assertIn("Relay fresh ·", self.source)
        self.assertIn('healthLabel = "Relay age warning"', self.source)
        self.assertIn('healthLabel = "Relay stale"', self.source)

    def test_empty_fallback_and_delayed_reference_paths_are_clear(self):
        for label in (
            "Relay empty",
            "Using fallback source",
            "Using delayed reference",
            "Relay unavailable for selected instrument",
            "Reference price only",
            "Delayed non-broker reference",
            "Static fallback",
        ):
            with self.subTest(label=label):
                self.assertIn(label, self.source)
        self.assertIn('source === "YAHOO_FINANCE_CHART"', self.source)
        self.assertIn('source === "STATIC" || source === "REFERENCE_PRICES"', self.source)

    def test_file_common_is_broker_live_without_implying_relay(self):
        self.assertIn('source === "FILE_COMMON" || source === "SOCKET"', self.source)
        self.assertIn('label: "LOCAL BROKER LIVE"', self.source)
        self.assertIn("Local broker feed live · relay not active", self.source)
        self.assertIn("Local broker feed stale · relay not active", self.source)

    def test_each_visible_instrument_has_a_freshness_badge(self):
        for element_id in (
            "hero-price-freshness",
            "pip-eurusd-freshness",
            "pip-gbpusd-freshness",
            "pip-usoil-freshness",
            "pip-usdjpy-freshness",
        ):
            with self.subTest(element_id=element_id):
                self.assertIn(f'id="{element_id}"', self.source)
        self.assertIn("setFreshnessLabel(`${prefix}-freshness`, freshness)", self.source)

    def test_quick_preview_has_non_executable_and_stale_warning(self):
        self.assertIn('id="quick-price-execution-warning"', self.source)
        self.assertIn("Do not treat this as executable price.", self.source)
        self.assertIn("Do not treat this as executable price. Quote is stale.", self.source)
        self.assertIn('selectedFreshness.state !== "stale"', self.source)
        self.assertIn("selectedQuote.is_broker_quote === true", self.source)
        self.assertIn("selectedQuote.is_tradeable === true", self.source)

    def test_existing_bridge_health_fields_are_used_without_new_endpoint(self):
        self.assertIn("bridge.connected === true", self.source)
        self.assertIn("bridge.pending_acknowledgements", self.source)
        relay_helper = self.source.split(
            "function updateRelayHealthUI", 1
        )[1].split("function updateQuoteProvenance", 1)[0]
        self.assertNotIn("fetch(", relay_helper)
        self.assertNotIn("XMLHttpRequest", relay_helper)

    def test_existing_trade_controls_and_routes_are_unchanged(self):
        self.assertIn('onclick="quickExecute(\'BUY\')" id="btn-quick-buy"', self.source)
        self.assertIn('onclick="quickExecute(\'SELL\')" id="btn-quick-sell"', self.source)
        self.assertIn('fetch("/api/quick_execute"', self.source)
        self.assertIn('fetch("/api/execute"', self.source)

        relay_helper = self.source.split(
            "function updateRelayHealthUI", 1
        )[1].split("function updateQuoteProvenance", 1)[0]
        self.assertNotIn("disabled =", relay_helper)
        self.assertNotIn("quickExecute(", relay_helper)
        self.assertNotIn("executeBrokerOrder(", relay_helper)

    def test_frontend_adds_no_real_money_approval(self):
        for phrase in (
            "approved for real-money",
            "real-money approved",
            "approved for live trading",
        ):
            with self.subTest(phrase=phrase):
                self.assertNotIn(phrase, self.lower_source)


if __name__ == "__main__":
    unittest.main()
