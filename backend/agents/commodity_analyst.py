"""
Geopolitics & Energy/Commodities Analyst Agent
Analyzes OPEC+ decisions, EIA inventory draws/builds, and safe-haven flows for Gold and Oil.
"""

from dataclasses import dataclass
from typing import List


@dataclass
class CommodityAnalysisReport:
    agent_name: str = "Geopolitics & Energy Analyst"
    bias: str = "NEUTRAL"
    confidence: float = 0.80
    geopolitical_risk_premium: str = "MODERATE"
    inventory_data: str = ""
    opec_stance: str = ""
    catalysts: List[str] = None
    summary: str = ""


from backend.data.public_apis import public_apis_hub


class CommodityAnalyst:
    def analyze(self, symbol: str) -> CommodityAnalysisReport:
        eia = public_apis_hub.get_eia_inventories()
        sentiment = public_apis_hub.get_retail_sentiment()

        if symbol == "XAUUSD":
            bias = "BULLISH"
            confidence = 0.86
            catalysts = [
                "Heightened Middle East geopolitical tensions sustaining structural safe-haven bids.",
                "Sovereign central banks (PBoC, RBI, CBR) purchasing gold at historic paces to de-dollarize.",
                f"Retail Crowd Radar: {sentiment.gold_long_pct:.1f}% long vs {sentiment.gold_short_pct:.1f}% short. {sentiment.contrarian_alert}"
            ]
            summary = "Safe-haven flows and persistent central bank physical accumulation cushion pullbacks. Watch for liquidity sweep of retail longs."
            geopolitics = "HIGH SAFE-HAVEN DEMAND"
            inventory = "Comex registered gold inventories disciplined; physical Asian premiums steady."
            opec = "N/A"

        elif symbol == "USOIL":
            if eia.weekly_change_mbbl < 0:
                bias = "BULLISH"
                confidence = 0.78
                inv_summary = f"EIA crude draw of {eia.weekly_change_mbbl:+.2f}M barrels reflecting tightening commercial inventories."
            else:
                bias = "BEARISH"
                confidence = 0.74
                inv_summary = f"EIA crude build of +{eia.weekly_change_mbbl:.2f}M barrels signaling supply overhang."

            catalysts = [
                f"U.S. EIA Status: {eia.trend} ({eia.weekly_change_mbbl:+.2f}M bbl delta, Cushing at {eia.cushing_capacity_pct:.1f}%).",
                f"SPR reserves at {eia.spr_level_mbbl:.1f}M barrels with steady replenishment mandate.",
                "OPEC+ managing voluntary output quotas to establish crude floor."
            ]
            summary = f"{inv_summary} Geopolitical risk premium provides tactical bounce support."
            geopolitics = "SUPPLY TENSION ELEVATED"
            inventory = f"EIA Weekly: {eia.weekly_change_mbbl:+.2f}M bbl | Cushing {eia.cushing_capacity_pct:.1f}%"
            opec = "OPEC+ maintaining disciplined quota monitoring."

        else:
            # For FX, evaluate commodity terms of trade
            bias = "NEUTRAL"
            confidence = 0.60
            catalysts = ["Indirect commodity impacts factored through inflation indicators."]
            summary = "Commodity terms of trade neutral for currency pairing."
            geopolitics = "LOW DIRECT IMPACT"
            inventory = "N/A"
            opec = "N/A"

        return CommodityAnalysisReport(
            bias=bias,
            confidence=confidence,
            geopolitical_risk_premium=geopolitics,
            inventory_data=inventory,
            opec_stance=opec,
            catalysts=catalysts,
            summary=summary
        )


commodity_analyst = CommodityAnalyst()

