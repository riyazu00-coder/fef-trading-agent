"""
Lot-Sizing Trader Agent
Synthesizes analyst reports, debate outcome, and risk parameters into a high-conviction
MetaTrader 5 order ticket with exact lot sizing and attached bracket SL/TP.
"""

from dataclasses import dataclass
from typing import Dict, Any, Optional
from backend.config import config, INSTRUMENTS, InstrumentSpec


@dataclass
class OrderTicket:
    symbol: str
    action: str              # "BUY", "SELL", "HOLD"
    lot_size: float          # e.g., 1.11 lots
    entry_price: float
    stop_loss: float
    take_profit: float
    stop_pips: float = 100.0
    tp_pips: float = 200.0
    risk_reward_ratio: float = 2.0
    cash_at_risk_usd: float = 0.0
    expected_profit_usd: float = 0.0
    account_balance: float = 0.0
    risk_pct: float = 1.0
    confidence_score: float = 0.85
    execution_status: str = "READY"    # "READY", "REJECTED", "EXECUTED"
    rationale: str = ""
    risk_approval_stamp: str = "PASSED" # "PASSED", "REJECTED"


class TraderAgent:
    def create_order_ticket(
        self,
        symbol: str,
        account_balance: float,
        tech_rep,
        debate_rep,
        risk_rep,
        risk_pct: float = 1.0,
        manual_lot_size: Optional[float] = None
    ) -> OrderTicket:
        spec = INSTRUMENTS[symbol]

        # If debate failed or risk rejected, return HOLD / REJECTED ticket
        if not debate_rep.approved_for_trader or not risk_rep.passed:
            action = "HOLD"
            lot_size = 0.0
            status = "REJECTED"
            rationale = risk_rep.reason if not risk_rep.passed else "Debate did not reach actionable consensus."
            return OrderTicket(
                symbol=symbol,
                action=action,
                lot_size=lot_size,
                entry_price=tech_rep.current_price,
                stop_loss=0.0,
                take_profit=0.0,
                stop_pips=0.0,
                tp_pips=0.0,
                risk_reward_ratio=0.0,
                cash_at_risk_usd=0.0,
                expected_profit_usd=0.0,
                account_balance=account_balance,
                risk_pct=0.0,
                confidence_score=debate_rep.consensus_score,
                execution_status=status,
                rationale=rationale,
                risk_approval_stamp="REJECTED"
            )

        action = tech_rep.setup_direction
        entry = tech_rep.proposed_entry
        sl = tech_rep.proposed_stop_loss
        tp = tech_rep.proposed_take_profit
        stop_pips = tech_rep.stop_pips
        tp_pips = tech_rep.tp_pips
        pip_val_1_lot = spec.tick_value_per_lot

        # Check for user-specified manual lot size override
        if manual_lot_size is not None and float(manual_lot_size) > 0.0:
            lot_size = round(max(spec.min_lot, min(float(manual_lot_size), spec.max_lot)), 2)
            actual_risk_usd = round(lot_size * stop_pips * pip_val_1_lot, 2)
            expected_profit_usd = round(lot_size * tp_pips * pip_val_1_lot, 2)
            rr = round(tp_pips / max(stop_pips, 1.0), 2)
            rationale = (
                f"Manual lot size active: {lot_size} Lots on {symbol}. "
                f"Auto 100-pip Stop Loss enforced at ${sl} (${actual_risk_usd:.2f} risk). Target ${tp} ({rr}:1 R:R)."
            )
        else:
            # Exact mathematical lot sizing based on account risk cap
            cash_at_risk = account_balance * (risk_pct / 100.0)
            raw_lot = cash_at_risk / max((stop_pips * pip_val_1_lot), 0.001)
            step = spec.lot_step
            lot_size = round(round(raw_lot / step) * step, 2)
            lot_size = max(spec.min_lot, min(lot_size, spec.max_lot))
            actual_risk_usd = round(lot_size * stop_pips * pip_val_1_lot, 2)
            expected_profit_usd = round(lot_size * tp_pips * pip_val_1_lot, 2)
            rr = round(tp_pips / max(stop_pips, 1.0), 2)
            rationale = (
                f"Consensus approved {action} on {symbol}. "
                f"Debate score: {debate_rep.consensus_score:+.2f}. "
                f"Auto 100-pip Stop Loss at ${sl}. Risk capped at ${actual_risk_usd:.2f} with target ${expected_profit_usd:.2f} ({rr}:1 R:R)."
            )


        return OrderTicket(
            symbol=symbol,
            action=action,
            lot_size=lot_size,
            entry_price=entry,
            stop_loss=sl,
            take_profit=tp,
            stop_pips=stop_pips,
            tp_pips=tp_pips,
            risk_reward_ratio=rr,
            cash_at_risk_usd=actual_risk_usd,
            expected_profit_usd=expected_profit_usd,
            account_balance=account_balance,
            risk_pct=risk_pct,
            confidence_score=round(abs(debate_rep.consensus_score), 2),
            execution_status="READY",
            rationale=rationale,
            risk_approval_stamp="PASSED"
        )


trader_agent = TraderAgent()
