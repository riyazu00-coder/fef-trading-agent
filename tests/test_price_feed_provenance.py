"""Deterministic safety tests for quote accuracy and provenance."""

from dataclasses import asdict, dataclass
import io
import json
import os
from pathlib import Path
import time
import unittest
from types import SimpleNamespace
from unittest.mock import patch

os.environ.setdefault("VERCEL", "1")

import backend.data.market_feed as market_feed_module
from backend.data.market_feed import MarketFeed, MarketQuote, REFERENCE_PRICES
from backend.data.quote_store import QuoteStore
from backend.server import TradingAgentsApiHandler


@dataclass
class EmptyState:
    """Minimal dataclass accepted by API response serialization."""


class TestPriceFeedProvenance(unittest.TestCase):
    def test_fresh_mt5_quote_is_live_and_preferred(self):
        feed = MarketFeed()
        timestamp = time.time() - 2.0
        broker_quote = {
            "bid": 2650.10,
            "ask": 2650.30,
            "timestamp": timestamp,
            "source": "SOCKET",
            "raw_symbol": "XAUUSD.a",
            "has_broker_bid_ask": True,
        }

        with patch.object(market_feed_module.quote_store, "get", return_value=broker_quote):
            quote = feed.get_live_quote("XAUUSD")

        self.assertEqual(quote.bid, 2650.10)
        self.assertEqual(quote.ask, 2650.30)
        self.assertEqual(quote.source, "SOCKET")
        self.assertEqual(quote.source_symbol, "XAUUSD.a")
        self.assertEqual(quote.source_label, "LIVE")
        self.assertTrue(quote.is_broker_quote)
        self.assertTrue(quote.is_tradeable)
        self.assertEqual(quote.spread_source, "LIVE")
        self.assertGreaterEqual(quote.age_seconds, 2.0)

    def test_stale_mt5_quote_is_rejected_by_quote_store(self):
        store = QuoteStore()
        store.quotes["EURUSD"] = {
            "bid": 1.10,
            "ask": 1.1002,
            "timestamp": time.time() - 61.0,
            "source": "SOCKET",
        }
        with patch.object(store, "check_file_bridge"):
            self.assertIsNone(store.get("EURUSD", max_age_seconds=60.0))

    def test_yfinance_fallback_is_delayed_deterministic_and_not_tradeable(self):
        feed = MarketFeed()
        fake_yfinance = SimpleNamespace(
            Ticker=lambda _symbol: SimpleNamespace(
                fast_info=SimpleNamespace(last_price=1.23456)
            )
        )
        with (
            patch.object(market_feed_module.quote_store, "get", return_value=None),
            patch.object(market_feed_module, "HAS_DATA_LIBS", True),
            patch.object(market_feed_module, "yf", fake_yfinance, create=True),
        ):
            first = feed.get_live_quote("EURUSD")
            second = feed.get_live_quote("EURUSD")

        self.assertEqual(first.mid, 1.23456)
        self.assertEqual((first.mid, first.bid, first.ask), (second.mid, second.bid, second.ask))
        self.assertEqual(first.source, "YFINANCE")
        self.assertEqual(first.source_symbol, "EURUSD=X")
        self.assertEqual(first.source_label, "DELAYED")
        self.assertNotEqual(first.source_label, "LIVE")
        self.assertFalse(first.is_broker_quote)
        self.assertFalse(first.is_tradeable)
        self.assertEqual(first.spread_source, "SIMULATED")

    def test_static_reference_fallback_is_honest_and_deterministic(self):
        feed = MarketFeed()
        with (
            patch.object(market_feed_module.quote_store, "get", return_value=None),
            patch.object(market_feed_module, "HAS_DATA_LIBS", False),
        ):
            first = feed.get_live_quote("USOIL")
            second = feed.get_live_quote("USOIL")

        self.assertEqual(first.mid, REFERENCE_PRICES["USOIL"])
        self.assertEqual(first.bid, second.bid)
        self.assertEqual(first.ask, second.ask)
        self.assertEqual(first.source, "REFERENCE_PRICES")
        self.assertEqual(first.source_label, "FALLBACK")
        self.assertFalse(first.is_broker_quote)
        self.assertFalse(first.is_tradeable)
        self.assertEqual(first.spread_source, "SIMULATED")
        self.assertEqual(first.high_low_source, "SIMULATED")
        self.assertEqual(first.change_source, "SIMULATED")

    def test_external_analysis_uses_unmodified_mid_price(self):
        feed = MarketFeed()
        with (
            patch.object(market_feed_module.quote_store, "get", return_value=None),
            patch.object(market_feed_module, "HAS_DATA_LIBS", False),
        ):
            technical = feed.compute_technical_analysis("GBPUSD")

        self.assertEqual(technical.current_price, REFERENCE_PRICES["GBPUSD"])


