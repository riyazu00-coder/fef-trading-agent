"""
Unit tests for the upgraded Smart Money Concepts (SMC) Engine:
1. Strict 3-candle Fair Value Gap (FVG) detection, pip sizing, noise filtering (< 3.0 pips), and mitigation.
2. Institutional Order Block (OB) detection with >= 20 pips displacement and mitigation tracking.
3. Normalized institutional bias scoring (-1.0 to +1.0).
4. Calibrated 100-pip Stop Loss and 200-pip Take Profit execution brackets.
"""

import unittest
from backend.config import INSTRUMENTS
from backend.agents.technical_analyst import technical_analyst, Candle, TechnicalAnalysisReport


class TestSMCEngine(unittest.TestCase):
    def test_strict_3_candle_fvg_detection_and_filtering(self):
        """
        Verify strict 3-candle imbalance detection:
        Bullish: Candle[i].low > Candle[i-2].high
        Bearish: Candle[i].high < Candle[i-2].low
        Noise filter: Ignore gaps under 3.0 pips.
        """
        spec = INSTRUMENTS["XAUUSD"] # pip_size = 0.10
        p = spec.pip_size

        # Construct candles with:
        # 1. Noise gap (< 3.0 pips = < $0.30): e.g. 1.5 pips ($0.15)
        # 2. Significant gap (>= 3.0 pips): e.g. 6.0 pips ($0.60)
        candles = [
            Candle(open=2500.0, high=2501.0, low=2499.5, close=2500.5), # i=0
            Candle(open=2500.5, high=2502.0, low=2500.0, close=2501.8), # i=1
            # Noise gap: low=2501.15 > i=0 high (2501.0). Gap = $0.15 = 1.5 pips (< 3.0 pips filter)
            Candle(open=2501.8, high=2503.0, low=2501.15, close=2502.8), # i=2
            # Overlapping candle (no gap with i=1): low=2501.8 <= i=1 high (2502.0)
            Candle(open=2502.8, high=2505.0, low=2501.8, close=2504.8), # i=3
            # Valid gap: low=2504.0 > i=2 high (2503.0). Gap = $1.00 = 10.0 pips (>= 3.0 pips)
            Candle(open=2504.8, high=2506.0, low=2504.0, close=2505.5), # i=4
        ]

        fvgs = technical_analyst.detect_fair_value_gaps(candles, spec, current_price=2506.0)

        # The noise gap at i=2 (1.5 pips) must be filtered out
        self.assertEqual(len(fvgs), 1)
        valid_fvg = fvgs[0]
        self.assertEqual(valid_fvg["type"], "Bullish FVG")
        self.assertEqual(valid_fvg["gap_pips"], 10.0)
        self.assertEqual(valid_fvg["bottom"], 2503.0)
        self.assertEqual(valid_fvg["top"], 2504.0)
        self.assertEqual(valid_fvg["mitigation_status"], "UNMITIGATED")
        self.assertFalse(valid_fvg["mitigated"])

    def test_fvg_dynamic_mitigation_states(self):
        """Verify dynamic mitigation tracking: UNMITIGATED, TESTED, MITIGATED."""
        spec = INSTRUMENTS["EURUSD"] # pip_size = 0.0001
        p = spec.pip_size

        candles = [
            Candle(open=1.1000, high=1.1010, low=1.0990, close=1.1005), # i=0: high = 1.1010
            Candle(open=1.1005, high=1.1025, low=1.1000, close=1.1020), # i=1
            Candle(open=1.1020, high=1.1040, low=1.1020, close=1.1035), # i=2: low = 1.1020 (gap = 10 pips)
        ]

        # Case 1: Current price well above top (1.1050) -> UNMITIGATED
        fvgs_unmit = technical_analyst.detect_fair_value_gaps(candles, spec, current_price=1.1050)
        self.assertEqual(fvgs_unmit[0]["mitigation_status"], "UNMITIGATED")
        self.assertFalse(fvgs_unmit[0]["mitigated"])

        # Case 2: Current price inside the gap (1.1015) -> TESTED
        fvgs_tested = technical_analyst.detect_fair_value_gaps(candles, spec, current_price=1.1015)
        self.assertEqual(fvgs_tested[0]["mitigation_status"], "TESTED")
        self.assertFalse(fvgs_tested[0]["mitigated"])

        # Case 3: Current price breached below gap bottom (1.1005) -> MITIGATED
        fvgs_mit = technical_analyst.detect_fair_value_gaps(candles, spec, current_price=1.1005)
        self.assertEqual(fvgs_mit[0]["mitigation_status"], "MITIGATED")
        self.assertTrue(fvgs_mit[0]["mitigated"])

    def test_order_block_detection_and_displacement(self):
        """
        Verify Bullish OB: Bearish candle followed by upward displacement >= 20 pips.
        Verify Bearish OB: Bullish candle followed by downward displacement >= 20 pips.
        """
        spec = INSTRUMENTS["USOIL"] # pip_size = 0.01, 20 pips = $0.20
        p = spec.pip_size

        # Bullish OB scenario:
        candles_bull = [
            # Candle 0: Bearish candle (close < open)
            Candle(open=74.50, high=74.60, low=74.30, close=74.35),
            # Candle 1: Displacement starts
            Candle(open=74.35, high=74.55, low=74.30, close=74.50),
            # Candle 2: Expansion reaching 74.85 (displacement = 74.85 - 74.30 = 0.55 = 55 pips >= 20 pips)
            Candle(open=74.50, high=74.85, low=74.45, close=74.80),
        ]
        obs_bull = technical_analyst.detect_order_blocks(candles_bull, spec, current_price=74.80)
        self.assertEqual(len(obs_bull), 1)
        ob = obs_bull[0]
        self.assertEqual(ob["type"], "Bullish OB")
        self.assertEqual(ob["displacement_pips"], 55.0)
        self.assertEqual(ob["top"], 74.60)
        self.assertEqual(ob["bottom"], 74.30)
        self.assertEqual(ob["mitigation_status"], "UNMITIGATED")

        # Bearish OB scenario:
        candles_bear = [
            # Candle 0: Bullish candle (close > open)
            Candle(open=75.00, high=75.25, low=74.95, close=75.20),
            # Candle 1: Displacement down
            Candle(open=75.20, high=75.20, low=74.80, close=74.85),
            # Candle 2: Expansion reaching 74.50 (displacement = 75.25 - 74.50 = 0.75 = 75 pips >= 20 pips)
            Candle(open=74.85, high=74.90, low=74.50, close=74.55),
        ]
        obs_bear = technical_analyst.detect_order_blocks(candles_bear, spec, current_price=74.55)
        self.assertEqual(len(obs_bear), 1)
        ob_b = obs_bear[0]
        self.assertEqual(ob_b["type"], "Bearish OB")
        self.assertEqual(ob_b["displacement_pips"], 75.0)
        self.assertEqual(ob_b["top"], 75.25)
        self.assertEqual(ob_b["bottom"], 74.95)
        self.assertEqual(ob_b["mitigation_status"], "UNMITIGATED")

    def test_institutional_score_normalization(self):
        """Verify institutional bias score is normalized within [-1.0, 1.0]."""
        obs_bullish = [{"type": "Bullish OB", "mitigated": False}, {"type": "Bullish OB", "mitigated": False}]
        fvgs_bullish = [{"type": "Bullish FVG", "mitigated": False}, {"type": "Bullish FVG", "mitigated": False}]
        
        score_max = technical_analyst.calculate_institutional_score(obs_bullish, fvgs_bullish, trend_bias="BULLISH")
        self.assertLessEqual(score_max, 1.0)
        self.assertGreaterEqual(score_max, 0.5)

        obs_bearish = [{"type": "Bearish OB", "mitigated": False}, {"type": "Bearish OB", "mitigated": False}]
        fvgs_bearish = [{"type": "Bearish FVG", "mitigated": False}, {"type": "Bearish FVG", "mitigated": False}]
        
        score_min = technical_analyst.calculate_institutional_score(obs_bearish, fvgs_bearish, trend_bias="BEARISH")
        self.assertGreaterEqual(score_min, -1.0)
        self.assertLessEqual(score_min, -0.5)

    def test_calibrated_100_pip_sl_and_200_pip_tp_across_instruments(self):
        """Verify strict 100-pip Stop Loss and 200-pip Take Profit prices across all instruments."""
        for symbol in ["XAUUSD", "USOIL", "EURUSD", "GBPUSD", "USDJPY"]:
            rep = technical_analyst.analyze(symbol)
            spec = INSTRUMENTS[symbol]

            self.assertEqual(rep.stop_pips, 100.0)
            self.assertEqual(rep.tp_pips, 200.0)
            self.assertEqual(rep.risk_reward_ratio, 2.0)

            sl_dist = round(abs(rep.proposed_entry - rep.proposed_stop_loss) / spec.pip_size, 1)
            tp_dist = round(abs(rep.proposed_take_profit - rep.proposed_entry) / spec.pip_size, 1)

            self.assertAlmostEqual(sl_dist, 100.0, places=1)
            self.assertAlmostEqual(tp_dist, 200.0, places=1)


if __name__ == "__main__":
    unittest.main()
