"""Static safety checks for the Phase 4E MQL5 quote-only exporter."""

from pathlib import Path
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BRIDGE_PATH = PROJECT_ROOT / "mql5" / "FEF_TradingAgentsBridge.mq5"


class TestMQL5QuoteExporter(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = BRIDGE_PATH.read_text(encoding="utf-8")

    @classmethod
    def _function_body(cls, function_name, next_function_name):
        start = cls.source.index(function_name)
        end = cls.source.index(next_function_name, start)
        return cls.source[start:end]

    def test_quote_export_functions_and_stable_filename_exist(self):
        self.assertIn("bool BuildQuoteJson(", self.source)
        self.assertIn("void ExportQuoteSnapshot()", self.source)
        self.assertIn("void ExportQuoteSnapshotIfDue()", self.source)
        self.assertIn(
            '#define FEF_QUOTE_EXPORT_FILE      "fef_mt5_quote_snapshot.json"',
            self.source,
        )
        self.assertIn("ExportQuoteSnapshotIfDue();", self.source)

    def test_quote_json_contains_complete_relay_contract(self):
        body = self._function_body("bool BuildQuoteJson(", "bool WriteQuoteSnapshotAtomically(")
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
                self.assertIn(f'\\"{field}\\"', body)
        self.assertIn("MT5_RELAY", body)
        self.assertIn("MT5 LIVE", body)

    def test_all_supported_canonical_symbols_are_exported(self):
        body = self._function_body("void ExportQuoteSnapshot()", "void ExportQuoteSnapshotIfDue()")
        for symbol in ("XAUUSD", "USOIL", "EURUSD", "GBPUSD", "USDJPY"):
            with self.subTest(symbol=symbol):
                self.assertIn(f'"{symbol}"', body)

    def test_symbol_resolution_is_exact_first_and_rejects_ambiguity(self):
        body = self._function_body(
            "bool ResolveQuoteBrokerSymbol(",
            "bool BuildQuoteJson(",
        )
        exact_lookup = body.index("ReadQuoteTick(canonical_symbol, tick)")
        configured_lookup = body.index("ConfiguredQuoteBrokerSymbol(canonical_symbol)")
        variant_lookup = body.index("IsKnownQuoteSymbolVariant(candidate, canonical_symbol)")

        self.assertLess(exact_lookup, configured_lookup)
        self.assertLess(configured_lookup, variant_lookup)
        self.assertIn("if(matches != 1)", body)
        self.assertNotIn("_Symbol", body)
        self.assertIn("SymbolSelect(broker_symbol, true)", self.source)

    def test_unavailable_quotes_are_skipped_instead_of_faked(self):
        builder = self._function_body("bool BuildQuoteJson(", "bool WriteQuoteSnapshotAtomically(")
        exporter = self._function_body("void ExportQuoteSnapshot()", "void ExportQuoteSnapshotIfDue()")

        self.assertIn("if(!ResolveQuoteBrokerSymbol", builder)
        self.assertIn("return false;", builder)
        self.assertIn("if(!BuildQuoteJson", exporter)
        self.assertIn("continue;", exporter)

    def test_export_uses_common_files_atomic_temp_replace(self):
        body = self._function_body(
            "bool WriteQuoteSnapshotAtomically(",
            "void ExportQuoteSnapshot()",
        )
        self.assertIn("FEF_QUOTE_EXPORT_TEMP_FILE", body)
        self.assertIn("FILE_COMMON", body)
        self.assertIn("FileFlush(handle);", body)
        self.assertIn("FileClose(handle);", body)
        self.assertIn("FileMove(FEF_QUOTE_EXPORT_TEMP_FILE", body)
        self.assertIn("FILE_COMMON|FILE_REWRITE", body)

    def test_quote_builder_contains_no_execution_command_fields(self):
        body = self._function_body("bool BuildQuoteJson(", "bool WriteQuoteSnapshotAtomically(")
        forbidden_fields = (
            "command_id",
            "requested_symbol",
            "action",
            "volume",
            "magic_number",
            "position_ticket",
            "stop_loss",
            "take_profit",
        )
        for field in forbidden_fields:
            with self.subTest(field=field):
                self.assertNotIn(field, body)

    def test_export_contains_no_relay_secret_or_auth_token(self):
        self.assertNotIn("FEF_QUOTE_RELAY_SECRET", self.source)
        self.assertNotIn("Authorization: Bearer", self.source)
        self.assertNotIn("relay_secret", self.source.lower())

    def test_export_is_separate_from_trade_execution(self):
        body = self._function_body("void ExportQuoteSnapshot()", "void ExportQuoteSnapshotIfDue()")
        self.assertNotIn("HandleIncomingCommand", body)
        self.assertNotIn("trade.", body)
        self.assertNotIn("ORDER_SEND", body)

    def test_existing_execution_handlers_remain_present(self):
        expected_execution_contract = (
            "void HandleIncomingCommand(string json)",
            'StringFind(json, "ORDER_SEND")',
            'StringFind(json, "ORDER_CLOSE_ALL")',
            'StringFind(json, "ORDER_BREAK_EVEN")',
            "trade.Buy(volume, execution_sym",
            "trade.Sell(volume, execution_sym",
            "trade.PositionClose(ticket)",
            "trade.PositionModify(ticket, open_price, current_tp)",
        )
        for statement in expected_execution_contract:
            with self.subTest(statement=statement):
                self.assertIn(statement, self.source)


if __name__ == "__main__":
    unittest.main()
