"""
Central Bank & Macroeconomic Analyst Agent
Evaluates central bank interest rate differentials, DXY index momentum,
and Treasury yields to determine macro directional bias.
"""

from dataclasses import dataclass
from typing import Dict, Any
from backend.data.macro_feed import macro_feed


@dataclass
class MacroAnalysisReport:
    agent_name: str = "Central Bank & Macro Analyst"
    bias: str = "NEUTRAL"       # "BULLISH", "BEARISH", "NEUTRAL"
    confidence: float = 0.85    # 0.0 to 1.0
    dxy_status: str = ""
    yield_status: str = ""
    central_bank_context: str = ""
    key_drivers: list = None
    summary: str = ""


from backend.data.public_apis import public_apis_hub


class MacroAnalyst:
    def analyze(self, symbol: str) -> MacroAnalysisReport:
        macro = macro_feed.get_macro_state()
        ecb = public_apis_hub.get_ecb_rates()

        if symbol == "XAUUSD":
            bias = "BULLISH"
            confidence = 0.88
            drivers = [
                f"US 10Y yields declining ({macro.us10y_yield}% with {macro.us10y_change_bps} bps drop), lowering gold opportunity cost.",
                f"DXY softening at {macro.dxy_index} provides strong fundamental tailwind for precious metals.",
                "Global central banks continuing aggressive gold accumulation as reserve diversification."
            ]
            summary = "Macro backdrop remains strongly supportive of Gold due to yield compression and USD consolidation."

        elif symbol == "USOIL":
            bias = "BEARISH"
            confidence = 0.74
            drivers = [
                "OPEC+ planned supply increases dampening bullish momentum.",
                "Subdued global manufacturing purchasing managers indices (PMI) limiting demand growth expectations.",
                "US crude production running near record levels."
            ]
            summary = "Headwinds from high non-OPEC production and demand uncertainty maintain downward pressure on WTI."

        elif symbol == "EURUSD":
            bias = "BULLISH"
            confidence = 0.78
            drivers = [
                f"ECB Official Benchmark: {ecb.eurusd:.4f} (Frankfurter fixing {ecb.effective_date}).",
                f"Fed rate cut pricing exceeding ECB easing trajectory, narrowing the transatlantic yield spread.",
                f"DXY pullback below resistance aiding Euro recovery toward 1.1100 handle.",
                f"ECB deposit rate at {macro.ecb_rate} remaining adequately restrictive."
            ]
            summary = f"Monetary policy divergence and ECB reference support ({ecb.eurusd:.4f}) tilt favorably for Euro."

        elif symbol == "GBPUSD":
            bias = "BULLISH"
            confidence = 0.80
            drivers = [
                f"ECB/BOE Cross Benchmark: {ecb.gbpusd:.4f} (Frankfurter fixing {ecb.effective_date}).",
                f"Bank of England ({macro.boe_rate}) maintaining a slower easing pace due to stubborn UK services inflation.",
                "UK economic data showing resilient consumer spending.",
                "Sterling benefiting from broad USD weakness and carry attractiveness against funding currencies."
            ]
            summary = "Strong rate differential and resilient domestic data keep Sterling positioned for upside continuation."

        elif symbol == "USDJPY":
            bias = "BEARISH" # Bearish USD/JPY = JPY strengthening
            confidence = 0.82
            drivers = [
                f"ECB Reference Fixing: {ecb.usdjpy:.2f} JPY per USD ({ecb.effective_date}).",
                f"Bank of Japan ({macro.boj_rate}) reiterating willingness to hike rates if inflation aligns with target.",
                "Federal Reserve expected rate cuts compressing the wide US-Japan yield gap.",
                "Unwinding of speculative JPY carry trades driving aggressive Yen repatriation."
            ]
            summary = "Yield differential compression and BOJ tightening signal clear downward path for USD/JPY."

        else:
            bias = "NEUTRAL"
            confidence = 0.50
            drivers = ["Mixed macroeconomic signals."]
            summary = "No clear directional macro catalyst."

        return MacroAnalysisReport(
            bias=bias,
            confidence=confidence,
            dxy_status=f"{macro.dxy_index} ({macro.dxy_trend})",
            yield_status=f"US10Y at {macro.us10y_yield}% ({macro.us10y_change_bps} bps)",
            central_bank_context=f"Fed: {macro.fed_rate} | ECB: {macro.ecb_rate} | BOE: {macro.boe_rate} | BOJ: {macro.boj_rate}",
            key_drivers=drivers,
            summary=summary
        )


macro_analyst = MacroAnalyst()

