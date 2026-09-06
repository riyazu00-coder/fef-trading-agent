"""
Macroeconomic, Yield & Global Session Radar
Tracks US Dollar Index (DXY), 10Y US Treasury yields, central bank rates, and global session clocks.
"""

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, List


@dataclass
class MacroState:
    dxy_index: float
    dxy_trend: str               # "BULLISH", "BEARISH", "SIDEWAYS"
    us10y_yield: float           # e.g., 4.18%
    us10y_change_bps: float      # e.g., -3.5 bps
    fed_rate: str                # "5.25% - 5.50%"
    ecb_rate: str                # "3.75%"
    boe_rate: str                # "5.00%"
    boj_rate: str                # "0.25%"
    gold_macro_bias: str         # "BULLISH", "BEARISH", "NEUTRAL"
    oil_macro_bias: str          # "BULLISH", "BEARISH", "NEUTRAL"
    active_sessions: List[str]   # e.g. ["London", "New York", "London/NY Overlap"]
    session_description: str


from backend.data.public_apis import public_apis_hub


class MacroFeed:
    def __init__(self):
        self._dxy_base = 101.45
        self._us10y_base = 4.12

    def get_macro_state(self) -> MacroState:
        now_utc = datetime.now(timezone.utc)
        hour_utc = now_utc.hour + now_utc.minute / 60.0

        # Session windows (UTC)
        # Asian: 00:00 - 09:00 UTC (Tokyo 09:00 - 18:00)
        # London: 07:00 - 16:00 UTC
        # New York: 12:00 - 21:00 UTC
        # London / NY Overlap: 12:00 - 16:00 UTC (Peak volatility)
        active_sessions = []
        if 0.0 <= hour_utc < 9.0:
            active_sessions.append("Asian (Tokyo/Sydney)")
        if 7.0 <= hour_utc < 16.0:
            active_sessions.append("London")
        if 12.0 <= hour_utc < 21.0:
            active_sessions.append("New York")
        if 12.0 <= hour_utc < 16.0:
            active_sessions.append("London / NY Overlap (Peak Volatility)")

        if not active_sessions:
            active_sessions.append("Pacific / Off-Peak")

        session_desc = " + ".join(active_sessions)

        # Ingest live FRED open macro metrics from PublicAPIsHub
        fred = public_apis_hub.get_fred_metrics()
        dxy = fred.dxy_index
        dxy_trend = fred.dxy_trend
        us10y = fred.us10y_yield
        us10y_change = fred.us10y_change_bps

        # Macro indicators evaluation:
        # Falling yields + softening DXY is historically strongly bullish for Gold (XAUUSD)
        if us10y_change < 0 and dxy_trend == "BEARISH":
            gold_bias = "BULLISH"
        elif us10y_change > 0 and dxy_trend == "BULLISH":
            gold_bias = "BEARISH"
        else:
            gold_bias = "NEUTRAL"

        oil_bias = "BEARISH"  # Default macro supply caution, enriched by CommodityAnalyst

        return MacroState(
            dxy_index=dxy,
            dxy_trend=dxy_trend,
            us10y_yield=us10y,
            us10y_change_bps=us10y_change,
            fed_rate=fred.fed_funds_rate,
            ecb_rate=fred.ecb_rate,
            boe_rate=fred.boe_rate,
            boj_rate=fred.boj_rate,
            gold_macro_bias=gold_bias,
            oil_macro_bias=oil_bias,
            active_sessions=active_sessions,
            session_description=session_desc
        )


macro_feed = MacroFeed()

