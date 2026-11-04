# FEF CORTEX Phase 18 — Asset Registry and Coverage Report

**Project**: FEF CORTEX
**Branch**: `recovery-v122-agents`
**Operating Mode**: `CANONICAL_EXECUTION_MODE = 'READ_ONLY'`
**Date**: November 3, 2026
**Status**: 26 CANONICAL ASSETS AUDITED AGAINST LIVE BROKER ENVIRONMENT

---

## 1. Executive Summary

This report establishes the complete asset registry, broker symbol resolution, data source status, quote freshness, and multi-timeframe candle coverage across all supported asset classes in FEF CORTEX.

The system is designed to be **genuinely multi-asset**, monitoring Forex Majors, Forex Minors, Precious Metals, Energy Commodities, Global Indices, and Cryptocurrencies.

---

## 2. Master Symbol Coverage Matrix (26 Canonical Assets)

| Symbol | Category | Broker Symbol | Provider | Broker Feed Status | Quote Freshness | Timeframe Coverage (M1–D1) | Total Bars in Bridge | Scanner Status |
|---|---|---|---|:---:|:---:|:---:|:---:|:---:|
| **XAUUSD** | METALS | `XAUUSD` | Exness MT5 | **LIVE** | FRESH (< 3s) | M1, M5, M15, M30, H1, H4, D1 | 245 | REGISTERED |
| **XAGUSD** | METALS | `XAGUSD` | Exness MT5 | **LIVE** | FRESH (< 5s) | M1, M5, M15, M30, H1, H4, D1 | 245 | REGISTERED |
| **EURUSD** | FOREX | `EURUSD` | Exness MT5 | **LIVE** | FRESH (< 3s) | M1, M5, M15, M30, H1, H4, D1 | 245 | REGISTERED |
| **GBPUSD** | FOREX | `GBPUSD` | Exness MT5 | **LIVE** | FRESH (< 7s) | M1, M5, M15, M30, H1, H4, D1 | 245 | REGISTERED |
| **USDJPY** | FOREX | `USDJPY` | Exness MT5 | **LIVE** | FRESH (< 6s) | M1, M5, M15, M30, H1, H4, D1 | 245 | REGISTERED |
| **AUDUSD** | FOREX | `AUDUSD` | Exness MT5 | **LIVE** | FRESH (< 4s) | M1, M5, M15, M30, H1, H4, D1 | 245 | REGISTERED |
| **NZDUSD** | FOREX | `NZDUSD` | Exness MT5 | **LIVE** | FRESH (< 7s) | M1, M5, M15, M30, H1, H4, D1 | 245 | REGISTERED |
| **USDCAD** | FOREX | `USDCAD` | Exness MT5 | **LIVE** | FRESH (< 3s) | M1, M5, M15, M30, H1, H4, D1 | 245 | REGISTERED |
| **USDCHF** | FOREX | `USDCHF` | Exness MT5 | **LIVE** | FRESH (< 3s) | M1, M5, M15, M30, H1, H4, D1 | 245 | REGISTERED |
| **GBPJPY** | FOREX | `GBPJPY` | Exness MT5 | **LIVE** | FRESH (< 4s) | M1, M5, M15, M30, H1, H4, D1 | 245 | REGISTERED |
| **EURJPY** | FOREX | `EURJPY` | Exness MT5 | **LIVE** | FRESH (< 7s) | M1, M5, M15, M30, H1, H4, D1 | 245 | REGISTERED |
| **EURGBP** | FOREX | `EURGBP` | Exness MT5 | **LIVE** | FRESH (< 7s) | M1, M5, M15, M30, H1, H4, D1 | 245 | REGISTERED |
| **US100** | INDICES | `USTEC` | Exness MT5 | **LIVE** | FRESH (< 3s) | M1, M5, M15, M30, H1, H4, D1 | 245 | REGISTERED |
| **US30** | INDICES | `US30` | Exness MT5 | **LIVE** | FRESH (< 3s) | M1, M5, M15, M30, H1, H4, D1 | 245 | REGISTERED |
| **US500** | INDICES | `US500` | Exness MT5 | **LIVE** | FRESH (< 3s) | M1, M5, M15, M30, H1, H4, D1 | 245 | REGISTERED |
| **GER40** | INDICES | `GER40` | Exness MT5 | **UNAVAILABLE** | OFFLINE | N/A (Not on trial account) | 0 | DEGRADED |
| **UK100** | INDICES | `UK100` | Exness MT5 | **LIVE** | FRESH (< 10s) | M1, M5, M15, M30, H1, H4, D1 | 245 | REGISTERED |
| **JP225** | INDICES | `JP225` | Exness MT5 | **LIVE** | FRESH (< 10s) | M1, M5, M15, M30, H1, H4, D1 | 245 | REGISTERED |
| **USOIL** | COMMODITIES | `USOIL` | Exness MT5 | **LIVE** | FRESH (< 5s) | M1, M5, M15, M30, H1, H4, D1 | 245 | REGISTERED |
| **UKOIL** | COMMODITIES | `UKOIL` | Exness MT5 | **LIVE** | FRESH (< 5s) | M1, M5, M15, M30, H1, H4, D1 | 245 | REGISTERED |
| **NATGAS** | COMMODITIES | `XNGUSD` | Exness MT5 | **LIVE** | FRESH (< 5s) | M1, M5, M15, M30, H1, H4, D1 | 245 | REGISTERED |
| **BTCUSD** | CRYPTO | `BTCUSD` | Exness MT5 | **LIVE** | FRESH (< 3s) | M1, M5, M15, M30, H1, H4, D1 | 245 | REGISTERED |
| **ETHUSD** | CRYPTO | `ETHUSD` | Exness MT5 | **LIVE** | FRESH (< 3s) | M1, M5, M15, M30, H1, H4, D1 | 245 | REGISTERED |
| **SOLUSD** | CRYPTO | `SOLUSD` | Exness MT5 | **LIVE** | FRESH (< 5s) | M1, M5, M15, M30, H1, H4, D1 | 245 | REGISTERED |
| **XRPUSD** | CRYPTO | `XRPUSD` | Exness MT5 | **LIVE** | FRESH (< 5s) | M1, M5, M15, M30, H1, H4, D1 | 245 | REGISTERED |
| **BNBUSD** | CRYPTO | `BNBUSD` | Exness MT5 | **LIVE** | FRESH (< 5s) | M1, M5, M15, M30, H1, H4, D1 | 245 | REGISTERED |

