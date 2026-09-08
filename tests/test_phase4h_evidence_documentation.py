"""Static checks for Phase 4H evidence and VPS quote-only safeguards."""

from pathlib import Path
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DOCUMENT_PATH = (
    PROJECT_ROOT / "PHASE_4H_MT5_EVIDENCE_AND_VPS_QUOTE_RELAY_CHECKLIST.md"
)


class TestPhase4HEvidenceDocumentation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.document = DOCUMENT_PATH.read_text(encoding="utf-8")
        cls.lower_document = cls.document.lower()

    def test_evidence_document_exists_and_marks_phase4g_passed(self):
        self.assertTrue(DOCUMENT_PATH.is_file())
        self.assertIn("Phase 4G manual quote-export", self.document)
        self.assertIn("passed", self.lower_document)

    def test_all_supported_symbols_are_recorded(self):
        for symbol in ("XAUUSD", "USOIL", "EURUSD", "GBPUSD", "USDJPY"):
            with self.subTest(symbol=symbol):
                self.assertIn(symbol, self.document)

    def test_local_paths_and_common_files_evidence_are_exact(self):
        self.assertIn(
            "/Users/mac/Library/Application Support/"
            "net.metaquotes.wine.metatrader5/drive_c/Program Files/MetaTrader 5/"
            "MQL5/Experts/Advisors/FEF_TradingAgentsBridge.mq5",
            self.document,
        )
        self.assertIn(
            "/Users/mac/Library/Application Support/"
            "net.metaquotes.wine.metatrader5/drive_c/users/user/AppData/Roaming/"
            "MetaQuotes/Terminal/Common/Files/fef_mt5_quote_snapshot.json",
            self.document,
        )

    def test_backend_publisher_and_read_commands_are_recorded(self):
        self.assertIn(
            "FEF_QUOTE_RELAY_SECRET='phase-4g-local-only-not-production' "
            "python3 -m backend.server 8000",
            self.document,
        )
        self.assertIn(
            "FEF_QUOTE_RELAY_URL='http://localhost:8000/api/relay/quotes'",
            self.document,
        )
        self.assertIn("python3 scripts/quote_relay_publisher.py --once", self.document)
        self.assertIn("curl -s http://localhost:8000/api/relay/quotes", self.document)
        self.assertIn("curl -s http://localhost:8000/api/status", self.document)

    def test_http_202_and_status_provenance_evidence_are_recorded(self):
        for symbol in ("XAUUSD", "USOIL", "EURUSD", "GBPUSD", "USDJPY"):
            with self.subTest(symbol=symbol):
                self.assertIn(
                    f"Published quote for {symbol} (HTTP 202)",
                    self.document,
                )
        self.assertIn("MT5_RELAY", self.document)
        self.assertIn("MT5 LIVE", self.document)
        self.assertIn("is_broker_quote = true", self.document)
        self.assertIn("is_tradeable = true", self.document)

    def test_no_position_and_no_trade_evidence_are_explicit(self):
        self.assertIn("No open positions were present", self.document)
        self.assertIn("No trade action was initiated", self.document)
        self.assertIn("No order-execution path was included", self.document)
        self.assertIn("No real account was used", self.document)

    def test_vps_quote_only_security_checklist_is_complete(self):
        required_controls = (
            "native Windows VPS",
            "dedicated broker demo account",
            "zero errors and zero warnings",
            "FEF_QUOTE_SOURCE_FILE",
            "unique high-entropy `FEF_QUOTE_RELAY_SECRET`",
            "HTTPS URL",
            "relay secret never appears",
            "Do not expose or forward any trading mutation endpoint",
            "Monitor publisher process health",
            "Monitor quote-file modification time",
            "Confirm `/api/relay/quotes` and `/api/status`",
        )
        for control in required_controls:
            with self.subTest(control=control):
                self.assertIn(control, self.document)

    def test_document_does_not_instruct_trade_testing_or_approve_real_money(self):
        self.assertIn("real-money execution remains blocked", self.lower_document)
        self.assertIn("is not approved", self.lower_document)
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


if __name__ == "__main__":
    unittest.main()
