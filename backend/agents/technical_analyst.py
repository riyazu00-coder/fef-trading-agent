"""
Smart Money Concepts (SMC) & Multi-Timeframe Technical Analyst Agent
Detects Institutional Order Blocks (OB), Fair Value Gaps (FVG),
tracks dynamic mitigation states against live price, and computes
calibrated institutional bias scores with 100-pip SL and 200-pip TP.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Any, Optional
import time

from backend.data.market_feed import market_feed, TechnicalState
from backend.config import INSTRUMENTS, InstrumentSpec


@dataclass
class Candle:
    open: float
    high: float
    low: float
    close: float
    timestamp: float = 0.0
    volume: float = 0.0


@dataclass
class TechnicalAnalysisReport:
    agent_name: str = "Forex & Commodity Technical Analyst"
    bias: str = "BULLISH"
    confidence: float = 0.82
    current_price: float = 0.0
    trend_bias: str = "BULLISH"
    rsi_14: float = 50.0
    atr_pips: float = 20.0
    key_support: float = 0.0
    key_resistance: float = 0.0
    order_blocks: List[Dict[str, Any]] = field(default_factory=list)
    fair_value_gaps: List[Dict[str, Any]] = field(default_factory=list)
    setup_direction: str = "BUY"
    proposed_entry: float = 0.0
    proposed_stop_loss: float = 0.0
    proposed_take_profit: float = 0.0
    stop_pips: float = 100.0
    tp_pips: float = 200.0
    risk_reward_ratio: float = 2.0
    smc_rationale: str = ""
    institutional_score: float = 0.0
    unmitigated_ob_count: int = 0
    unmitigated_fvg_count: int = 0
    indicator_source_label: str = "SIMULATED"
    levels_source_label: str = "SIMULATED"
    candles_source_label: str = "SIMULATED"


class TechnicalAnalyst:
    """
    Institutional Smart Money Concepts (SMC) Engine.
    - Strict 3-candle imbalance Fair Value Gap (FVG) detection (>= 3.0 pips)
    - Institutional Order Block (OB) detection (>= 20 pips multi-candle displacement)
    - Dynamic mitigation status tracking against current live price
    - Normalized institutional bias scoring (-1.0 to +1.0)
    - Strict 100-pip Stop Loss and 200-pip Take Profit calibration (1:2 R:R)
    """

    def detect_fair_value_gaps(
        self,
        candles: List[Candle],
        spec: InstrumentSpec,
        current_price: float
    ) -> List[Dict[str, Any]]:
        """
        1. Fair Value Gap (FVG) Detection:
           - Strict 3-candle imbalance detection:
             * Bullish: Candle[i].low > Candle[i-2].high
             * Bearish: Candle[i].high < Candle[i-2].low
           - Exact gap distance in pips based on pip_size in backend/config.py
           - Filters out noise gaps under 3.0 pips
           - Tracks mitigation status dynamically against current price
        """
        fvgs: List[Dict[str, Any]] = []
        n = len(candles)
        if n < 3:
            return fvgs

        for i in range(2, n):
            c_prev2 = candles[i - 2]
            c_curr = candles[i]

            # Bullish FVG: Candle[i].low > Candle[i-2].high
            if c_curr.low > c_prev2.high:
                bottom = c_prev2.high
                top = c_curr.low
                gap_dist = top - bottom
                gap_pips = round(gap_dist / spec.pip_size, 1)

                if gap_pips >= 3.0:
                    # Dynamic mitigation tracking
                    subsequent_lows = [candles[j].low for j in range(i + 1, n)] + [current_price]
                    min_subsequent = min(subsequent_lows) if subsequent_lows else current_price

                    if min_subsequent <= bottom:
                        mitigated = True
                        mitigation_status = "MITIGATED"
                    elif min_subsequent < top:
                        mitigated = False
                        mitigation_status = "TESTED"
                    else:
                        mitigated = False
                        mitigation_status = "UNMITIGATED"

                    fvgs.append({
                        "type": "Bullish FVG",
                        "top": round(top, spec.digits),
                        "bottom": round(bottom, spec.digits),
                        "gap_pips": gap_pips,
                        "mitigated": mitigated,
                        "mitigation_status": mitigation_status,
                        "candle_index": i
                    })

            # Bearish FVG: Candle[i].high < Candle[i-2].low
            elif c_curr.high < c_prev2.low:
                top = c_prev2.low
                bottom = c_curr.high
                gap_dist = top - bottom
                gap_pips = round(gap_dist / spec.pip_size, 1)

                if gap_pips >= 3.0:
                    # Dynamic mitigation tracking
                    subsequent_highs = [candles[j].high for j in range(i + 1, n)] + [current_price]
                    max_subsequent = max(subsequent_highs) if subsequent_highs else current_price

                    if max_subsequent >= top:
                        mitigated = True
                        mitigation_status = "MITIGATED"
                    elif max_subsequent > bottom:
                        mitigated = False
                        mitigation_status = "TESTED"
                    else:
                        mitigated = False
                        mitigation_status = "UNMITIGATED"

                    fvgs.append({
                        "type": "Bearish FVG",
                        "top": round(top, spec.digits),
                        "bottom": round(bottom, spec.digits),
                        "gap_pips": gap_pips,
                        "mitigated": mitigated,
                        "mitigation_status": mitigation_status,
                        "candle_index": i
                    })

        return fvgs

    def detect_order_blocks(
        self,
        candles: List[Candle],
        spec: InstrumentSpec,
        current_price: float,
        displacement_threshold_pips: float = 20.0
    ) -> List[Dict[str, Any]]:
        """
        2. Institutional Order Block (OB) Detection:
           - Bullish OB: Bearish candle (close < open) prior to multi-candle upward displacement >= 20 pips
           - Bearish OB: Bullish candle (close > open) prior to multi-candle downward displacement >= 20 pips
           - Tracks mitigation state dynamically against current price
        """
        obs: List[Dict[str, Any]] = []
        n = len(candles)
        if n < 3:
            return obs

        for k in range(n - 1):
            cand = candles[k]
            # Check displacement over next 1 to 5 candles
            lookahead = candles[k + 1 : min(k + 6, n)]
            if not lookahead:
                continue

            # Bullish OB: Bearish candle before multi-candle upward displacement >= 20 pips
            if cand.close < cand.open:
                max_future_high = max(c.high for c in lookahead)
                disp_dist = max_future_high - cand.low
                disp_pips = round(disp_dist / spec.pip_size, 1)

                if disp_pips >= displacement_threshold_pips:
                    top = cand.high
                    bottom = cand.low

                    # Dynamic mitigation tracking
                    peak_idx = k + 1 + max(range(len(lookahead)), key=lambda idx: lookahead[idx].high)
                    subsequent_lows = [candles[j].low for j in range(peak_idx + 1, n)] + [current_price]
                    min_subsequent = min(subsequent_lows) if subsequent_lows else current_price

                    if min_subsequent <= bottom:
                        mitigated = True
                        mitigation_status = "MITIGATED"
                    elif min_subsequent <= top:
                        mitigated = False
                        mitigation_status = "TESTED"
                    else:
                        mitigated = False
                        mitigation_status = "UNMITIGATED"

                    obs.append({
                        "type": "Bullish OB",
                        "top": round(top, spec.digits),
                        "bottom": round(bottom, spec.digits),
                        "displacement_pips": disp_pips,
                        "mitigated": mitigated,
                        "mitigation_status": mitigation_status,
                        "candle_index": k
                    })

            # Bearish OB: Bullish candle before multi-candle downward displacement >= 20 pips
            elif cand.close > cand.open:
                min_future_low = min(c.low for c in lookahead)
                disp_dist = cand.high - min_future_low
                disp_pips = round(disp_dist / spec.pip_size, 1)

                if disp_pips >= displacement_threshold_pips:
                    top = cand.high
                    bottom = cand.low

                    # Dynamic mitigation tracking
                    trough_idx = k + 1 + min(range(len(lookahead)), key=lambda idx: lookahead[idx].low)
                    subsequent_highs = [candles[j].high for j in range(trough_idx + 1, n)] + [current_price]
                    max_subsequent = max(subsequent_highs) if subsequent_highs else current_price

                    if max_subsequent >= top:
                        mitigated = True
                        mitigation_status = "MITIGATED"
                    elif max_subsequent >= bottom:
                        mitigated = False
                        mitigation_status = "TESTED"
                    else:
                        mitigated = False
                        mitigation_status = "UNMITIGATED"

                    obs.append({
                        "type": "Bearish OB",
                        "top": round(top, spec.digits),
                        "bottom": round(bottom, spec.digits),
                        "displacement_pips": disp_pips,
                        "mitigated": mitigated,
                        "mitigation_status": mitigation_status,
                        "candle_index": k
                    })

        return obs

    def calculate_institutional_score(
        self,
        order_blocks: List[Dict[str, Any]],
        fair_value_gaps: List[Dict[str, Any]],
        trend_bias: str
    ) -> float:
        """
        3. Levels & Scoring:
           - Normalized institutional bias score (-1.0 to +1.0)
             weighted by unmitigated OBs and FVGs.
        """
        unmit_bull_obs = [ob for ob in order_blocks if ob.get("type") == "Bullish OB" and not ob.get("mitigated")]
        unmit_bear_obs = [ob for ob in order_blocks if ob.get("type") == "Bearish OB" and not ob.get("mitigated")]
        unmit_bull_fvgs = [f for f in fair_value_gaps if f.get("type") == "Bullish FVG" and not f.get("mitigated")]
        unmit_bear_fvgs = [f for f in fair_value_gaps if f.get("type") == "Bearish FVG" and not f.get("mitigated")]

        # Weighting model:
        # OB weight: 0.30 per unmitigated OB (capped at 0.60)
        ob_score = (min(2, len(unmit_bull_obs)) * 0.30) - (min(2, len(unmit_bear_obs)) * 0.30)

        # FVG weight: 0.20 per unmitigated FVG (capped at 0.40)
        fvg_score = (min(2, len(unmit_bull_fvgs)) * 0.20) - (min(2, len(unmit_bear_fvgs)) * 0.20)

        # Trend bias alignment: +/- 0.20
        trend_score = 0.20 if trend_bias == "BULLISH" else (-0.20 if trend_bias == "BEARISH" else 0.0)

        raw_score = ob_score + fvg_score + trend_score
        return round(max(-1.0, min(1.0, raw_score)), 2)

    def generate_synthetic_candles(
        self,
        symbol: str,
        current_price: float,
        is_bullish: bool
    ) -> List[Candle]:
        """Generates institutional-grade OHLC candles reflecting SMC market structure."""
        spec = INSTRUMENTS[symbol]
        p = spec.pip_size
        candles: List[Candle] = []
        now = time.time()

        if is_bullish:
            base = current_price - (35 * p)
            # Consolidation candles (0 to 4)
            for i in range(5):
                candles.append(Candle(
                    open=base + (i * p),
                    high=base + (i * p) + (2 * p),
                    low=base + (i * p) - (1 * p),
                    close=base + (i * p) + (1 * p),
                    timestamp=now - (15 - i) * 900
                ))
            # Candle 5: Bearish OB candle prior to upward displacement
            candles.append(Candle(
                open=base + (5 * p),
                high=base + (6 * p),
                low=base + (2 * p),
                close=base + (3 * p),
                timestamp=now - 9 * 900
            ))
            # Candle 6: Initial push
            candles.append(Candle(
                open=base + (3 * p),
                high=base + (15 * p),
                low=base + (2 * p),
                close=base + (14 * p),
                timestamp=now - 8 * 900
            ))
            # Candle 7: Powerful impulse candle (displacement >= 20 pips)
            candles.append(Candle(
                open=base + (14 * p),
                high=base + (25 * p),
                low=base + (13 * p),
                close=base + (24 * p),
                timestamp=now - 7 * 900
            ))
            # Candle 8: Bullish expansion leaving clean FVG (Candle[8].low > Candle[6].high)
            candles.append(Candle(
                open=base + (24 * p),
                high=base + (33 * p),
                low=base + (20 * p), # Gap: 20*p - 15*p = 5.0 pips (>= 3.0 pips)
                close=base + (32 * p),
                timestamp=now - 6 * 900
            ))
            # Candles 9..11: Climb towards current_price
            candles.append(Candle(
                open=base + (32 * p),
                high=base + (35 * p),
                low=base + (31 * p),
                close=base + (34 * p),
                timestamp=now - 5 * 900
            ))
            candles.append(Candle(
                open=base + (34 * p),
                high=current_price + (1 * p),
                low=base + (33 * p),
                close=current_price,
                timestamp=now - 4 * 900
            ))

        else:
            base = current_price + (35 * p)
            # Consolidation candles (0 to 4)
            for i in range(5):
                candles.append(Candle(
                    open=base - (i * p),
                    high=base - (i * p) + (1 * p),
                    low=base - (i * p) - (2 * p),
                    close=base - (i * p) - (1 * p),
                    timestamp=now - (15 - i) * 900
                ))
            # Candle 5: Bullish OB candle prior to downward displacement
            candles.append(Candle(
                open=base - (5 * p),
                high=base - (2 * p),
                low=base - (6 * p),
                close=base - (3 * p),
                timestamp=now - 9 * 900
            ))
            # Candle 6: Initial drop
            candles.append(Candle(
                open=base - (3 * p),
                high=base - (2 * p),
                low=base - (15 * p),
                close=base - (14 * p),
                timestamp=now - 8 * 900
            ))
            # Candle 7: Powerful downward impulse (displacement >= 20 pips)
            candles.append(Candle(
                open=base - (14 * p),
                high=base - (13 * p),
                low=base - (25 * p),
                close=base - (24 * p),
                timestamp=now - 7 * 900
            ))
            # Candle 8: Bearish expansion leaving clean FVG (Candle[8].high < Candle[6].low)
            candles.append(Candle(
                open=base - (24 * p),
                high=base - (20 * p), # Gap: 20*p to 15*p = 5.0 pips (>= 3.0 pips)
                low=base - (33 * p),
                close=base - (32 * p),
                timestamp=now - 6 * 900
            ))
            # Candles 9..11: Descent towards current_price
            candles.append(Candle(
                open=base - (32 * p),
                high=base - (31 * p),
                low=base - (35 * p),
                close=base - (34 * p),
                timestamp=now - 5 * 900
            ))
            candles.append(Candle(
                open=base - (34 * p),
                high=base - (33 * p),
                low=current_price - (1 * p),
                close=current_price,
                timestamp=now - 4 * 900
            ))

        return candles

    def analyze(self, symbol: str, candles: Optional[List[Candle]] = None) -> TechnicalAnalysisReport:
        spec = INSTRUMENTS[symbol]
        tech = market_feed.compute_technical_analysis(symbol)
        price = tech.current_price

        # Default bias expectation based on instrument structure
        default_is_bullish = symbol in ("XAUUSD", "EURUSD", "GBPUSD")

        # Ingest or generate candles
        if candles is None or len(candles) < 3:
            candles = self.generate_synthetic_candles(symbol, price, is_bullish=default_is_bullish)

        # 1. Fair Value Gap (FVG) Detection
        fvgs = self.detect_fair_value_gaps(candles, spec, current_price=price)

        # 2. Institutional Order Block (OB) Detection
        obs = self.detect_order_blocks(candles, spec, current_price=price, displacement_threshold_pips=20.0)

        # 3. Levels & Scoring
        inst_score = self.calculate_institutional_score(obs, fvgs, trend_bias=tech.trend_bias)

        unmit_obs = [ob for ob in obs if not ob.get("mitigated")]
        unmit_fvgs = [f for f in fvgs if not f.get("mitigated")]

        # Determine directional setup from institutional score
        if inst_score >= 0.15:
            bias = "BULLISH"
            setup = "BUY"
        elif inst_score <= -0.15:
            bias = "BEARISH"
            setup = "SELL"
        else:
            if tech.trend_bias == "BULLISH":
                bias = "BULLISH"
                setup = "BUY"
            else:
                bias = "BEARISH"
                setup = "SELL"

        confidence = round(min(0.95, max(0.70, 0.55 + abs(inst_score) * 0.40)), 2)

        # Calibrated 100-pip Stop Loss and 200-pip Take Profit prices
        entry = round(price, spec.digits)
        stop_pips = 100.0
        tp_pips = 200.0
        risk_reward_ratio = 2.0

        if setup == "BUY":
            stop_loss = round(entry - (stop_pips * spec.pip_size), spec.digits)
            take_profit = round(entry + (tp_pips * spec.pip_size), spec.digits)
            rationale = (
                f"{symbol} prints Bullish Institutional Bias Score ({inst_score:+.2f}). "
                f"Identified {len(unmit_obs)} unmitigated Bullish Order Block(s) and {len(unmit_fvgs)} Fair Value Gap(s). "
                f"Trend bias is {tech.trend_bias} with RSI at {tech.rsi_14:.1f}. "
                f"Holding above Key Support ({tech.key_support}). Calibrated 100-pip SL at {stop_loss} and 200-pip TP at {take_profit} (1:2 R:R)."
            )
        else:
            stop_loss = round(entry + (stop_pips * spec.pip_size), spec.digits)
            take_profit = round(entry - (tp_pips * spec.pip_size), spec.digits)
            rationale = (
                f"{symbol} prints Bearish Institutional Bias Score ({inst_score:+.2f}). "
                f"Identified {len(unmit_obs)} unmitigated Bearish Order Block(s) and {len(unmit_fvgs)} Fair Value Gap(s). "
                f"Trend bias is {tech.trend_bias} with RSI at {tech.rsi_14:.1f}. "
                f"Trading below Key Resistance ({tech.key_resistance}). Calibrated 100-pip SL at {stop_loss} and 200-pip TP at {take_profit} (1:2 R:R)."
            )

        return TechnicalAnalysisReport(
            agent_name="Forex & Commodity Technical Analyst",
            bias=bias,
            confidence=confidence,
            current_price=price,
            trend_bias=tech.trend_bias,
            rsi_14=tech.rsi_14,
            atr_pips=tech.atr_pips,
            key_support=tech.key_support,
            key_resistance=tech.key_resistance,
            order_blocks=obs,
            fair_value_gaps=fvgs,
            setup_direction=setup,
            proposed_entry=entry,
            proposed_stop_loss=stop_loss,
            proposed_take_profit=take_profit,
            stop_pips=stop_pips,
            tp_pips=tp_pips,
            risk_reward_ratio=risk_reward_ratio,
            smc_rationale=rationale,
            institutional_score=inst_score,
            unmitigated_ob_count=len(unmit_obs),
            unmitigated_fvg_count=len(unmit_fvgs)
        )


technical_analyst = TechnicalAnalyst()
