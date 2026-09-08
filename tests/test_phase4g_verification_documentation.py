"""Static checks for the Phase 4G manual verification instructions."""

from pathlib import Path
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DOCUMENT_PATH = (
    PROJECT_ROOT / "PHASE_4G_METAEDITOR_DEMO_MT5_QUOTE_EXPORT_VERIFICATION.md"
)


class TestPhase4GVerificationDocumentation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.document = DOCUMENT_PATH.read_text(encoding="utf-8")
        cls.lower_document = cls.document.lower()

    def test_document_exists_and_names_complete_quote_chain(self):
        self.assertTrue(DOCUMENT_PATH.is_file())
        required_components = (
            "Demo MT5",
            "mql5/FEF_TradingAgentsBridge.mq5",
            "fef_mt5_quote_snapshot.json",
            "scripts/quote_relay_publisher.py",
            "POST /api/relay/quotes",
            "GET /api/relay/quotes",
            "GET /api/status",
        )
        for component in required_components:
            with self.subTest(component=component):
                self.assertIn(component, self.document)

    def test_all_supported_symbols_and_mapping_inputs_are_documented(self):
        expected = {
            "XAUUSD": "InpQuoteXAUUSDBrokerSymbol",
            "USOIL": "InpQuoteUSOILBrokerSymbol",
            "EURUSD": "InpQuoteEURUSDBrokerSymbol",
            "GBPUSD": "InpQuoteGBPUSDBrokerSymbol",
            "USDJPY": "InpQuoteUSDJPYBrokerSymbol",
        }
        for symbol, input_name in expected.items():
            with self.subTest(symbol=symbol):
                self.assertIn(symbol, self.document)
                self.assertIn(input_name, self.document)

    def test_compile_step_and_expected_result_are_explicit(self):
        self.assertIn("MetaEditor", self.document)
        self.assertIn("File -> Compile", self.document)
        self.assertIn("F7", self.document)
        self.assertIn("0 errors, 0 warnings", self.document)
        self.assertIn("Toolbox -> Errors", self.document)

    def test_expected_schema_and_provenance_are_complete(self):
        required_fields = (
            "symbol",
            "broker_symbol",
            "bid",
            "ask",
            "mid",
            "spread",
            "timestamp",
            "age_seconds",
            "source",
            "source_label",
            "is_broker_quote",
            "is_tradeable",
        )
        for field in required_fields:
            with self.subTest(field=field):
                self.assertIn(f"`{field}`", self.document)
        self.assertIn('"source": "MT5_RELAY"', self.document)
        self.assertIn('"source_label": "MT5 LIVE"', self.document)
        self.assertIn('"is_broker_quote": true', self.document)
        self.assertIn('"is_tradeable": true', self.document)

    def test_demo_only_and_no_real_money_boundary_is_explicit(self):
        self.assertIn("quote export only and demo mt5 only", self.lower_document)
        self.assertRegex(
            self.lower_document,
            r"not\s+approved for a real account",
        )
        self.assertRegex(
            self.lower_document,
            r"does not approve\s+real-money execution",
        )
        self.assertIn("do not test buy or sell", self.lower_document)
        self.assertIn("do not submit or test any order", self.lower_document)

    def test_document_does_not_instruct_execution_testing(self):
        forbidden_instructions = (
            "click buy",
            "click sell",
            "place a buy",
            "place a sell",
            "submit a market order",
            "test order_send",
        )
        for instruction in forbidden_instructions:
            with self.subTest(instruction=instruction):
                self.assertNotIn(instruction, self.lower_document)

    def test_exact_backend_publisher_and_read_commands_are_present(self):
        self.assertIn(
            "FEF_QUOTE_RELAY_SECRET='phase-4g-local-only-not-production' "
            "python3 -m backend.server 8000",
            self.document,
        )
        self.assertIn(
            "FEF_QUOTE_RELAY_URL='http://localhost:8000/api/relay/quotes'",
            self.document,
        )
        self.assertIn(
            "FEF_QUOTE_SOURCE_FILE='<absolute path to "
            "fef_mt5_quote_snapshot.json>'",
            self.document,
        )
        self.assertIn("python3 scripts/quote_relay_publisher.py --once", self.document)
        self.assertIn("curl -s http://localhost:8000/api/relay/quotes", self.document)
        self.assertIn("curl -s http://localhost:8000/api/status", self.document)

    def test_common_files_path_and_failure_checks_are_documented(self):
        self.assertIn(
            r"C:\Users\<User>\AppData\Roaming\MetaQuotes\Terminal\Common\Files",
            self.document,
        )
        required_failures = (
            "no output file",
            "empty file",
            "stale or future timestamp",
            "missing canonical symbols",
            "crossed bid/ask",
            "Market Watch symbol is absent",
            "prefix/suffix maps incorrectly",
        )
        for failure in required_failures:
            with self.subTest(failure=failure):
                self.assertIn(failure, self.document)


if __name__ == "__main__":
    unittest.main()
