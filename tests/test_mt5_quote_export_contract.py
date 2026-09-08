"""Contract tests for the Phase 4D MT5 quote-export examples."""

import json
from pathlib import Path
import unittest
from unittest.mock import MagicMock

from backend.data.quote_relay import (
    RELAY_QUOTE_REQUIRED_FIELDS,
    validate_relay_quote,
)
from scripts.quote_relay_publisher import PublisherConfig, QuoteRelayPublisher


PROJECT_ROOT = Path(__file__).resolve().parents[1]
EXAMPLES = PROJECT_ROOT / "examples"
SINGLE_SAMPLE = EXAMPLES / "mt5_quote_snapshot.single.json"
MULTI_SAMPLE = EXAMPLES / "mt5_quote_snapshot.multi.json"
PLAN = PROJECT_ROOT / "PHASE_4D_MT5_QUOTE_EXPORT_PLAN.md"
SAMPLE_TIMESTAMP = 2_000_000_000.0


class FakeResponse:
    status = 202

    def __enter__(self):
        return self

    def __exit__(self, _exc_type, _exc_value, _traceback):
        return False


class TestMT5QuoteExportContract(unittest.TestCase):
    @staticmethod
    def _load(path):
        return json.loads(path.read_text(encoding="utf-8"))

    @staticmethod
    def _publisher(source_file, opener):
        config = PublisherConfig.from_environment({
            "FEF_QUOTE_RELAY_URL": "http://127.0.0.1:8000/api/relay/quotes",
            "FEF_QUOTE_RELAY_SECRET": "fixture-test-secret",
            "FEF_QUOTE_SOURCE_FILE": str(source_file),
            "FEF_QUOTE_PUBLISH_INTERVAL_SECONDS": "2",
        })
        return QuoteRelayPublisher(
            config,
            opener=opener,
            sleep_fn=MagicMock(),
            now_fn=lambda: SAMPLE_TIMESTAMP + 1.0,
            log_fn=MagicMock(),
        )

    def test_single_sample_satisfies_relay_contract(self):
        quote = self._load(SINGLE_SAMPLE)
        snapshot = validate_relay_quote(
            quote,
            now=SAMPLE_TIMESTAMP + 1.0,
        )

        self.assertEqual(set(quote), RELAY_QUOTE_REQUIRED_FIELDS)
        self.assertEqual(snapshot.symbol, "XAUUSD")
        self.assertEqual(snapshot.broker_symbol, "XAUUSD.a")

    def test_multi_sample_satisfies_relay_contract_for_all_symbols(self):
        quotes = self._load(MULTI_SAMPLE)["quotes"]
        snapshots = [
            validate_relay_quote(quote, now=SAMPLE_TIMESTAMP + 1.0)
            for quote in quotes
        ]

        self.assertEqual(
            {snapshot.symbol for snapshot in snapshots},
            {"XAUUSD", "USOIL", "EURUSD", "GBPUSD", "USDJPY"},
        )
        for quote in quotes:
            self.assertEqual(set(quote), RELAY_QUOTE_REQUIRED_FIELDS)

    def test_publisher_reads_and_submits_single_sample(self):
        opener = MagicMock(return_value=FakeResponse())
        result = self._publisher(SINGLE_SAMPLE, opener).publish_once()

        self.assertEqual(result, {"found": 1, "submitted": 1, "invalid": 0, "failed": 0})
        opener.assert_called_once()
        self.assertEqual(
            opener.call_args.args[0].full_url,
            "http://127.0.0.1:8000/api/relay/quotes",
        )

    def test_publisher_reads_and_submits_multi_sample(self):
        opener = MagicMock(return_value=FakeResponse())
        result = self._publisher(MULTI_SAMPLE, opener).publish_once()

        self.assertEqual(result, {"found": 5, "submitted": 5, "invalid": 0, "failed": 0})
        self.assertEqual(opener.call_count, 5)

    def test_samples_contain_quote_data_only(self):
        serialized = "\n".join(
            path.read_text(encoding="utf-8").lower()
            for path in (SINGLE_SAMPLE, MULTI_SAMPLE)
        )
        forbidden_execution_terms = (
            "command_id",
            "order_type",
            "stop_loss",
            "take_profit",
            "magic_number",
            "close_all",
            "break_even",
        )
        for term in forbidden_execution_terms:
            with self.subTest(term=term):
                self.assertNotIn(term, serialized)

    def test_plan_keeps_quote_export_separate_and_unapproved(self):
        plan = PLAN.read_text(encoding="utf-8").lower()

        self.assertRegex(plan, r"quote export is for\s+market-data relay only")
        self.assertIn("not approved for real-money execution", plan)
        self.assertIn("must never authorize trading", plan)


if __name__ == "__main__":
    unittest.main()
