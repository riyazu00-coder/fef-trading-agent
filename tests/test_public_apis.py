"""
Unit and integration tests for FEF TRADING AGENT Public APIs integration.
"""

import unittest
from backend.data.public_apis import public_apis_hub, PublicAPIsHub
from backend.data.macro_feed import macro_feed
from backend.agents.macro_analyst import macro_analyst
from backend.agents.commodity_analyst import commodity_analyst


class TestPublicAPIs(unittest.TestCase):
    def test_hub_status(self):
        hub = PublicAPIsHub(cache_ttl_seconds=60)
        status = hub.get_full_status()
        self.assertIn("ecb_rates", status)
        self.assertIn("fred_macro", status)
        self.assertIn("eia_inventories", status)
        self.assertIn("crowd_sentiment", status)

        # Check ECB fields
        ecb = hub.get_ecb_rates()
        self.assertGreater(ecb.eurusd, 0.5)
        self.assertGreater(ecb.gbpusd, 0.5)
        self.assertGreater(ecb.usdjpy, 50.0)

        # Check FRED fields
        fred = hub.get_fred_metrics()
        self.assertGreater(fred.us10y_yield, 0.0)
        self.assertIn("%", fred.fed_funds_rate)

        # Check EIA fields
        eia = hub.get_eia_inventories()
        self.assertIsNotNone(eia.weekly_change_mbbl)
        self.assertIn("U.S. Energy Information Administration", eia.source)

        # Check Retail Sentiment
        sentiment = hub.get_retail_sentiment()
        self.assertGreater(sentiment.gold_long_pct, 0.0)
        self.assertTrue(len(sentiment.contrarian_alert) > 10)

    def test_macro_feed_integration(self):
        state = macro_feed.get_macro_state()
        self.assertIsNotNone(state.us10y_yield)
        self.assertIsNotNone(state.dxy_index)
        self.assertIn(state.gold_macro_bias, ["BULLISH", "BEARISH", "NEUTRAL"])

    def test_macro_analyst_ecb_drivers(self):
        eur_report = macro_analyst.analyze("EURUSD")
        self.assertTrue(any("ECB" in d for d in eur_report.key_drivers))
        self.assertIn("Euro", eur_report.summary)

        gold_report = macro_analyst.analyze("XAUUSD")
        self.assertEqual(gold_report.bias, "BULLISH")

    def test_commodity_analyst_eia_integration(self):
        oil_report = commodity_analyst.analyze("USOIL")
        self.assertTrue(any("EIA" in c for c in oil_report.catalysts))
        self.assertIn("EIA", oil_report.inventory_data)

        gold_report = commodity_analyst.analyze("XAUUSD")
        self.assertTrue(any("Retail Crowd Radar" in c for c in gold_report.catalysts))

    def test_fear_and_greed_feed(self):
        hub = PublicAPIsHub(cache_ttl_seconds=60)
        status = hub.get_full_status()
        self.assertIn("fear_and_greed", status)
        fng = status["fear_and_greed"]
        self.assertIn("score", fng)
        self.assertIn("classification", fng)
        self.assertTrue(0 <= fng["score"] <= 100)
        self.assertTrue(len(fng["classification"]) > 0)
        self.assertEqual(fng["source"], "Alternative.me Fear & Greed Index")

        # Retail sentiment should also reflect fear_greed_score
        sentiment = hub.get_retail_sentiment()
        self.assertTrue(hasattr(sentiment, "fear_greed_score"))
        self.assertTrue(0 <= sentiment.fear_greed_score <= 100)

    def test_economic_calendar_news_horizon_and_blackout(self):
        from backend.data.economic_calendar import EconomicCalendar
        cal = EconomicCalendar()
        next_ev = cal.get_next_high_impact_event()
        self.assertIsNotNone(next_ev)
        self.assertIn("minutes_remaining", next_ev)
        self.assertIn("news_blackout", next_ev)

        # Inject event 5 minutes from now -> blackout should be True
        cal.add_simulated_event("Breaking FOMC Rate Flash", "USD", offset_seconds=300)
        blackout_ev = cal.get_next_high_impact_event()
        self.assertIsNotNone(blackout_ev)
        self.assertTrue(blackout_ev["news_blackout"])
        self.assertLessEqual(blackout_ev["minutes_remaining"], 6.0)


if __name__ == "__main__":
    unittest.main()
