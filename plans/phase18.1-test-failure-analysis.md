# FEF CORTEX — PHASE 18.1
## Test Suite Failure Analysis, Root Cause & Remediation Proof

**Date:** 2026-11-03
**Status:** ALL TESTS 100% GREEN
**Branch:** `recovery-v122-agents`
**Total Test Files in Suite:** 27
**Full `npm test` Exit Code:** 0

---

## 1. Executive Summary

During the Phase 18.1 independent verification audit, multiple legacy regressions, environment leakages, and assertion divergences were identified across test suites. Each issue was systematically diagnosed, rooted in code, remediated, and verified without compromising production safety or altering the canonical execution lock.

---

## 2. Comprehensive Root Cause & Remediation Matrix

### Failure 1: Order Flow Classification Degradation for Reference Candles
- **Affected File:** `scripts/test-phase34-evidence-integrity.js` (Test 5)
- **Symptom:** Order flow classification returned `UNAVAILABLE` / `DATA LIMITED` instead of `INDEPENDENT_REFERENCE`.
- **Root Cause:** In `src/lib/agents/multi-asset-pipeline.ts` line 1484, order flow calculation required `(isExchangeVol || isAssetMt5Live)`. When candles had reference provenance (`effectiveCandleProvenance === 'INDEPENDENT_REFERENCE'`), the condition evaluated to `false`, causing the engine to abort order flow analysis.
- **Remediation:** Added `|| effectiveCandleProvenance === 'INDEPENDENT_REFERENCE'` at line 1484.
- **Verification:** 85/85 tests passed in `test-phase34-evidence-integrity.js`.

### Failure 2: Legacy Execution Policy Assertions in Evidence Integrity
- **Affected File:** `scripts/test-phase34-evidence-integrity.js` (Tests 10, 7)
- **Symptom:** Assertions expected legacy `ARMED_WITH_CONFIRMATION` policy and outdated modal button text.
- **Root Cause:** The test file had not been synchronized with the Cockpit V2 single execution authority and permanent `READ_ONLY` lock refactor.
- **Remediation:** Updated assertions to reflect `CANONICAL_EXECUTION_MODE = 'READ_ONLY'`, `MT5_ORDER_TRANSPORT_ENABLED = false`, and current UI string conventions.
- **Verification:** Clean pass with 0 errors.

### Failure 3: Missing `GLOBAL_READ_ONLY_LOCK` in Relay, Connector & EA Sources
- **Affected File:** `scripts/test-v112s-read-only.ts`
- **Symptom:** AST / static regex scan failed to find `GLOBAL_READ_ONLY_LOCK` in relay and connector files.
- **Root Cause:** In previous iterations, mutating route guards had been commented out or bypassed during manual demo runs.
- **Remediation:** Restored strict `GLOBAL_READ_ONLY_LOCK` guards in:
  - `relay-deploy/fef-remote-relay-service.js`
  - `scripts/fef-remote-relay-service.js`
  - `scripts/fef-local-connector-agent.js`
  - `mql5/Experts/FEF_HTTP_Bridge.mq5`
- **Verification:** 17/17 tests passed in `test-v112s-read-only.ts`.

### Failure 4: Remote Telemetry Quote Evaluation Premature Block
- **Affected File:** `scripts/test-rc2-telemetry-consistency.ts` (Test 8)
- **Symptom:** Helper `staleQuoteBlocked` unconditionally returned `{ canExecute: false, reason: 'GLOBAL_READ_ONLY_LOCK' }` due to `!MT5_ORDER_TRANSPORT_ENABLED`, preventing quote staleness assertions from running.
- **Root Cause:** Coupling transport lock check before telemetry staleness check in test harness helper.
- **Remediation:** Added `allowTransportMock = true` default parameter to the test evaluation helper while asserting the global transport lock separately.
- **Verification:** 33/33 tests passed in `test-rc2-telemetry-consistency.ts`.

### Failure 5: Supervisor Child Process Allowlist Key Count Mismatch
- **Affected File:** `scripts/test-macos-background-service.js` (Test 14)
- **Symptom:** Test asserted allowlist must have exactly 9 keys, but found 11.
- **Root Cause:** Phase 18 introduced `FEF_TELEMETRY_STORAGE_MODE` and `VERCEL_PROTECTION_BYPASS` to supervisor's `ALLOWED_ENV_KEYS`.
- **Remediation:** Updated `expectedKeys` in `scripts/test-macos-background-service.js` to include the two new verified keys.
- **Verification:** Test 14 passed cleanly.

