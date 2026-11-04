# FEF CORTEX — PHASE 18.1
## Multi-Asset Analysis, Specifications & Isolation Verification

**Date:** 2026-11-03
**Status:** VERIFIED & PASS
**Branch:** `recovery-v122-agents`
**Execution Mode:** `READ_ONLY`

---

## 1. Asset Class Coverage Overview

FEF CORTEX monitors 26 canonical assets partitioned into 5 distinct asset classes:
1. **Precious Metals (4):** `XAUUSD`, `XAGUSD`, `XPTUSD`, `XPDUSD`
2. **Forex Majors & Crosses (10):** `EURUSD`, `GBPUSD`, `USDJPY`, `AUDUSD`, `USDCAD`, `USDCHF`, `NZDUSD`, `EURGBP`, `EURJPY`, `GBPJPY`
3. **Global Equity Indices (6):** `US30`, `US100`, `US500`, `UK100`, `GER40`, `JP225`
4. **Commodities / Energies (3):** `USOIL`, `UKOIL`, `NGAS`
5. **Cryptocurrencies (3):** `BTCUSD`, `ETHUSD`, `SOLUSD`

---

## 2. Authoritative Broker Symbol Translation & Specifications

Authoritative specification resolution is handled by `mt5BridgeClient.getBrokerSpecifications()` and mapped through `src/lib/agents/multi-asset-pipeline.ts` and `src/lib/bridge/broker-spec-resolver.ts`.

### Specification Mapping Matrix:
| Canonical Asset | Broker Ticker | Contract Size | Min Lot | Lot Step | Digits | Min Tick | Spread Gate Max (pts) |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **XAUUSD** | `XAUUSDm` | 100 oz | 0.01 | 0.01 | 2 | 0.01 | 45 |
| **XAGUSD** | `XAGUSDm` | 5,000 oz | 0.01 | 0.01 | 3 | 0.001 | 60 |
| **XPTUSD** | `XPTUSDm` | 100 oz | 0.01 | 0.01 | 2 | 0.01 | 120 |
| **XPDUSD** | `XPDUSDm` | 100 oz | 0.01 | 0.01 | 2 | 0.01 | 180 |
| **EURUSD** | `EURUSDm` | 100,000 | 0.01 | 0.01 | 5 | 0.00001 | 20 |
| **GBPUSD** | `GBPUSDm` | 100,000 | 0.01 | 0.01 | 5 | 0.00001 | 25 |
| **USDJPY** | `USDJPYm` | 100,000 | 0.01 | 0.01 | 3 | 0.001 | 25 |
| **AUDUSD** | `AUDUSDm` | 100,000 | 0.01 | 0.01 | 5 | 0.00001 | 25 |
| **USDCAD** | `USDCADm` | 100,000 | 0.01 | 0.01 | 5 | 0.00001 | 25 |
| **USDCHF** | `USDCHFm` | 100,000 | 0.01 | 0.01 | 5 | 0.00001 | 25 |
| **NZDUSD** | `NZDUSDm` | 100,000 | 0.01 | 0.01 | 5 | 0.00001 | 30 |
| **EURGBP** | `EURGBPm` | 100,000 | 0.01 | 0.01 | 5 | 0.00001 | 25 |
| **EURJPY** | `EURJPYm` | 100,000 | 0.01 | 0.01 | 3 | 0.001 | 30 |
| **GBPJPY** | `GBPJPYm` | 100,000 | 0.01 | 0.01 | 3 | 0.001 | 35 |
| **US30** | `US30m` | 1 | 0.01 | 0.01 | 1 | 0.1 | 400 |
| **US100** | `US100m` | 1 | 0.01 | 0.01 | 2 | 0.01 | 250 |
| **US500** | `US500m` | 1 | 0.01 | 0.01 | 2 | 0.01 | 80 |
| **UK100** | `UK100m` | 1 | 0.01 | 0.01 | 1 | 0.1 | 150 |
| **GER40** | `GER40m` | — | — | — | — | — | N/A (Unsupported) |
| **JP225** | `JP225m` | 1 | 0.01 | 0.01 | 0 | 1.0 | 200 |
| **USOIL** | `USOILm` | 1,000 bbl | 0.01 | 0.01 | 3 | 0.001 | 50 |
| **UKOIL** | `UKOILm` | 1,000 bbl | 0.01 | 0.01 | 3 | 0.001 | 60 |
| **NGAS** | `NGASm` | 10,000 mmBtu | 0.01 | 0.01 | 3 | 0.001 | 80 |
| **BTCUSD** | `BTCUSDm` | 1 BTC | 0.01 | 0.01 | 2 | 0.01 | 1500 |
| **ETHUSD** | `ETHUSDm` | 1 ETH | 0.01 | 0.01 | 2 | 0.01 | 200 |
| **SOLUSD** | `SOLUSDm` | 1 SOL | 0.01 | 0.01 | 2 | 0.01 | 80 |

---

## 3. Market Session Schedules & Asset Isolation

A core finding from previous audits was the risk of session bleed (e.g. Crypto 24/7 rules leaking into Forex weekend closures). In Phase 18.1, strict session boundaries were independently verified in `test-market-session.js`.

### Verified Trading Windows:
1. **Forex & Metals:**
   - Active: Sunday 22:05 UTC through Friday 21:55 UTC.
   - Weekend Closure: Friday 21:55 UTC to Sunday 22:05 UTC.
   - Verification: On Saturday/Sunday, `isMarketOpen('EURUSD')` and `isMarketOpen('XAUUSD')` strictly return `false`. Opportunity radar returns `MONITOR NEXT OPEN`.
2. **Equities & Indices:**
   - Active: Sunday 23:00 UTC through Friday 21:15 UTC.
   - Daily Maintenance Break: 21:15 – 22:00 UTC (CME/ICE maintenance pause).
   - Verification: `isMarketOpen('US30')` during 21:30 UTC strictly evaluates to `false`.
3. **Energies:**
   - Active: Sunday 23:00 UTC through Friday 21:00 UTC.
   - Daily Break: 21:00 – 22:00 UTC.
   - Verification: `isMarketOpen('USOIL')` during 21:15 UTC evaluates to `false`.
4. **Cryptocurrency:**
   - Active: 24 hours a day, 7 days a week, 365 days a year.
   - Verification: `isMarketOpen('BTCUSD')` returns `true` on Saturday and Sunday.

### Contamination Immunity:
- Cryptocurrencies execute on an isolated calendar clock.
- Weekend trading activity on `BTCUSD` has zero side-effects on Forex or Metals status.
- Broker bridge `sendCommand` strictly enforces `MARKET_CLOSED` gate if an order or quote request is attempted on a closed symbol.

---

## 4. Spread and Liquidity Protection

Gate 4 in the 21-gate eligibility engine monitors live broker spread:
- If `liveSpreadPts > maxAllowedSpreadPts`, the candidate is rejected with `REJECTED_EXCESSIVE_SPREAD`.
- Missing, negative, NaN, or non-finite spread values fail closed to `DATA_LIMITED` and reject signal emission.
- Zero spread (e.g. raw account zero spread) is preserved as `NORMAL` rather than flagged as an anomaly.
