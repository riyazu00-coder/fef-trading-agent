"""Deterministic tests for the quote-only VPS publisher skeleton."""

import io
import json
from pathlib import Path
import unittest
from unittest.mock import MagicMock, mock_open, patch
import urllib.error

from scripts.quote_relay_publisher import (
    PUBLISH_RETRY_DELAY_SECONDS,
    PublisherConfig,
    PublisherConfigurationError,
    QuoteRelayPublisher,
)


class FakeResponse:
    status = 202

    def __enter__(self):
        return self

    def __exit__(self, _exc_type, _exc_value, _traceback):
        return False


class TestQuoteRelayPublisher(unittest.TestCase):
    NOW = 2_000_000_000.0
    SECRET = "publisher-test-secret-that-must-never-be-logged"

    @staticmethod
    def _environment(**overrides):
        environment = {
            "FEF_QUOTE_RELAY_URL": "http://127.0.0.1:8000",
            "FEF_QUOTE_RELAY_SECRET": TestQuoteRelayPublisher.SECRET,
            "FEF_QUOTE_SOURCE_FILE": "/safe/mt5/fef_live_quotes.json",
            "FEF_QUOTE_PUBLISH_INTERVAL_SECONDS": "2.0",
        }
        environment.update(overrides)
        return environment

    def _config(self):
        return PublisherConfig.from_environment(self._environment())

    def _source_quote(self, **overrides):
        quote = {
            "symbol": "XAUUSD",
            "raw_symbol": "XAUUSD.a",
            "bid": 4413.20,
            "ask": 4413.40,
            "timestamp": self.NOW - 1.0,
        }
        quote.update(overrides)
        return quote

    def _publisher(self, opener=None, sleep_fn=None):
        logs = []
        return QuoteRelayPublisher(
            self._config(),
            opener=opener or MagicMock(return_value=FakeResponse()),
            sleep_fn=sleep_fn or MagicMock(),
            now_fn=lambda: self.NOW,
            log_fn=logs.append,
        ), logs

    def test_missing_secret_fails_closed(self):
        environment = self._environment(FEF_QUOTE_RELAY_SECRET="")
        with self.assertRaisesRegex(PublisherConfigurationError, "SECRET"):
            PublisherConfig.from_environment(environment)

    def test_missing_relay_url_fails_closed(self):
        environment = self._environment(FEF_QUOTE_RELAY_URL="")
        with self.assertRaisesRegex(PublisherConfigurationError, "URL"):
            PublisherConfig.from_environment(environment)

    def test_malformed_source_file_does_not_submit(self):
        opener = MagicMock()
        publisher, logs = self._publisher(opener=opener)
        with (
            patch("scripts.quote_relay_publisher.os.path.getmtime", return_value=self.NOW),
            patch("builtins.open", mock_open(read_data="{malformed")),
        ):
            result = publisher.publish_once()

        self.assertEqual(result, {"found": 0, "submitted": 0, "invalid": 0, "failed": 1})
        opener.assert_not_called()
        self.assertIn("Quote source unavailable", logs[0])

    def test_missing_source_file_does_not_submit(self):
        opener = MagicMock()
        publisher, logs = self._publisher(opener=opener)
        with patch(
            "scripts.quote_relay_publisher.os.path.getmtime",
            side_effect=FileNotFoundError,
        ):
            result = publisher.publish_once()

        self.assertEqual(result["failed"], 1)
        opener.assert_not_called()
        self.assertIn("Quote source unavailable", logs[0])

    def test_valid_quote_submits_only_to_relay_with_bearer_auth(self):
        opener = MagicMock(return_value=FakeResponse())
        publisher, logs = self._publisher(opener=opener)
        source_json = json.dumps(self._source_quote())
        with (
            patch("scripts.quote_relay_publisher.os.path.getmtime", return_value=self.NOW - 1.0),
            patch("builtins.open", mock_open(read_data=source_json)),
        ):
            result = publisher.publish_once()

        self.assertEqual(result["submitted"], 1)
        opener.assert_called_once()
        request = opener.call_args.args[0]
        self.assertEqual(request.full_url, "http://127.0.0.1:8000/api/relay/quotes")
        self.assertEqual(request.get_method(), "POST")
        self.assertEqual(request.get_header("Authorization"), f"Bearer {self.SECRET}")
        self.assertEqual(opener.call_args.kwargs["timeout"], 3.0)

        submitted = json.loads(request.data.decode("utf-8"))
        self.assertEqual(submitted["source"], "MT5_RELAY")
        self.assertEqual(submitted["source_label"], "MT5 LIVE")
        self.assertEqual(submitted["broker_symbol"], "XAUUSD.a")
        self.assertTrue(submitted["is_broker_quote"])
        self.assertTrue(submitted["is_tradeable"])
        self.assertNotIn(self.SECRET, "\n".join(logs))
        self.assertNotIn(self.SECRET, repr(publisher.config))

    def test_invalid_quote_does_not_submit(self):
        opener = MagicMock()
        publisher, logs = self._publisher(opener=opener)
        source_json = json.dumps(self._source_quote(ask=4400.00))
        with (
            patch("scripts.quote_relay_publisher.os.path.getmtime", return_value=self.NOW - 1.0),
            patch("builtins.open", mock_open(read_data=source_json)),
        ):
            result = publisher.publish_once()

        self.assertEqual(result["invalid"], 1)
        self.assertEqual(result["submitted"], 0)
        opener.assert_not_called()
        self.assertIn("Rejected invalid quote", logs[0])

    def test_network_failure_is_bounded_and_does_not_log_secret(self):
        opener = MagicMock(side_effect=urllib.error.URLError("offline"))
        sleep_fn = MagicMock()
        publisher, logs = self._publisher(opener=opener, sleep_fn=sleep_fn)
        source_json = json.dumps(self._source_quote())
        with (
            patch("scripts.quote_relay_publisher.os.path.getmtime", return_value=self.NOW - 1.0),
            patch("builtins.open", mock_open(read_data=source_json)),
        ):
            result = publisher.publish_once()

        self.assertEqual(result["failed"], 1)
        self.assertEqual(opener.call_count, 2)
        sleep_fn.assert_called_once_with(PUBLISH_RETRY_DELAY_SECONDS)
        self.assertNotIn(self.SECRET, "\n".join(logs))

    def test_publisher_source_references_no_trading_routes(self):
        source = (
            Path(__file__).resolve().parents[1] / "scripts" / "quote_relay_publisher.py"
        ).read_text(encoding="utf-8")
        forbidden_routes = (
            "/api/execute",
            "/api/quick_execute",
            "/api/break_even",
            "/api/close_all",
            "/api/close_position",
        )
        for route in forbidden_routes:
            with self.subTest(route=route):
                self.assertNotIn(route, source)
        self.assertIn('RELAY_ENDPOINT_PATH = "/api/relay/quotes"', source)


if __name__ == "__main__":
    unittest.main()