class TestPriceProvenanceExposure(unittest.TestCase):
    @staticmethod
    def _quote(symbol="XAUUSD"):
        return MarketQuote(
            symbol=symbol,
            bid=2650.10,
            ask=2650.30,
            spread_pips=2.0,
            timestamp=1000.0,
            high_24h=2670.0,
            low_24h=2600.0,
            change_pct=1.0,
            pip_change=10.0,
            mid=2650.20,
            source="SOCKET",
            source_symbol=symbol,
            source_label="LIVE",
            age_seconds=1.0,
            is_tradeable=True,
            is_broker_quote=True,
            spread_source="LIVE",
            high_low_source="SIMULATED",
            change_source="SIMULATED",
        )

    def _run_get(self, path):
        request_handler = TradingAgentsApiHandler.__new__(TradingAgentsApiHandler)
        request_handler.path = path
        request_handler.rfile = io.BytesIO()
        request_handler.wfile = io.BytesIO()
        request_handler.headers = {}
        status = [200]
        request_handler.send_response = lambda code: status.__setitem__(0, code)
        request_handler.send_header = lambda _key, _value: None
        request_handler.end_headers = lambda: None
        request_handler.do_GET()
        return status[0], json.loads(request_handler.wfile.getvalue().decode("utf-8"))

    def test_status_exposes_quote_provenance(self):
        with (
            patch("backend.server.market_feed.get_live_quote", side_effect=lambda symbol: self._quote(symbol)),
            patch("backend.server.paper_simulator.get_account_snapshot", return_value=EmptyState()),
            patch("backend.server.macro_feed.get_macro_state", return_value=EmptyState()),
            patch("backend.server.public_apis_hub.get_full_status", return_value={}),
            patch("backend.server.economic_calendar.get_next_high_impact_event", return_value=None),
            patch("backend.server.economic_calendar.get_upcoming_events", return_value=[]),
            patch("backend.server.mt5_bridge.get_status", return_value={"mode": "PAPER"}),
        ):
            status, response = self._run_get("/api/status")

        self.assertEqual(status, 200)
        quote = response["instruments"]["XAUUSD"]
        for field in (
            "mid", "source", "source_symbol", "source_label", "timestamp",
            "age_seconds", "is_tradeable", "is_broker_quote", "spread_source",
            "high_low_source", "change_source",
        ):
            self.assertIn(field, quote)

    def test_analyze_endpoint_preserves_quote_provenance(self):
        response_payload = {
            "symbol": "XAUUSD",
            "technical_report": {"current_price": 2650.10},
            "quote": asdict(self._quote()),
        }
        with patch("backend.server.trading_graph.run", return_value=response_payload):
            status, response = self._run_get("/api/analyze?symbol=XAUUSD")

        self.assertEqual(status, 200)
        self.assertEqual(response["quote"]["source_label"], "LIVE")
        self.assertTrue(response["quote"]["is_broker_quote"])

    def test_frontend_labels_backend_and_chart_sources(self):
        source = (Path(__file__).resolve().parents[1] / "frontend" / "index.html").read_text(
            encoding="utf-8"
        )
        self.assertIn('id="hero-price-source"', source)
        self.assertIn('id="quick-buy-source"', source)
        self.assertIn('id="quick-sell-source"', source)
        self.assertIn('id="pip-eurusd-source"', source)
        self.assertIn("TRADINGVIEW EXTERNAL", source)
        self.assertIn("AI SMC · SIMULATED", source)
        self.assertNotIn('id="hero-price-source">LIVE', source)
        self.assertNotIn('id="quick-buy-source">LIVE', source)
        market_source = (
            Path(__file__).resolve().parents[1] / "backend" / "data" / "market_feed.py"
        ).read_text(encoding="utf-8")
        self.assertNotIn("random.random", market_source)


if __name__ == "__main__":
    unittest.main()
