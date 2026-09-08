"""Tests-first contract for a future authenticated MT5 quote relay."""

from dataclasses import fields
import os
import unittest
from unittest.mock import patch

import backend.data.market_feed as market_feed_module
from backend.data.market_feed import MarketFeed
from backend.data.quote_relay import (
    RELAY_QUOTE_REQUIRED_FIELDS,
    RelayAuthenticationError,
    RelayQuoteSnapshot,
    RelayQuoteValidationError,
    validate_relay_quote,
    validate_relay_submission,
)


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

    def test_external_reference_remains_non_broker_and_non_tradeable(self):
        feed = MarketFeed()
        with (
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
        forged_external = self._valid_payload(
            source="YAHOO_FINANCE_CHART",
            source_label="LIVE",
        )
        with self.assertRaisesRegex(RelayQuoteValidationError, "MT5 relay"):
            validate_relay_quote(forged_external, now=self.NOW)

        snapshot = validate_relay_quote(self._valid_payload(), now=self.NOW)
        self.assertEqual(snapshot.source_label, "MT5 LIVE")
        self.assertTrue(snapshot.is_broker_quote)
        self.assertTrue(snapshot.is_tradeable)


if __name__ == "__main__":
    unittest.main()
