"""
Multi-Agent State Graph Orchestrator
Coordinates Macro, Commodity, Technical analysts, the Bull vs. Bear debate engine,
Risk Guardian, and MT5 execution.
"""

from dataclasses import asdict
from datetime import datetime, timezone
import time
from typing import Dict, Any, List, Optional

from backend.graph.state import AgentStateDict
from backend.agents.macro_analyst import macro_analyst
from backend.agents.commodity_analyst import commodity_analyst
from backend.agents.technical_analyst import technical_analyst
from backend.agents.debate_engine import debate_engine
from backend.agents.risk_guardian import risk_guardian
from backend.agents.trader_agent import trader_agent
from backend.execution.mt5_socket_bridge import mt5_bridge
from backend.execution.paper_simulator import paper_simulator


class TradingGraphWorkflow:
    def __init__(self):
        pass

    def run(self, symbol: str, account_balance: float = 50000.0, risk_pct: float = 1.0, auto_execute: bool = False, manual_lot: Optional[float] = None) -> Dict[str, Any]:
        """Runs an end-to-end multi-agent evaluation for the given symbol."""
        now = time.time()
        audit_trail: List[str] = []
        audit_trail.append(f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] Ingesting live feeds for {symbol}...")

        # 1. Parallel Analyst Phase
        macro_rep = macro_analyst.analyze(symbol)
        audit_trail.append(f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] Macro Analyst: {macro_rep.bias} (Confidence {int(macro_rep.confidence*100)}%)")

        commodity_rep = commodity_analyst.analyze(symbol)
        audit_trail.append(f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] Commodity/Geopolitics: {commodity_rep.bias} (Risk {commodity_rep.geopolitical_risk_premium})")

        tech_rep = technical_analyst.analyze(symbol)
        audit_trail.append(f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] Technical Analyst: {tech_rep.bias} setup ({tech_rep.setup_direction} @ {tech_rep.proposed_entry})")

        # 2. Bull vs. Bear Debate Arena
        audit_trail.append(f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] Entering Bull vs. Bear Debate Arena...")
        debate_rep = debate_engine.run_debate(symbol, macro_rep, commodity_rep, tech_rep)
        audit_trail.append(f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] Debate concluded. Consensus: {debate_rep.consensus_bias} (Score: {debate_rep.consensus_score:+.2f})")

        # 3. Risk Guardian Verification
        account = paper_simulator.get_account_snapshot()
        current_open = len(account.open_positions)
        risk_rep = risk_guardian.evaluate(
            symbol=symbol,
            setup_direction=tech_rep.setup_direction,
            stop_pips=tech_rep.stop_pips,
            tp_pips=tech_rep.tp_pips,
            current_open_count=current_open
        )
        audit_trail.append(f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] Risk Guardian: {risk_rep.status_label}")

        # 4. Trader Agent Ticket Generation
        ticket = trader_agent.create_order_ticket(
            symbol=symbol,
            account_balance=account_balance,
            tech_rep=tech_rep,
            debate_rep=debate_rep,
            risk_rep=risk_rep,
            risk_pct=risk_pct,
            manual_lot_size=manual_lot
        )
        audit_trail.append(f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] Trader Ticket: {ticket.action} {ticket.lot_size} Lots on {symbol}")

        # 5. Execution (if auto_execute requested and order is READY)
        exec_res = None
        if auto_execute and ticket.execution_status == "READY":
            exec_res = mt5_bridge.send_order(ticket)
            ticket.execution_status = exec_res.get("status", "PENDING_ACKNOWLEDGEMENT")
            audit_trail.append(f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] Dispatched to broker: {exec_res.get('message', 'Executed')}")

        return {
            "symbol": symbol,
            "timestamp": now,
            "account_balance": account_balance,
            "risk_pct": risk_pct,
            "macro_report": asdict(macro_rep),
            "commodity_report": asdict(commodity_rep),
            "technical_report": asdict(tech_rep),
            "debate_outcome": {
                "symbol": debate_rep.symbol,
                "consensus_bias": debate_rep.consensus_bias,
                "consensus_score": debate_rep.consensus_score,
                "debate_summary": debate_rep.debate_summary,
                "approved_for_trader": debate_rep.approved_for_trader,
                "key_conditions": debate_rep.key_conditions,
                "turns": [asdict(t) for t in debate_rep.turns]
            },
            "risk_result": asdict(risk_rep),
            "order_ticket": asdict(ticket),
            "execution_result": exec_res,
            "audit_trail": audit_trail
        }


trading_graph = TradingGraphWorkflow()
