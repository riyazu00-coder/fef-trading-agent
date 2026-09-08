"""Tests-first contract for a future authenticated MT5 quote relay."""

from dataclasses import fields
import io
import json
import os
import unittest
from unittest.mock import patch

os.environ.setdefault("VERCEL", "1")

import backend.data.market_feed as market_feed_module
from backend.data.market_feed import MarketFeed
from backend.data.quote_relay import (
    RELAY_QUOTE_REQUIRED_FIELDS,
    RelayAuthenticationError,
    RelayQuoteCache,
    RelayQuoteSnapshot,
    RelayQuoteValidationError,
    validate_relay_quote,
    validate_relay_submission,
)
from backend.server import TradingAgentsApiHandler


class TestMT5QuoteRelayContract(unittest.TestCase):
    NOW = 2_000_000_000.0
    SECRET = "relay-test-secret-with-sufficient-entropy"

    def _valid_payload(self, **overrides):
        payload = {
            "symbol": "XAUUSD",
            "broker_symbol": "XAUUSD.a",
            "bid": 4413.20,
            "ask": 4413.40,
            "mid": 4413.30,
            "spread": 0.20,
            "timestamp": self.NOW - 1.0,
            "age_seconds": 1.0,
            "source": "MT5_RELAY",
            "source_label": "MT5 LIVE",
            "is_broker_quote": True,
            "is_tradeable": True,
        }
        payload.update(overrides)
        return payload

    def test_expected_relay_quote_schema_is_explicit(self):
        dataclass_fields = {field.name for field in fields(RelayQuoteSnapshot)}
        self.assertEqual(dataclass_fields, set(RELAY_QUOTE_REQUIRED_FIELDS))

        snapshot = validate_relay_quote(self._valid_payload(), now=self.NOW)
        self.assertEqual(snapshot.symbol, "XAUUSD")
        self.assertEqual(snapshot.broker_symbol, "XAUUSD.a")
        self.assertEqual(snapshot.age_seconds, 1.0)

    def test_stale_relay_quote_is_rejected(self):
        stale_payload = self._valid_payload(
            timestamp=self.NOW - 10.001,
            age_seconds=10.001,
        )
        with self.assertRaisesRegex(RelayQuoteValidationError, "stale"):
            validate_relay_quote(stale_payload, now=self.NOW, max_age_seconds=10.0)

    def test_unauthenticated_or_incorrect_relay_submission_is_rejected(self):
        with patch.dict(os.environ, {"FEF_QUOTE_RELAY_SECRET": self.SECRET}, clear=False):
            with self.assertRaises(RelayAuthenticationError):
                validate_relay_submission({}, "", now=self.NOW)
            with self.assertRaises(RelayAuthenticationError):
                validate_relay_submission(
                    self._valid_payload(), "Bearer wrong-secret", now=self.NOW
                )

            snapshot = validate_relay_submission(
                self._valid_payload(), f"Bearer {self.SECRET}", now=self.NOW
            )

        self.assertEqual(snapshot.source, "MT5_RELAY")
        self.assertTrue(snapshot.is_broker_quote)
        self.assertTrue(snapshot.is_tradeable)


