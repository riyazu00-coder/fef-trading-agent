#!/usr/bin/env python3
"""Run a local, quote-only end-to-end relay verification."""

from __future__ import annotations

import json
import os
from pathlib import Path
import sys
import tempfile
import time
from typing import Any, Callable, Dict, Mapping, Optional
import urllib.error
import urllib.parse
import urllib.request


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.data.quote_relay import (  # noqa: E402
    RelayQuoteValidationError,
    validate_relay_quote,
)
from scripts.quote_relay_publisher import (  # noqa: E402
    PublisherConfig,
    PublisherConfigurationError,
    QuoteRelayPublisher,
)


DEFAULT_RELAY_URL = "http://127.0.0.1:8000/api/relay/quotes"
DEFAULT_SOURCE_FILE = PROJECT_ROOT / "examples" / "mt5_quote_snapshot.multi.json"
READ_TIMEOUT_SECONDS = 3.0
MAX_RESPONSE_BYTES = 1024 * 1024
SUPPORTED_SYMBOLS = ("XAUUSD", "USOIL", "EURUSD", "GBPUSD", "USDJPY")


class DryRunError(ValueError):
    """Raised when the local quote-only verification cannot complete safely."""


def _local_publisher_config(
    source_file: Path,
    environment: Optional[Mapping[str, str]] = None,
) -> PublisherConfig:
    env = os.environ if environment is None else environment
    relay_url = str(env.get("FEF_QUOTE_RELAY_URL", DEFAULT_RELAY_URL)).strip()
    publisher_env = {
        "FEF_QUOTE_RELAY_URL": relay_url,
        "FEF_QUOTE_RELAY_SECRET": str(
            env.get("FEF_QUOTE_RELAY_SECRET", "")
        ).strip(),
        "FEF_QUOTE_SOURCE_FILE": str(source_file),
        "FEF_QUOTE_PUBLISH_INTERVAL_SECONDS": "1",
    }
    config = PublisherConfig.from_environment(publisher_env)
    hostname = urllib.parse.urlsplit(config.relay_url).hostname
    if hostname not in {"127.0.0.1", "localhost", "::1"}:
        raise PublisherConfigurationError(
            "Phase 4F dry run requires a loopback relay URL"
        )
    return config


def refresh_quote_fixture(source_file: Path, destination: Path, now: float) -> int:
    """Copy a Phase 4D fixture with fresh timestamps and validate each quote."""
    try:
        payload = json.loads(source_file.read_text(encoding="utf-8"))
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        raise DryRunError(f"quote fixture unavailable ({type(exc).__name__})") from exc

    quotes = payload.get("quotes") if isinstance(payload, dict) else None
    if not isinstance(quotes, list) or not quotes:
        raise DryRunError("quote fixture must contain a non-empty quotes list")

    for quote in quotes:
        if not isinstance(quote, dict):
            raise DryRunError("quote fixture contains a non-object entry")
        quote["timestamp"] = float(now)
        quote["age_seconds"] = 0.0
        try:
            validate_relay_quote(quote, now=now)
        except RelayQuoteValidationError as exc:
            raise DryRunError(f"invalid quote fixture ({exc})") from exc

    try:
        destination.write_text(
            json.dumps(payload, indent=2) + "\n",
            encoding="utf-8",
        )
    except OSError as exc:
        raise DryRunError(
            f"fresh quote fixture could not be written ({type(exc).__name__})"
        ) from exc
    return len(quotes)


def _read_json(
    url: str,
    *,
    opener: Callable[..., Any],
) -> Dict[str, Any]:
    request = urllib.request.Request(
        url,
        headers={"Accept": "application/json"},
        method="GET",
    )
    try:
        with opener(request, timeout=READ_TIMEOUT_SECONDS) as response:
            status = int(getattr(response, "status", response.getcode()))
            raw = response.read(MAX_RESPONSE_BYTES + 1)
    except (OSError, TimeoutError, urllib.error.URLError) as exc:
        raise DryRunError(f"backend unavailable ({type(exc).__name__})") from exc

    if not 200 <= status < 300:
        raise DryRunError(f"backend read failed (HTTP {status})")
    if len(raw) > MAX_RESPONSE_BYTES:
        raise DryRunError("backend response exceeded size limit")
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise DryRunError("backend returned invalid JSON") from exc
    if not isinstance(payload, dict):
        raise DryRunError("backend returned a non-object response")
    return payload


def _verified_symbol(quotes: Any) -> str:
    if not isinstance(quotes, dict):
        raise DryRunError("relay response has no quote map")
    for symbol in SUPPORTED_SYMBOLS:
        quote = quotes.get(symbol)
        if not isinstance(quote, dict):
            continue
        if (
            quote.get("source") == "MT5_RELAY"
            and quote.get("source_label") == "MT5 LIVE"
            and quote.get("is_broker_quote") is True
            and quote.get("is_tradeable") is True
        ):
            return symbol
    raise DryRunError("no validated MT5 relay quote was returned")


def run_dry_run(
    *,
    environment: Optional[Mapping[str, str]] = None,
    opener: Callable[..., Any] = urllib.request.urlopen,
    now_fn: Callable[[], float] = time.time,
    sleep_fn: Callable[[float], None] = time.sleep,
    log_fn: Callable[[str], None] = print,
) -> int:
    """Publish a fresh fixture and verify relay/status read paths."""
    env = os.environ if environment is None else environment
    source_file = Path(
        str(env.get("FEF_QUOTE_SOURCE_FILE", DEFAULT_SOURCE_FILE)).strip()
    )
    now = float(now_fn())

    try:
        with tempfile.TemporaryDirectory(prefix="fef-quote-dry-run-") as temp_dir:
            fresh_source = Path(temp_dir) / "fresh_quotes.json"
            prepared = refresh_quote_fixture(source_file, fresh_source, now)
            config = _local_publisher_config(fresh_source, env)
            publisher = QuoteRelayPublisher(
                config,
                opener=opener,
                sleep_fn=sleep_fn,
                now_fn=lambda: now,
                log_fn=log_fn,
            )
            result = publisher.publish_once()
            if result["submitted"] != prepared or result["failed"] or result["invalid"]:
                raise DryRunError(
                    "quote publication incomplete "
                    f"(prepared={prepared}, submitted={result['submitted']}, "
                    f"invalid={result['invalid']}, failed={result['failed']})"
                )

            parsed_relay_url = urllib.parse.urlsplit(config.relay_url)
            base_url = urllib.parse.urlunsplit(
                (parsed_relay_url.scheme, parsed_relay_url.netloc, "", "", "")
            )
            relay_payload = _read_json(
                f"{base_url}/api/relay/quotes",
                opener=opener,
            )
            verified_symbol = _verified_symbol(relay_payload.get("quotes"))

            status_payload = _read_json(
                f"{base_url}/api/status",
                opener=opener,
            )
            status_symbol = _verified_symbol(status_payload.get("instruments"))
            if status_symbol != verified_symbol:
                raise DryRunError("relay and status verification symbols differ")

        log_fn(
            f"Phase 4F quote-only dry run PASSED: {prepared} quotes submitted; "
            f"{verified_symbol} is MT5_RELAY / MT5 LIVE in relay and status"
        )
        return 0
    except (DryRunError, PublisherConfigurationError) as exc:
        log_fn(f"Phase 4F quote-only dry run FAILED: {exc}")
        return 1


def main() -> int:
    return run_dry_run()


if __name__ == "__main__":
    raise SystemExit(main())
