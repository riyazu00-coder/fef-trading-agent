"""Deterministic tests for the Phase 4F local quote-only dry run."""

import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import MagicMock
import urllib.error

from backend.data.quote_relay import validate_relay_quote
from scripts.run_quote_relay_dry_run import (
    DEFAULT_SOURCE_FILE,
    refresh_quote_fixture,
    run_dry_run,
)


PROJECT_ROOT = Path(__file__).resolve().parents[1]
HELPER_PATH = PROJECT_ROOT / "scripts" / "run_quote_relay_dry_run.py"
NOW = 2_000_000_000.0
SECRET = "phase-4f-test-secret-never-log"


class FakeResponse:
    def __init__(self, status, payload=None):
        self.status = status
        self._body = json.dumps(payload or {}).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, _exc_type, _exc_value, _traceback):
        return False

    def getcode(self):
        return self.status

    def read(self, _limit=-1):
        return self._body


class RecordingRelayOpener:
    def __init__(self):
        self.requests = []
        self.quotes = {}

    def __call__(self, request, **_kwargs):
        self.requests.append(request)
        if request.get_method() == "POST":
            quote = json.loads(request.data.decode("utf-8"))
            self.quotes[quote["symbol"]] = quote
            return FakeResponse(202, {"status": "ACCEPTED"})
        if request.full_url.endswith("/api/relay/quotes"):
            return FakeResponse(200, {"status": "READY", "quotes": self.quotes})
        if request.full_url.endswith("/api/status"):
            return FakeResponse(200, {"instruments": self.quotes})
        raise AssertionError(f"Unexpected dry-run URL: {request.full_url}")


class TestQuoteRelayDryRun(unittest.TestCase):
    @staticmethod
    def _environment(**overrides):
        environment = {
            "FEF_QUOTE_RELAY_SECRET": SECRET,
            "FEF_QUOTE_RELAY_URL": "http://127.0.0.1:8000/api/relay/quotes",
            "FEF_QUOTE_SOURCE_FILE": str(DEFAULT_SOURCE_FILE),
        }
        environment.update(overrides)
        return environment

    def test_fixture_refresh_creates_fresh_contract_valid_copy(self):
        original = DEFAULT_SOURCE_FILE.read_text(encoding="utf-8")
        with tempfile.TemporaryDirectory() as temp_dir:
            destination = Path(temp_dir) / "fresh.json"
            count = refresh_quote_fixture(DEFAULT_SOURCE_FILE, destination, NOW)
            refreshed = json.loads(destination.read_text(encoding="utf-8"))

        self.assertEqual(count, 5)
        self.assertEqual(DEFAULT_SOURCE_FILE.read_text(encoding="utf-8"), original)
        for quote in refreshed["quotes"]:
            self.assertEqual(quote["timestamp"], NOW)
            self.assertEqual(quote["age_seconds"], 0.0)
            validate_relay_quote(quote, now=NOW)

    def test_dry_run_publishes_and_verifies_relay_provenance(self):
        opener = RecordingRelayOpener()
        logs = []
        result = run_dry_run(
            environment=self._environment(),
            opener=opener,
            now_fn=lambda: NOW,
            sleep_fn=MagicMock(),
            log_fn=logs.append,
        )

        self.assertEqual(result, 0)
        self.assertEqual(len(opener.quotes), 5)
        self.assertIn("quote-only dry run PASSED", logs[-1])
        self.assertNotIn(SECRET, "\n".join(logs))
        for quote in opener.quotes.values():
            self.assertEqual(quote["source"], "MT5_RELAY")
            self.assertEqual(quote["source_label"], "MT5 LIVE")
            self.assertIs(quote["is_broker_quote"], True)
            self.assertIs(quote["is_tradeable"], True)

    def test_helper_uses_only_quote_submission_and_read_paths(self):
        source = HELPER_PATH.read_text(encoding="utf-8")
        self.assertIn("/api/relay/quotes", source)
        self.assertIn("/api/status", source)
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

    def test_read_requests_do_not_include_relay_authentication(self):
        opener = RecordingRelayOpener()
        result = run_dry_run(
            environment=self._environment(),
            opener=opener,
            now_fn=lambda: NOW,
            sleep_fn=MagicMock(),
            log_fn=MagicMock(),
        )

        self.assertEqual(result, 0)
        read_requests = [
            request for request in opener.requests if request.get_method() == "GET"
        ]
        self.assertEqual(len(read_requests), 2)
        for request in read_requests:
            self.assertIsNone(request.get_header("Authorization"))

    def test_backend_unavailable_fails_safely(self):
        logs = []
        opener = MagicMock(side_effect=urllib.error.URLError("offline"))
        result = run_dry_run(
            environment=self._environment(),
            opener=opener,
            now_fn=lambda: NOW,
            sleep_fn=MagicMock(),
            log_fn=logs.append,
        )

        self.assertEqual(result, 1)
        self.assertIn("dry run FAILED", logs[-1])
        self.assertNotIn(SECRET, "\n".join(logs))

    def test_missing_secret_fails_closed_without_logging_secret(self):
        logs = []
        opener = MagicMock()
        result = run_dry_run(
            environment=self._environment(FEF_QUOTE_RELAY_SECRET=""),
            opener=opener,
            now_fn=lambda: NOW,
            sleep_fn=MagicMock(),
            log_fn=logs.append,
        )

        self.assertEqual(result, 1)
        opener.assert_not_called()
        self.assertIn("FEF_QUOTE_RELAY_SECRET is required", logs[-1])
        self.assertNotIn(SECRET, "\n".join(logs))

    def test_remote_destination_is_rejected_for_local_dry_run(self):
        opener = MagicMock()
        result = run_dry_run(
            environment=self._environment(
                FEF_QUOTE_RELAY_URL="https://example.com/api/relay/quotes"
            ),
            opener=opener,
            now_fn=lambda: NOW,
            sleep_fn=MagicMock(),
            log_fn=MagicMock(),
        )

        self.assertEqual(result, 1)
        opener.assert_not_called()


if __name__ == "__main__":
    unittest.main()
