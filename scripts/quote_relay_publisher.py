#!/usr/bin/env python3
"""Quote-only publisher for the FEF MT5 relay endpoint."""

from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass, field
import json
import os
from pathlib import Path
import ssl
import sys
import time
from typing import Any, Callable, Dict, Iterable, List, Mapping, Optional, Tuple
import urllib.error
import urllib.parse
import urllib.request


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.data.quote_relay import (  # noqa: E402
    DEFAULT_RELAY_MAX_AGE_SECONDS,
    RelayQuoteValidationError,
    validate_relay_quote,
)


RELAY_ENDPOINT_PATH = "/api/relay/quotes"
PUBLISH_TIMEOUT_SECONDS = 3.0
PUBLISH_MAX_ATTEMPTS = 2
PUBLISH_RETRY_DELAY_SECONDS = 0.5
MIN_PUBLISH_INTERVAL_SECONDS = 1.0
CA_FILE_CANDIDATES = (
    "/etc/ssl/cert.pem",
    "/etc/ssl/certs/ca-certificates.crt",
)


class PublisherConfigurationError(ValueError):
    """Raised when required publisher configuration is missing or unsafe."""


class QuoteSourceError(ValueError):
    """Raised when the local quote source cannot be read as JSON."""


@dataclass(frozen=True)
class PublisherConfig:
    relay_url: str
    relay_secret: str = field(repr=False)
    source_file: str
    interval_seconds: float

    @classmethod
    def from_environment(cls, environment: Optional[Mapping[str, str]] = None):
        env = os.environ if environment is None else environment
        raw_url = str(env.get("FEF_QUOTE_RELAY_URL", "")).strip()
        secret = str(env.get("FEF_QUOTE_RELAY_SECRET", "")).strip()
        source_file = str(env.get("FEF_QUOTE_SOURCE_FILE", "")).strip()

        if not raw_url:
            raise PublisherConfigurationError("FEF_QUOTE_RELAY_URL is required")
        if not secret:
            raise PublisherConfigurationError("FEF_QUOTE_RELAY_SECRET is required")
        if not source_file:
            raise PublisherConfigurationError("FEF_QUOTE_SOURCE_FILE is required")

        raw_interval = str(
            env.get("FEF_QUOTE_PUBLISH_INTERVAL_SECONDS", "2.0")
        ).strip()
        try:
            interval = float(raw_interval)
        except ValueError as exc:
            raise PublisherConfigurationError(
                "FEF_QUOTE_PUBLISH_INTERVAL_SECONDS must be numeric"
            ) from exc
        if not MIN_PUBLISH_INTERVAL_SECONDS <= interval <= 3600.0:
            raise PublisherConfigurationError(
                "FEF_QUOTE_PUBLISH_INTERVAL_SECONDS must be between 1 and 3600"
            )

        return cls(
            relay_url=normalize_relay_url(raw_url),
            relay_secret=secret,
            source_file=source_file,
            interval_seconds=interval,
        )


