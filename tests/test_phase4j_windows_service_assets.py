"""Static safety checks for Phase 4J Windows quote-publisher assets."""

from pathlib import Path
import re
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = PROJECT_ROOT / "deploy" / "windows" / "quote-relay"
EXPECTED_FILES = (
    ".env.example",
    "common.ps1",
    "run-once.ps1",
    "run-publisher.ps1",
    "health-check.ps1",
    "README.md",
)
SCRIPT_FILES = (
    "common.ps1",
    "run-once.ps1",
    "run-publisher.ps1",
    "health-check.ps1",
)


class TestPhase4JWindowsServiceAssets(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.assets = {
            name: (ASSET_ROOT / name).read_text(encoding="utf-8")
            for name in EXPECTED_FILES
        }
        cls.all_text = "\n".join(cls.assets.values())
        cls.lower_text = cls.all_text.lower()

    def test_expected_assets_exist(self):
        for name in EXPECTED_FILES:
            with self.subTest(name=name):
                self.assertTrue((ASSET_ROOT / name).is_file())

    def test_environment_example_contains_placeholders_only(self):
        environment = self.assets[".env.example"]
        for variable in (
            "FEF_QUOTE_RELAY_SECRET",
            "FEF_QUOTE_RELAY_URL",
            "FEF_QUOTE_SOURCE_FILE",
        ):
            with self.subTest(variable=variable):
                self.assertIn(f"{variable}=", environment)
        self.assertIn("<unique-high-entropy-quote-relay-secret>", environment)
        self.assertNotIn("phase-4g-local-only-not-production", environment)
        secret_line = next(
            line for line in environment.splitlines()
            if line.startswith("FEF_QUOTE_RELAY_SECRET=")
        )
        self.assertRegex(secret_line, r"=<[^>]+>$")

    def test_wrappers_invoke_only_existing_quote_publisher(self):
        for name in ("run-once.ps1", "run-publisher.ps1"):
            with self.subTest(name=name):
                self.assertIn("Get-FefPublisherPaths", self.assets[name])
                self.assertIn("$paths.PublisherPath", self.assets[name])
        self.assertIn("scripts\\quote_relay_publisher.py", self.assets["common.ps1"])
        self.assertNotIn("Invoke-RestMethod", self.assets["run-once.ps1"])
        self.assertNotIn("Invoke-RestMethod", self.assets["run-publisher.ps1"])

    def test_scripts_fail_closed_on_required_configuration_and_missing_source(self):
        common = self.assets["common.ps1"]
        for variable in (
            "FEF_QUOTE_RELAY_SECRET",
            "FEF_QUOTE_RELAY_URL",
            "FEF_QUOTE_SOURCE_FILE",
        ):
            with self.subTest(variable=variable):
                self.assertIn(
                    f'Assert-FefRequiredEnvironmentValue -Name "{variable}"',
                    common,
                )
        self.assertIn("Quote source file was not found", common)
        for name in ("run-once.ps1", "run-publisher.ps1", "health-check.ps1"):
            with self.subTest(name=name):
                self.assertIn("Initialize-FefQuoteRelayEnvironment", self.assets[name])
                self.assertIn("failed closed", self.assets[name])

    def test_remote_https_and_loopback_only_http_are_enforced(self):
        common = self.assets["common.ps1"]
        self.assertIn('$parsed.Scheme -eq "http" -and -not $parsed.IsLoopback', common)
        self.assertIn("Remote quote relay URLs must use HTTPS", common)
        self.assertIn("loopback HTTP for a local dry run", common)
        readme = self.assets["README.md"]
        self.assertIn("Every remote relay or status URL must use HTTPS", readme)

    def test_scripts_never_print_or_forward_the_relay_secret(self):
        for name in SCRIPT_FILES:
            for line in self.assets[name].splitlines():
                if re.search(r"Write-(Host|Output|Information|Warning|Verbose|Error)", line):
                    with self.subTest(name=name, line=line):
                        self.assertNotIn("FEF_QUOTE_RELAY_SECRET", line)
                        self.assertNotIn("relaySecret", line)
        health = self.assets["health-check.ps1"]
        self.assertNotIn("Authorization", health)
        self.assertNotIn("-Headers", health)

    def test_assets_contain_no_mutating_trading_route(self):
        forbidden_routes = (
            "/api/execute",
            "/api/quick_execute",
            "/api/break_even",
            "/api/close_all",
            "/api/close_position",
        )
        for route in forbidden_routes:
            with self.subTest(route=route):
                self.assertNotIn(route, self.all_text)
        self.assertNotIn("Invoke-RestMethod -Method Post", self.all_text)

    def test_assets_do_not_instruct_trading_action_tests(self):
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
                self.assertNotIn(instruction, self.lower_text)

    def test_health_check_is_read_only_and_checks_file_freshness(self):
        health = self.assets["health-check.ps1"]
        self.assertIn("Test-Path", self.assets["common.ps1"])
        self.assertIn("LastWriteTimeUtc", health)
        self.assertIn("MaximumFileAgeSeconds", health)
        self.assertIn("ConvertFrom-Json", health)
        self.assertIn("Invoke-RestMethod", health)
        self.assertIn("-Method Get", health)

    def test_readme_covers_operation_supervision_rotation_and_rollback(self):
        readme = self.assets["README.md"]
        required = (
            "py -3.12 -m venv .venv",
            "run-once.ps1",
            "run-publisher.ps1",
            "health-check.ps1",
            "Task Scheduler supervision",
            "Secret rotation",
            "Reboot verification and rollback",
            "fef_mt5_quote_snapshot.json",
        )
        for value in required:
            with self.subTest(value=value):
                self.assertIn(value, readme)

    def test_readme_preserves_provenance_and_real_money_block(self):
        readme = self.assets["README.md"]
        for target in (
            "source = MT5_RELAY",
            "source_label = MT5 LIVE",
            "is_broker_quote = true",
            "is_tradeable = true",
        ):
            with self.subTest(target=target):
                self.assertIn(target, readme)
        self.assertIn("Real-money execution is not approved", readme)
        self.assertIn("quote-only", readme)


if __name__ == "__main__":
    unittest.main()
