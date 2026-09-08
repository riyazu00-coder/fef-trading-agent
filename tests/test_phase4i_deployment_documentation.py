"""Static safeguards for the Phase 4I Windows VPS deployment plan."""

from pathlib import Path
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DOCUMENT_PATH = PROJECT_ROOT / "PHASE_4I_VPS_QUOTE_RELAY_DEPLOYMENT_PLAN.md"


class TestPhase4IDeploymentDocumentation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.document = DOCUMENT_PATH.read_text(encoding="utf-8")
        cls.lower_document = cls.document.lower()

    def test_document_exists_and_is_demo_windows_vps_only(self):
        self.assertTrue(DOCUMENT_PATH.is_file())
        self.assertIn("Native Windows VPS", self.document)
        self.assertIn("Demo MT5", self.document)
        self.assertIn("first VPS deployment must use", self.document)

    def test_all_symbols_and_quote_filename_are_present(self):
        for symbol in ("XAUUSD", "USOIL", "EURUSD", "GBPUSD", "USDJPY"):
            with self.subTest(symbol=symbol):
                self.assertIn(symbol, self.document)
        self.assertIn("fef_mt5_quote_snapshot.json", self.document)

    def test_publisher_environment_and_https_boundary_are_explicit(self):
        required_variables = (
            "FEF_QUOTE_SOURCE_FILE",
            "FEF_QUOTE_RELAY_URL",
            "FEF_QUOTE_PUBLISH_INTERVAL_SECONDS",
            "FEF_QUOTE_RELAY_SECRET",
        )
        for variable in required_variables:
            with self.subTest(variable=variable):
                self.assertIn(variable, self.document)
        self.assertIn("unique-high-entropy-secret", self.document)
        self.assertIn("Every non-loopback", self.document)
        self.assertIn("must use `https://`", self.document)
        self.assertRegex(self.document, r"Plain\s+HTTP is prohibited")

    def test_exact_python_and_git_preflight_commands_are_documented(self):
        required_commands = (
            "py -3.12 --version",
            "py -3.12 -m venv .venv",
            "git branch --show-current",
            "git rev-parse HEAD",
            "git status --short",
            "git pull --ff-only origin main",
        )
        for command in required_commands:
            with self.subTest(command=command):
                self.assertIn(command, self.document)

    def test_one_shot_and_continuous_commands_are_distinct(self):
        self.assertIn(
            ".\\scripts\\quote_relay_publisher.py --once",
            self.document,
        )
        self.assertIn(
            ".\\scripts\\quote_relay_publisher.py\n```",
            self.document,
        )
        self.assertIn("publisher enters continuous mode when `--once` is omitted", self.document)

    def test_supervision_reboot_monitoring_and_rollback_are_documented(self):
        required_sections = (
            "Native Task Scheduler baseline",
            "NSSM/Windows service option",
            "Logging, monitoring, and alerting",
            "Reboot recovery test",
            "Failure modes and rollback",
        )
        for section in required_sections:
            with self.subTest(section=section):
                self.assertIn(section, self.document)
        self.assertIn("Get-ScheduledTask", self.document)
        self.assertIn("Stop and disable the scheduled task/service", self.document)

    def test_exact_relay_and_status_provenance_targets_are_present(self):
        targets = (
            "HTTP 202",
            "source = MT5_RELAY",
            "source_label = MT5 LIVE",
            "is_broker_quote = true",
            "is_tradeable = true",
            "open_positions` remains empty",
        )
        for target in targets:
            with self.subTest(target=target):
                self.assertIn(target, self.document)
        self.assertIn("/api/relay/quotes", self.document)
        self.assertIn("/api/status", self.document)

    def test_secret_redaction_and_execution_isolation_are_required(self):
        self.assertRegex(
            self.document,
            r"must not authorize\s+any execution route",
        )
        self.assertIn("must not contain secrets", self.document)
        self.assertRegex(
            self.document,
            r"does not expose\s+MT5, Common Files, a command listener, or trading endpoints",
        )
        self.assertIn("do not send the relay secret to GET", self.document)

    def test_document_does_not_instruct_trade_testing_or_approve_real_money(self):
        self.assertIn("real-money execution remains blocked", self.lower_document)
        self.assertIn("is not approved", self.lower_document)
        self.assertIn("no buy/sell testing or order testing occurs", self.lower_document)
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