### Failure 6: Worker Child Process Environment Spread Leak
- **Affected File:** `scripts/test-macos-background-service.js` (Test 25)
- **Symptom:** Rule violation: `fef-bridge-supervisor.js must contain zero occurrences of ...process.env`.
- **Root Cause:** `startBackgroundWorker()` directly executed `const workerEnv = { ...process.env }`.
- **Remediation:** Replaced with sanitizing function `buildWorkerChildEnv(process.env)` adhering to `SAFE_SYSTEM_ENV_KEYS` and `ALLOWED_ENV_KEYS`.
- **Verification:** Test 25 passed cleanly; 45/45 tests green in `test-macos-background-service.js`.

### Failure 7: Risk Guardian Wording on Empty Calendar Telemetry
- **Affected File:** `scripts/test-truthfulness-hardening.js` (Test 18)
- **Symptom:** When calendar events array was empty, Risk Guardian reported "NO HIGH-IMPACT EVENT LOCKOUT" instead of "Economic calendar telemetry unavailable".
- **Root Cause:** Semantic conflation between "no events scheduled" and "calendar service down / telemetry unavailable".
- **Remediation:** Updated `src/lib/agents/multi-asset-pipeline.ts` lines 981 and 1019 to report truthful telemetry state.
- **Verification:** Truthfulness hardening test passed cleanly.

### Failure 8: Geopolitical Alert Age Expiration in Test Harness
- **Affected File:** `scripts/test-truthfulness-hardening.js` (Test 34)
- **Symptom:** `TypeError: Cannot read properties of undefined (reading 'status')` in `testGeoEngine.refreshAlerts()`.
- **Root Cause:** Test fixtures had hardcoded dates `2026-10-02`. When running in November 2026, the alerts were older than 7 days (`maxAlertAgeMs`), resulting in an empty alerts array.
- **Remediation:** Injected deterministic `Date.now = () => Date.parse('2026-10-02T12:35:00Z');` within the isolated geopolitical test scope.
- **Verification:** Test 34 passed with 0 errors.

### Failure 9: Outdated Armed Mode Assertions in Truthfulness Suite
- **Affected File:** `scripts/test-truthfulness-hardening.js` (Test 12)
- **Symptom:** Test checked for legacy `ARMED_WITH_CONFIRMATION` mode.
- **Remediation:** Updated assertion to expect `'READ_ONLY'` and `MT5_ORDER_TRANSPORT_ENABLED = false`.
- **Verification:** 35/35 truthfulness tests passed cleanly.

### Failure 10: Notification Verification Script SQLite Schema & Idempotency Collision
- **Affected File:** `scripts/verify-phase18-1-notification-proof.ts`
- **Symptom:** Queue queried column `status` instead of `delivery_status`, and static fixture ID collided on `UNIQUE(idempotency_key)`.
- **Remediation:** Corrected column name to `delivery_status` and implemented run-unique fixture IDs (`P18-1-FIXTURE-${Date.now()}`).
- **Verification:** 12/12 checks passed cleanly.

---

## 3. Full Suite Test Verification Log

Executing `npm test` runs 27 distinct test files covering 300+ assertions:
```
✓ test-swarm-consistency.js ..................... PASSED
✓ test-mt5-bridge.js ............................ PASSED
✓ test-hub-animation.js ......................... PASSED
✓ test-market-session.js ........................ PASSED
✓ test-phase34-evidence-integrity.js ............ PASSED (85/85)
✓ test-phase35-demo-execution.js ................ PASSED
✓ test-phase35-1-mode-consistency.js ............ PASSED
✓ test-phase35-acceptance.js .................... PASSED
✓ test-notifications.ts ......................... PASSED
✓ test-crypto-feed.ts ........................... PASSED
✓ test-blueprint-geometry.ts .................... PASSED
✓ test-broker-agnostic.ts ....................... PASSED
✓ test-rc2-telemetry-consistency.ts ............. PASSED (33/33)
✓ test-engineering-demo-transport.ts ............ PASSED
✓ test-price-authority-consistency.ts ........... PASSED
✓ test-phase2-remote-foundation.ts .............. PASSED (46/46)
✓ test-phase2b-remote-telemetry.ts .............. PASSED (15/15)
✓ test-phase2b3-trade-protection.ts ............. PASSED (28/28)
✓ test-phase2c-remote-execution.ts .............. PASSED (18/18)
✓ test-phase2d-truthful-intelligence.ts ......... PASSED (44/44)
✓ test-phase2d3-bridge-supervisor.js ............ PASSED (5/5)
✓ test-relay-candles.ts ......................... PASSED
✓ test-v11-independent-intelligence.ts .......... PASSED
✓ test-v112-candle-consumption.ts .............. PASSED
✓ test-opportunity-intelligence-recovery.js ..... PASSED
✓ test-macos-background-service.js .............. PASSED (45/45)
✓ test-truthfulness-hardening.js ................ PASSED (35/35)

ALL TEST SUITES PASSED CLEANLY (Exit code 0).
```
