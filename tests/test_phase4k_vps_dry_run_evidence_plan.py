"""Static safeguards for the Phase 4K VPS evidence runbook."""

from pathlib import Path
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DOCUMENT_PATH = PROJECT_ROOT / "PHASE_4K_VPS_DRY_RUN_EVIDENCE_PLAN.md"


class TestPhase4KVpsDryRunEvidencePlan(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.document = DOCUMENT_PATH.read_text(encoding="utf-8")
        cls.lower_document = cls.document.lower()

    def test_document_exists_and_sets_quote_only_demo_boundary(self):
        self.assertTrue(DOCUMENT_PATH.is_file())
        self.assertIn("Windows VPS", self.document)
        self.assertIn("Demo MT5", self.document)
        self.assertIn("quote-only", self.lower_document)
        self.assertIn("Keep terminal trading disabled", self.document)

    def test_all_five_symbols_are_required(self):
        for symbol in ("XAUUSD", "USOIL", "EURUSD", "GBPUSD", "USDJPY"):
            with self.subTest(symbol=symbol):
                self.assertIn(symbol, self.document)
        self.assertIn("fef_mt5_quote_snapshot.json", self.document)

    def test_phase4j_one_shot_and_health_assets_are_used(self):
        self.assertIn(
            ".\\deploy\\windows\\quote-relay\\run-once.ps1",
            self.document,
        )
        self.assertIn(
            ".\\deploy\\windows\\quote-relay\\health-check.ps1",
            self.document,
        )
        self.assertIn("-MaximumFileAgeSeconds 15", self.document)

    def test_exact_powershell_preflight_and_file_commands_are_present(self):
        commands = (
            "py -3.12 --version",
            "git branch --show-current",
            "git status --short",
            "git rev-parse HEAD",
            ".\\.venv\\Scripts\\Activate.ps1",
            "Copy-Item .env.example .env",
            "Test-Path -LiteralPath $QuoteFile -PathType Leaf",
            "LastWriteTimeUtc",
            "Invoke-RestMethod -Method Get",
        )
        for command in commands:
            with self.subTest(command=command):
                self.assertIn(command, self.document)

    def test_environment_evidence_prints_keys_not_secret_values(self):
        self.assertIn("Capture only configured key names, never values", self.document)
        self.assertIn("($_ -split '=', 2)[0].Trim()", self.document)
        self.assertIn("Do not capture the editor window or `.env` contents", self.document)
        self.assertNotIn("Get-ChildItem Env:FEF_QUOTE_RELAY_SECRET", self.document)

    def test_expected_http_and_provenance_evidence_is_exact(self):
        for symbol in ("XAUUSD", "USOIL", "EURUSD", "GBPUSD", "USDJPY"):
            with self.subTest(symbol=symbol):
                self.assertIn(f"Published quote for {symbol} (HTTP 202)", self.document)
        for target in (
            "status = READY",
            "source = MT5_RELAY",
            "source_label = MT5 LIVE",
            "is_broker_quote = true",
            "is_tradeable = true",
        ):
            with self.subTest(target=target):
                self.assertIn(target, self.document)

    def test_no_position_and_no_trade_attestation_are_required(self):
        self.assertIn("empty MT5 Toolbox Trade tab", self.document)
        self.assertIn("open_positions count: 0", self.document)
        self.assertIn("open_positions: NOT AVAILABLE", self.document)
        self.assertIn(
            "No BUY/SELL/order/close-all/break-even confirmation",
            self.document,
        )
        self.assertIn("no trading control was selected", self.document)

    def test_failure_decision_tree_and_rollback_are_present(self):
        self.assertIn("## Failure decision tree", self.document)
        self.assertIn("## Rollback steps", self.document)
        self.assertIn("Stop-ScheduledTask", self.document)
        self.assertIn("Disable-ScheduledTask", self.document)
        self.assertIn("revoke the quote secret", self.lower_document)
        self.assertRegex(
            self.lower_document,
            r"do not use a\s+destructive git reset",
        )

    def test_pass_fail_criteria_are_explicit(self):
        self.assertIn("## Pass and fail criteria", self.document)
        self.assertIn("passes only when all of these are evidenced", self.document)
        self.assertIn("Anything else is a failed or incomplete run", self.document)

    def test_runbook_does_not_instruct_order_testing_or_approve_real_money(self):
        forbidden_instructions = (
            "click buy",
            "click sell",
            "place a buy",
            "place a sell",
            "submit a market order",
            "test order_send",
            "enable live trading",
        )
        for instruction in forbidden_instructions:
            with self.subTest(instruction=instruction):
                self.assertNotIn(instruction, self.lower_document)
        self.assertIn("does not approve real-money execution", self.lower_document)
        self.assertIn("real-money execution, which remains blocked", self.lower_document)


if __name__ == "__main__":
    unittest.main()