def normalize_relay_url(raw_url: str) -> str:
    """Accept only the quote endpoint over HTTPS or loopback HTTP."""
    parsed = urllib.parse.urlsplit(raw_url.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise PublisherConfigurationError("Relay URL must be an absolute HTTP(S) URL")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise PublisherConfigurationError(
            "Relay URL must not contain credentials, query parameters, or fragments"
        )
    if parsed.scheme == "http" and parsed.hostname not in {"127.0.0.1", "localhost", "::1"}:
        raise PublisherConfigurationError("Non-loopback relay URLs must use HTTPS")

    path = parsed.path.rstrip("/")
    if not path:
        path = RELAY_ENDPOINT_PATH
    if path != RELAY_ENDPOINT_PATH:
        raise PublisherConfigurationError("Relay URL must target the quote relay endpoint")
    return urllib.parse.urlunsplit(
        (parsed.scheme, parsed.netloc, path, "", "")
    )


class QuoteRelayPublisher:
    def __init__(
        self,
        config: PublisherConfig,
        *,
        opener: Callable[..., Any] = urllib.request.urlopen,
        sleep_fn: Callable[[float], None] = time.sleep,
        now_fn: Callable[[], float] = time.time,
        log_fn: Callable[[str], None] = print,
    ):
        self.config = config
        self._opener = opener
        self._sleep = sleep_fn
        self._now = now_fn
        self._log = log_fn

    def publish_once(self) -> Dict[str, int]:
        result = {"found": 0, "submitted": 0, "invalid": 0, "failed": 0}
        try:
            raw_quotes, file_timestamp = self._read_source_file()
        except QuoteSourceError as exc:
            self._log(f"Quote source unavailable: {exc}")
            result["failed"] = 1
            return result

        for default_symbol, raw_quote in raw_quotes:
            result["found"] += 1
            try:
                payload = self._normalize_quote(
                    raw_quote,
                    default_symbol=default_symbol,
                    file_timestamp=file_timestamp,
                )
            except RelayQuoteValidationError as exc:
                symbol = default_symbol or str(raw_quote.get("symbol", "UNKNOWN"))
                self._log(f"Rejected invalid quote for {symbol}: {exc}")
                result["invalid"] += 1
                continue

            if self._submit_with_retry(payload):
                result["submitted"] += 1
            else:
                result["failed"] += 1
        return result

    def run_forever(self) -> None:
        self._log(
            f"Quote publisher started for {self.config.relay_url} "
            f"at {self.config.interval_seconds:g}s intervals"
        )
        while True:
            self.publish_once()
            self._sleep(self.config.interval_seconds)

    def _read_source_file(self) -> Tuple[List[Tuple[Optional[str], Dict[str, Any]]], float]:
        try:
            file_timestamp = float(os.path.getmtime(self.config.source_file))
            with open(self.config.source_file, "r", encoding="utf-8") as source:
                payload = json.load(source)
        except (OSError, ValueError, json.JSONDecodeError) as exc:
            raise QuoteSourceError(type(exc).__name__) from exc

        quotes = list(_extract_quotes(payload))
        if not quotes:
            raise QuoteSourceError("no quote objects found")
        return quotes, file_timestamp

    def _normalize_quote(
        self,
        raw_quote: Dict[str, Any],
        *,
        default_symbol: Optional[str],
        file_timestamp: float,
    ) -> Dict[str, Any]:
        symbol = str(raw_quote.get("symbol") or default_symbol or "").strip().upper()
        broker_symbol = str(
            raw_quote.get("broker_symbol")
            or raw_quote.get("raw_symbol")
            or symbol
        ).strip()
        bid = _number(raw_quote.get("bid"), "bid")
        ask = _number(raw_quote.get("ask"), "ask")
        timestamp = _number(raw_quote.get("timestamp", file_timestamp), "timestamp")
        now = self._now()

        payload = {
            "symbol": symbol,
            "broker_symbol": broker_symbol,
            "bid": bid,
            "ask": ask,
            "mid": (bid + ask) / 2.0,
            "spread": ask - bid,
            "timestamp": timestamp,
            "age_seconds": max(0.0, now - timestamp),
            "source": "MT5_RELAY",
            "source_label": "MT5 LIVE",
            "is_broker_quote": True,
            "is_tradeable": True,
        }
        snapshot = validate_relay_quote(
            payload,
            now=now,
            max_age_seconds=DEFAULT_RELAY_MAX_AGE_SECONDS,
        )
        return asdict(snapshot)

    def _submit_with_retry(self, payload: Dict[str, Any]) -> bool:
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        request = urllib.request.Request(
            self.config.relay_url,
            data=body,
            headers={
                "Authorization": f"Bearer {self.config.relay_secret}",
                "Content-Type": "application/json",
                "User-Agent": "FEF-Quote-Relay-Publisher/1.0",
            },
            method="POST",
        )

        for attempt in range(1, PUBLISH_MAX_ATTEMPTS + 1):
            try:
                kwargs = {"timeout": PUBLISH_TIMEOUT_SECONDS}
                if self.config.relay_url.startswith("https://"):
                    kwargs["context"] = _verified_ssl_context()
                with self._opener(request, **kwargs) as response:
                    response_status = getattr(response, "status", None)
                    status = int(
                        response_status if response_status is not None else response.getcode()
                    )
                if 200 <= status < 300:
                    self._log(f"Published quote for {payload['symbol']} (HTTP {status})")
                    return True
                self._log(f"Relay rejected {payload['symbol']} (HTTP {status})")
                if status < 500:
                    return False
            except urllib.error.HTTPError as exc:
                self._log(f"Relay rejected {payload['symbol']} (HTTP {exc.code})")
                if 400 <= exc.code < 500:
                    return False
            except (OSError, TimeoutError, urllib.error.URLError) as exc:
                self._log(
                    f"Relay network failure for {payload['symbol']} "
                    f"({type(exc).__name__})"
                )

            if attempt < PUBLISH_MAX_ATTEMPTS:
                self._sleep(PUBLISH_RETRY_DELAY_SECONDS)
        return False


def _extract_quotes(payload: Any) -> Iterable[Tuple[Optional[str], Dict[str, Any]]]:
    if isinstance(payload, list):
        for item in payload:
            if isinstance(item, dict):
                yield None, item
        return

    if not isinstance(payload, dict):
        return
    if isinstance(payload.get("quotes"), (dict, list)):
        yield from _extract_quotes(payload["quotes"])
        return
    if "bid" in payload or "ask" in payload:
        yield None, payload
        return

    for symbol, quote in payload.items():
        if isinstance(quote, dict):
            yield str(symbol), quote


def _number(value: Any, field_name: str) -> float:
    if isinstance(value, bool):
        raise RelayQuoteValidationError(f"{field_name} must be numeric")
    try:
        return float(value)
    except (TypeError, ValueError) as exc:
        raise RelayQuoteValidationError(f"{field_name} must be numeric") from exc


def _verified_ssl_context():
    configured_ca = os.getenv("SSL_CERT_FILE")
    for ca_file in (configured_ca,) + CA_FILE_CANDIDATES:
        if ca_file and os.path.isfile(ca_file):
            return ssl.create_default_context(cafile=ca_file)
    return ssl.create_default_context()


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Publish local MT5 quotes to the FEF relay")
    parser.add_argument("--once", action="store_true", help="Publish one source-file snapshot and exit")
    args = parser.parse_args(argv)

    try:
        config = PublisherConfig.from_environment()
    except PublisherConfigurationError as exc:
        print(f"Publisher configuration error: {exc}")
        return 2

    publisher = QuoteRelayPublisher(config)
    if args.once:
        result = publisher.publish_once()
        return 0 if result["failed"] == 0 and result["invalid"] == 0 else 1

    try:
        publisher.run_forever()
    except KeyboardInterrupt:
        print("Quote publisher stopped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
