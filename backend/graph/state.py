"""
Shared State Schema for Multi-Agent Trading System.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any


@dataclass
class AgentStateDict:
    symbol: str
    timestamp: float
    account_balance: float = 50000.0
    risk_pct: float = 1.0
    current_open_count: int = 0
    
    # Reports from individual agent nodes
    macro_report: Optional[Dict[str, Any]] = None
    commodity_report: Optional[Dict[str, Any]] = None
    technical_report: Optional[Dict[str, Any]] = None
    debate_outcome: Optional[Dict[str, Any]] = None
    risk_result: Optional[Dict[str, Any]] = None
    order_ticket: Optional[Dict[str, Any]] = None
    execution_result: Optional[Dict[str, Any]] = None
    
    # Audit trail and logs
    audit_logs: List[str] = field(default_factory=list)