---

## 3. Findings on Discrepancies and Bottlenecks

1. **Broker Resolution Mappings**:
   - `US100` is mapped to broker symbol `USTEC` by the bridge. This mapping is verified and functioning.
   - `NATGAS` is mapped to broker symbol `XNGUSD`. Verified and functioning.
   - `GER40` is not offered by the current trial server (`Exness-MT5Trial16`). The bridge correctly flags this as `NOT_SUPPORTED_BY_BROKER` without crashing.

2. **Scanner Narrowing Defect in Worker**:
   - In `scripts/fef-background-worker.ts`, the scanner was limited to an arbitrary 8 symbols:
     `['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'USOIL', 'BTCUSD', 'US100', 'US500']`.
   - The remaining 17 active broker symbols (`XAGUSD`, `US30`, `UK100`, `JP225`, `UKOIL`, `NATGAS`, `AUDUSD`, `NZDUSD`, `USDCAD`, `USDCHF`, `GBPJPY`, `EURJPY`, `EURGBP`, `ETHUSD`, `SOLUSD`, `XRPUSD`, `BNBUSD`) were **never analyzed or fed into the candidate intake coordinator by the worker**!

3. **Required Core Correction**:
   - `BackgroundAutonomousWorker` and `candidateIntakeCoordinator` must iterate over the **full 25 verified live symbols**, dynamically discovering available symbols from `MARKET_REGISTRY` and the live bridge rather than relying on an 8-symbol hardcoded slice.
