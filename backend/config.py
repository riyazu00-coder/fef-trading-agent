"""
Configuration settings for Forex & Commodities Multi-Agent Trading System.
Tailored for: XAUUSD (Gold), USOIL (WTI Crude), EURUSD, GBPUSD, USDJPY.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional
import os


@dataclass
class InstrumentSpec:
    symbol: str
    display_name: str
    asset_type: str          # "commodity" or "forex"
    yahoo_symbol: str        # Market feed symbol
    contract_size: float     # Units per standard lot
    pip_size: float          # Minimum price move representing 1 pip
    tick_value_per_lot: float # Dollar value of 1 pip for 1.00 standard lot
    digits: int              # Price decimal places
    default_stop_pips: float
    default_tp_pips: float
    min_lot: float = 0.01
    max_lot: float = 50.0
    lot_step: float = 0.01


INSTRUMENTS: Dict[str, InstrumentSpec] = {
    "XAUUSD": InstrumentSpec(
        symbol="XAUUSD",
        display_name="Gold Spot / US Dollar",
        asset_type="commodity",
        yahoo_symbol="GC=F",
        contract_size=100.0,
        pip_size=0.10,
        tick_value_per_lot=10.0,
        digits=2,
        default_stop_pips=100.0,
        default_tp_pips=250.0,
        min_lot=0.01,
        max_lot=20.0,
        lot_step=0.01
    ),
    "USOIL": InstrumentSpec(
        symbol="USOIL",
        display_name="WTI Crude Oil",
        asset_type="commodity",
        yahoo_symbol="CL=F",
        contract_size=1000.0,
        pip_size=0.01,
        tick_value_per_lot=10.0,
        digits=2,
        default_stop_pips=100.0,
        default_tp_pips=200.0,
        min_lot=0.01,
        max_lot=20.0,
        lot_step=0.01
    ),
    "EURUSD": InstrumentSpec(
        symbol="EURUSD",
        display_name="Euro / US Dollar",
        asset_type="forex",
        yahoo_symbol="EURUSD=X",
        contract_size=100000.0,
        pip_size=0.0001,
        tick_value_per_lot=10.0,
        digits=5,
        default_stop_pips=100.0,
        default_tp_pips=200.0,
        min_lot=0.01,
        max_lot=50.0,
        lot_step=0.01
    ),
    "GBPUSD": InstrumentSpec(
        symbol="GBPUSD",
        display_name="British Pound / US Dollar",
        asset_type="forex",
        yahoo_symbol="GBPUSD=X",
        contract_size=100000.0,
        pip_size=0.0001,
        tick_value_per_lot=10.0,
        digits=5,
        default_stop_pips=100.0,
        default_tp_pips=200.0,
        min_lot=0.01,
        max_lot=50.0,
        lot_step=0.01
    ),
    "USDJPY": InstrumentSpec(
        symbol="USDJPY",
        display_name="US Dollar / Japanese Yen",
        asset_type="forex",
        yahoo_symbol="JPY=X",
        contract_size=100000.0,
        pip_size=0.01,
        tick_value_per_lot=6.80,
        digits=3,
        default_stop_pips=100.0,
        default_tp_pips=200.0,
        min_lot=0.01,
        max_lot=50.0,
        lot_step=0.01
    ),
}


@dataclass
class RiskSettings:
    max_account_risk_pct: float = 1.0
    max_daily_drawdown_pct: float = 3.0
    max_open_positions: int = 3
    min_risk_reward_ratio: float = 2.0
    news_blackout_minutes: int = 15
    max_spread_pips: Dict[str, float] = field(default_factory=lambda: {
        "XAUUSD": 4.5,
        "USOIL": 5.0,
        "EURUSD": 1.5,
        "GBPUSD": 2.0,
        "USDJPY": 1.8,
    })


@dataclass
class ServerSettings:
    host: str = "0.0.0.0"
    port: int = 8000
    mt5_socket_port: int = 5555
    mt5_magic_number: int = 888999


class AppConfig:
    instruments = INSTRUMENTS
    risk = RiskSettings()
    server = ServerSettings()
    
    openai_api_key: Optional[str] = os.getenv("OPENAI_API_KEY")
    anthropic_api_key: Optional[str] = os.getenv("ANTHROPIC_API_KEY")
    deepseek_api_key: Optional[str] = os.getenv("DEEPSEEK_API_KEY")
    groq_api_key: Optional[str] = os.getenv("GROQ_API_KEY")
    
    default_model: str = os.getenv("DEFAULT_MODEL", "gpt-4o")
    use_paper_trading: bool = os.getenv("USE_PAPER_TRADING", "true").lower() == "true"
    initial_paper_balance: float = float(os.getenv("INITIAL_PAPER_BALANCE", "50000.0"))


config = AppConfig()
