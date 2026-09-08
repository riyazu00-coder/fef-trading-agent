"""Validation primitives for a future authenticated MT5 quote relay.

This module intentionally performs no networking, persistence, or trade
execution. It defines the trust boundary that a later relay endpoint must use.
"""

from dataclasses import dataclass
import hmac
import math
import os
import time
from typing import Any, Dict, Optional

from backend.config import INSTRUMENTS


RELAY_QUOTE_REQUIRED_FIELDS = frozenset({
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
})

DEFAULT_RELAY_MAX_AGE_SECONDS = 10.0
MAX_RELAY_FUTURE_SKEW_SECONDS = 2.0
TRUSTED_RELAY_SOURCE = "MT5_RELAY"
TRUSTED_RELAY_SOURCE_LABEL = "MT5 LIVE"


class RelayAuthenticationError(ValueError):
    """Raised before payload validation when relay authentication fails."""


class RelayQuoteValidationError(ValueError):
    """Raised when a relay quote violates the expected safety contract."""


@dataclass(frozen=True)
class RelayQuoteSnapshot:
    symbol: str
    broker_symbol: str
    bid: float
    ask: float
    mid: float
    spread: float
    timestamp: float
    age_seconds: float
    source: str
    source_label: str
    is_broker_quote: bool
    is_tradeable: bool


def verify_relay_bearer_token(auth_header: str) -> bool:
    """Verify the dedicated quote-relay token using constant-time comparison."""
    if not isinstance(auth_header, str):
        return False

    parts = auth_header.strip().split(maxsplit=1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return False

    token = parts[1].strip()
    secret = os.getenv("FEF_QUOTE_RELAY_SECRET", "").strip()
    if not token or not secret:
        return False
    return hmac.compare_digest(token.encode("utf-8"), secret.encode("utf-8"))


def validate_relay_submission(
    payload: Dict[str, Any],
    auth_header: str,
    *,
    now: Optional[float] = None,
    max_age_seconds: float = DEFAULT_RELAY_MAX_AGE_SECONDS,
) -> RelayQuoteSnapshot:
    """Authenticate and validate one MT5 quote snapshot without storing it."""
    if not verify_relay_bearer_token(auth_header):
        raise RelayAuthenticationError("Missing or invalid relay Bearer token")
    return validate_relay_quote(
        payload,
        now=now,
        max_age_seconds=max_age_seconds,
    )


def validate_relay_quote(
    payload: Dict[str, Any],
    *,
    now: Optional[float] = None,
    max_age_seconds: float = DEFAULT_RELAY_MAX_AGE_SECONDS,
) -> RelayQuoteSnapshot:
    """Validate freshness, broker provenance, and numeric quote invariants."""
    if not isinstance(payload, dict):
        raise RelayQuoteValidationError("Relay quote must be a JSON object")

    missing = RELAY_QUOTE_REQUIRED_FIELDS.difference(payload)
    if missing:
        raise RelayQuoteValidationError(
            f"Relay quote missing required fields: {', '.join(sorted(missing))}"
        )

    symbol = str(payload["symbol"]).strip().upper()
    broker_symbol = str(payload["broker_symbol"]).strip()
    if symbol not in INSTRUMENTS:
        raise RelayQuoteValidationError(f"Unsupported canonical symbol: {symbol}")
    if not broker_symbol:
        raise RelayQuoteValidationError("broker_symbol is required")

    bid = _positive_number(payload["bid"], "bid")
    ask = _positive_number(payload["ask"], "ask")
    mid = _positive_number(payload["mid"], "mid")
    spread = _non_negative_number(payload["spread"], "spread")
    timestamp = _positive_number(payload["timestamp"], "timestamp")
    _non_negative_number(payload["age_seconds"], "age_seconds")

    if ask < bid:
        raise RelayQuoteValidationError("ask must be greater than or equal to bid")

    calculated_mid = (bid + ask) / 2.0
    if not math.isclose(mid, calculated_mid, rel_tol=1e-6, abs_tol=1e-9):
        raise RelayQuoteValidationError("mid must match the bid/ask midpoint")
    if not math.isclose(spread, ask - bid, rel_tol=1e-6, abs_tol=1e-9):
        raise RelayQuoteValidationError("spread must equal ask minus bid")

    observed_at = float(time.time() if now is None else now)
    age_seconds = observed_at - timestamp
    if age_seconds < -MAX_RELAY_FUTURE_SKEW_SECONDS:
        raise RelayQuoteValidationError("Relay quote timestamp is in the future")
    age_seconds = max(0.0, age_seconds)
    if age_seconds > max_age_seconds:
        raise RelayQuoteValidationError("Relay quote is stale")

    if payload["source"] != TRUSTED_RELAY_SOURCE:
        raise RelayQuoteValidationError("Only the authenticated MT5 relay may claim broker provenance")
    if payload["source_label"] != TRUSTED_RELAY_SOURCE_LABEL:
        raise RelayQuoteValidationError("Relay broker quotes must be labeled MT5 LIVE")
    if payload["is_broker_quote"] is not True or payload["is_tradeable"] is not True:
        raise RelayQuoteValidationError("MT5 relay quotes must carry explicit broker/tradeable flags")

    return RelayQuoteSnapshot(
        symbol=symbol,
        broker_symbol=broker_symbol,
        bid=bid,
        ask=ask,
        mid=mid,
        spread=spread,
        timestamp=timestamp,
        age_seconds=round(age_seconds, 3),
        source=TRUSTED_RELAY_SOURCE,
        source_label=TRUSTED_RELAY_SOURCE_LABEL,
        is_broker_quote=True,
        is_tradeable=True,
    )


def _positive_number(value: Any, field_name: str) -> float:
    number = _finite_number(value, field_name)
    if number <= 0:
        raise RelayQuoteValidationError(f"{field_name} must be positive")
    return number


def _non_negative_number(value: Any, field_name: str) -> float:
    number = _finite_number(value, field_name)
    if number < 0:
        raise RelayQuoteValidationError(f"{field_name} must not be negative")
    return number


def _finite_number(value: Any, field_name: str) -> float:
    if isinstance(value, bool):
        raise RelayQuoteValidationError(f"{field_name} must be numeric")
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise RelayQuoteValidationError(f"{field_name} must be numeric") from exc
    if not math.isfinite(number):
        raise RelayQuoteValidationError(f"{field_name} must be finite")
    return number
