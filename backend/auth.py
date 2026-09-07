"""Shared authentication helpers for trading-state mutations."""

import hashlib
import hmac
import os


MUTATING_ENDPOINTS = frozenset({
    "/api/execute",
    "/api/quick_execute",
    "/api/break_even",
    "/api/close_all",
    "/api/close_position",
})


def get_bridge_secret() -> str:
    """Return the deployment-provided bridge secret, or an empty value."""
    return os.getenv("FEF_BRIDGE_SECRET", "").strip()


def verify_bearer_token(auth_header: str, body_raw: str = "") -> bool:
    """Validate a Bearer secret (or legacy body HMAC) without timing leaks."""
    if not isinstance(auth_header, str):
        return False

    parts = auth_header.strip().split(maxsplit=1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return False

    token = parts[1].strip()
    secret = get_bridge_secret()
    if not token or not secret:
        return False

    if hmac.compare_digest(token.encode("utf-8"), secret.encode("utf-8")):
        return True

    # Retain compatibility with callers that sign the exact request body.
    if body_raw:
        expected_signature = hmac.new(
            secret.encode("utf-8"),
            body_raw.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(
            token.encode("utf-8"), expected_signature.encode("utf-8")
        )

    return False