class TestMT5QuoteRelayCacheAndEndpoints(unittest.TestCase):
    NOW = 2_000_000_000.0
    SECRET = "relay-endpoint-test-secret-with-sufficient-entropy"

    def setUp(self):
        self.cache = RelayQuoteCache(max_age_seconds=10.0)
        environment = patch.dict(
            os.environ,
            {"FEF_QUOTE_RELAY_SECRET": self.SECRET},
            clear=False,
        )
        environment.start()
        self.addCleanup(environment.stop)

    def _payload(self, **overrides):
        payload = {
            "symbol": "XAUUSD",
            "broker_symbol": "XAUUSD.a",
            "bid": 4413.20,
            "ask": 4413.40,
            "mid": 4413.30,
            "spread": 0.20,
            "timestamp": self.NOW - 1.0,
            "age_seconds": 1.0,
            "source": "MT5_RELAY",
            "source_label": "MT5 LIVE",
            "is_broker_quote": True,
            "is_tradeable": True,
        }
        payload.update(overrides)
        return payload

    @staticmethod
    def _handler(path, body=b"", auth_header=None):
        handler = TradingAgentsApiHandler.__new__(TradingAgentsApiHandler)
        handler.path = path
        handler.rfile = io.BytesIO(body)
        handler.wfile = io.BytesIO()
        handler.headers = {
            "Content-Length": str(len(body)),
            "Content-Type": "application/json",
        }
        if auth_header is not None:
            handler.headers["Authorization"] = auth_header
        status = [200]
        handler.send_response = lambda code: status.__setitem__(0, code)
        handler.send_header = lambda _key, _value: None
        handler.end_headers = lambda: None
        return handler, status

    def _post(self, payload, auth_header=None):
        body = json.dumps(payload).encode("utf-8")
        handler, status = self._handler(
            "/api/relay/quotes", body=body, auth_header=auth_header
        )
        with (
            patch("backend.server.quote_relay_cache", self.cache),
            patch("backend.data.quote_relay.time.time", return_value=self.NOW),
        ):
            handler.do_POST()
        return status[0], json.loads(handler.wfile.getvalue().decode("utf-8"))

    def _get(self, now=None):
        observed_at = self.NOW if now is None else now
        handler, status = self._handler("/api/relay/quotes")
        with (
            patch("backend.server.quote_relay_cache", self.cache),
            patch("backend.server.time.time", return_value=observed_at),
            patch("backend.data.quote_relay.time.time", return_value=observed_at),
        ):
            handler.do_GET()
        return status[0], json.loads(handler.wfile.getvalue().decode("utf-8"))

    def test_relay_submit_rejects_missing_and_wrong_token(self):
        for auth_header in (None, "Bearer wrong-token"):
            with self.subTest(auth_header=auth_header):
                status, response = self._post(self._payload(), auth_header)
                self.assertEqual(status, 401)
                self.assertEqual(response["status"], "UNAUTHORIZED")
                self.assertIsNone(self.cache.get("XAUUSD", now=self.NOW))

    def test_valid_relay_quote_is_accepted_and_read_only_endpoint_returns_it(self):
        status, response = self._post(
            self._payload(), f"Bearer {self.SECRET}"
        )
        self.assertEqual(status, 202)
        self.assertEqual(response["status"], "ACCEPTED")

        before = self.cache.get("XAUUSD", now=self.NOW)
        get_status, get_response = self._get()
        after = self.cache.get("XAUUSD", now=self.NOW)

        self.assertEqual(get_status, 200)
        self.assertEqual(get_response["status"], "READY")
        self.assertEqual(get_response["quotes"]["XAUUSD"]["broker_symbol"], "XAUUSD.a")
        self.assertEqual(get_response["quotes"]["XAUUSD"]["age_seconds"], 1.0)
        self.assertEqual(before, after)

    def test_stale_relay_quote_is_rejected_by_submission_endpoint(self):
        status, response = self._post(
            self._payload(timestamp=self.NOW - 11.0, age_seconds=11.0),
            f"Bearer {self.SECRET}",
        )
        self.assertEqual(status, 400)
        self.assertEqual(response["status"], "REJECTED")
        self.assertIn("stale", response["message"])

    def test_submission_endpoint_rejects_non_mt5_live_claim(self):
        status, response = self._post(
            self._payload(source="YAHOO_FINANCE_CHART", source_label="LIVE"),
            f"Bearer {self.SECRET}",
        )
        self.assertEqual(status, 400)
        self.assertEqual(response["status"], "REJECTED")
        self.assertIn("MT5 relay", response["message"])

    def test_relay_quote_expires_and_read_endpoint_reports_empty(self):
        self.cache.submit(
            self._payload(),
            f"Bearer {self.SECRET}",
            now=self.NOW,
        )
        status, response = self._get(now=self.NOW + 10.001)
        self.assertEqual(status, 200)
        self.assertEqual(response["status"], "EMPTY")
        self.assertEqual(response["quotes"], {})
        self.assertEqual(response["stale_symbols"], ["XAUUSD"])
        self.assertIsNone(self.cache.get("XAUUSD", now=self.NOW + 10.001))

    def test_market_feed_prefers_fresh_authenticated_relay_quote(self):
        self.cache.submit(
            self._payload(),
            f"Bearer {self.SECRET}",
            now=self.NOW,
        )
        feed = MarketFeed()
        with (
            patch.object(market_feed_module, "quote_relay_cache", self.cache),
            patch.object(market_feed_module.time, "time", return_value=self.NOW),
            patch.object(market_feed_module.quote_store, "get") as quote_store_get,
            patch.object(feed, "_fetch_external_reference") as external_fetch,
        ):
            quote = feed.get_live_quote("XAUUSD")

        self.assertEqual(quote.source, "MT5_RELAY")
        self.assertEqual(quote.source_symbol, "XAUUSD.a")
        self.assertEqual(quote.source_label, "MT5 LIVE")
        self.assertEqual(quote.bid, 4413.20)
        self.assertTrue(quote.is_broker_quote)
        self.assertTrue(quote.is_tradeable)
        quote_store_get.assert_not_called()
        external_fetch.assert_not_called()

    def test_market_feed_uses_existing_quote_store_after_relay_expiry(self):
        self.cache.submit(
            self._payload(),
            f"Bearer {self.SECRET}",
            now=self.NOW,
        )
        observed_at = self.NOW + 11.0
        local_mt5_quote = {
            "bid": 4414.10,
            "ask": 4414.30,
            "timestamp": observed_at - 1.0,
            "source": "SOCKET",
            "raw_symbol": "XAUUSD.local",
            "has_broker_bid_ask": True,
        }
        feed = MarketFeed()
        with (
            patch.object(market_feed_module, "quote_relay_cache", self.cache),
            patch.object(market_feed_module.time, "time", return_value=observed_at),
            patch.object(
                market_feed_module.quote_store,
                "get",
                return_value=local_mt5_quote,
            ) as quote_store_get,
            patch.object(feed, "_fetch_external_reference") as external_fetch,
        ):
            quote = feed.get_live_quote("XAUUSD")

        self.assertEqual(quote.source, "SOCKET")
        self.assertEqual(quote.source_symbol, "XAUUSD.local")
        self.assertTrue(quote.is_broker_quote)
        quote_store_get.assert_called_once_with("XAUUSD", max_age_seconds=60.0)
        external_fetch.assert_not_called()

    def test_relay_submission_cannot_trigger_execution(self):
        with (
            patch("backend.server.trading_graph.run") as trading_run,
            patch("backend.server.mt5_bridge.send_order") as send_order,
            patch("backend.server.mt5_bridge.queue_command") as queue_command,
            patch("backend.server.paper_simulator.execute_order") as paper_execute,
        ):
            status, response = self._post(
                self._payload(), f"Bearer {self.SECRET}"
            )

        self.assertEqual(status, 202)
        self.assertEqual(response["status"], "ACCEPTED")
        trading_run.assert_not_called()
        send_order.assert_not_called()
        queue_command.assert_not_called()
        paper_execute.assert_not_called()

    def test_relay_secret_does_not_authorize_trade_execution(self):
        body = json.dumps({"symbol": "XAUUSD", "action": "BUY"}).encode("utf-8")
        handler, status = self._handler(
            "/api/quick_execute",
            body=body,
            auth_header=f"Bearer {self.SECRET}",
        )
        with (
            patch.dict(
                os.environ,
                {"FEF_BRIDGE_SECRET": "different-execution-secret"},
                clear=False,
            ),
            patch("backend.server.mt5_bridge.send_order") as send_order,
        ):
            handler.do_POST()

        response = json.loads(handler.wfile.getvalue().decode("utf-8"))
        self.assertEqual(status[0], 401)
        self.assertEqual(response["status"], "UNAUTHORIZED")
        send_order.assert_not_called()

    def test_external_reference_remains_non_broker_and_non_tradeable(self):
        feed = MarketFeed()
        with (
            patch.object(market_feed_module, "quote_relay_cache", self.cache),
            patch.object(market_feed_module.quote_store, "get", return_value=None),
            patch.object(
                feed,
                "_fetch_external_reference",
                return_value=(4413.25, self.NOW - 30.0),
            ),
            patch.object(market_feed_module.time, "time", return_value=self.NOW),
        ):
            quote = feed.get_live_quote("XAUUSD")

        self.assertEqual(quote.source, "YAHOO_FINANCE_CHART")
        self.assertIn("NON-BROKER", quote.source_label)
        self.assertFalse(quote.is_broker_quote)
        self.assertFalse(quote.is_tradeable)

    def test_only_mt5_relay_source_can_claim_live_broker_flags(self):
        forged_external = self._payload(
            source="YAHOO_FINANCE_CHART",
            source_label="LIVE",
        )
        with self.assertRaisesRegex(RelayQuoteValidationError, "MT5 relay"):
            validate_relay_quote(forged_external, now=self.NOW)

        snapshot = validate_relay_quote(self._payload(), now=self.NOW)
        self.assertEqual(snapshot.source_label, "MT5 LIVE")
        self.assertTrue(snapshot.is_broker_quote)
        self.assertTrue(snapshot.is_tradeable)


if __name__ == "__main__":
    unittest.main()
