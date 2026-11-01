# FEF CORTEX — Phase 16 Implementation Plan: Live Signal Monitoring & Operational Stability

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish end-to-end operational monitoring, pipeline observability, and stability metrics for the live Telegram broadcasting system in the protected Vercel Preview environment without sending test messages or manufacturing artificial signals.

**Architecture:** A comprehensive 10-stage pipeline diagnostic aggregator (`telegram-pipeline-monitor.ts`) coupled with a dedicated `/api/telegram/pipeline` route and an elevated Cockpit Signal Operations monitoring deck (`TelegramSignalCenter.tsx`). The monitor traces every stage from MT5 telemetry ingestion through 32-agent consensus, Decision Engine V2, Setup Intelligence V3, 21-gate eligibility, queue health, to channel delivery, with real-time alert detection and zero-activity honesty.

**Tech Stack:** TypeScript, Next.js 14 App Router, React, Tailwind CSS, SQLite (`better-sqlite3`), Telegram Bot API (HTTP 200 OK verified via Message ID 365).

**Spec:** User Phase 16 Brief (Sections 1-11).

## Global Constraints
- Preserve branch `recovery-v122-agents`.
- Vercel Preview deployment only; NEVER use `--prod` or touch `app.feftradingsolutions.com`.
- Execution journal `data/fef-execution-journal.jsonl` immutable at 17 lines (`88dfd508...`).
- MT5 order execution disabled (`MT5_ORDER_TRANSPORT_ENABLED = false as const`, `READ_ONLY`).
- Zero-cost operation (`OPENAI_ENABLED = false`, `OPENAI_DAILY_BUDGET_USD = 0`).
- Destination fixed to `@forexmetalsignals`.
- NEVER send unauthorized test messages to Telegram.
- NEVER manufacture artificial signals or relax validation gates.

---

### Task 1: Pipeline Tracing & Operational Health Diagnostics Engine
**Files:**
- Create: `src/lib/telegram/telegram-pipeline-monitor.ts`
- Create: `src/app/api/telegram/pipeline/route.ts`

- [ ] Implement `getPipelineTrace()` tracing all 10 stages:
  1. MT5 Terminal (Wine / Desktop)
  2. Local HTTP Bridge (Port 5556)
  3. Local Connector Agent
  4. SQLite Telemetry Repository
  5. Market Data Provider (Canonical real-time quotes)
  6. 32 Autonomous Agents (Consensus & Direction)
  7. Decision Engine V2 (Confidence & Multi-model Agreement)
  8. Setup Intelligence V3 (Structural Confluence & Maturity)
  9. Signal Eligibility Engine (21 Gates, R:R ≥ 2.0:1, ≤30s freshness)
  10. Telegram Queue & Dispatcher
  11. Telegram Public Channel (@forexmetalsignals)
- [ ] Implement stage failure pinpointing (identifying the earliest failing stage).
- [ ] Implement Operational Health KPIs aggregator:
  - Monitored canonical instruments (12 symbols across 5 categories)
  - Opportunities detected vs signals rejected
  - Rejection reasons breakdown
  - Telemetry quote ages per instrument
  - Duplicate suppression count & average latency
  - Active alert conditions (MT5 disconnect, stale quotes, queue backlog, API error)
- [ ] Implement `/api/telegram/pipeline/route.ts` exposing sanitized diagnostic data with zero secret exposure.

### Task 2: Enhance Cockpit Signal Operations Dashboard UI
**Files:**
- Modify: `src/components/cockpit/TelegramSignalCenter.tsx`

- [ ] Add 10-Stage Visual Pipeline Ribbon with real-time status pills (Connected, Stale, Offline, Active) and latency/timestamp.
- [ ] Add Operational Health Metric Cards:
  - Pipeline Condition (Healthy / Degraded / Disconnected)
  - Monitored Instruments (12 Canonical)
  - Rejection Reason breakdown modal/accordion
  - Telemetry freshness tracker
  - Duplicate suppression & micro-update blocker counter
- [ ] Add Real Market Opportunity Monitor:
  - Display all evaluated setups across symbols with real values
  - Show explicit rejection reasons when not eligible (e.g. "R:R 1.4:1 < 2.0", "Confidence 62% < 70%")
  - Honestly show "No active eligible opportunities" when market does not meet institutional thresholds
- [ ] Add 5-Category Master Template inspector & verification view.

### Task 3: Focused Regression & Monitoring Validation Suite
**Files:**
- Create: `scripts/test-phase16-pipeline-monitoring.ts`

- [ ] Test 1: Full 10-Stage Pipeline tracing validation.
- [ ] Test 2: Failure pinpointing across pipeline stages.
- [ ] Test 3: Multi-instrument coverage across 5 categories and 12 canonical symbols.
- [ ] Test 4: Rejection reasons attribution (R:R < 2.0, stale quotes, micro-updates).
- [ ] Test 5: Duplicate suppression and safe retry verification (no duplicate messages).
- [ ] Test 6: Invariant preservation (READ_ONLY, MT5 transport false, journal 17 lines, zero OpenAI cost).
- [ ] Ensure script does NOT transmit messages to Telegram.

### Task 4: Preview Deployment & Live Verification
**Files:**
- Deploy: Vercel Preview (Protected Staging)
- Verify: `https://fef-trading-dashboard-4msg78ijn-riazmohd.vercel.app` (or newly generated preview)

- [ ] Execute `npx tsc --noEmit` to verify type-safety.
- [ ] Run `scripts/test-phase16-pipeline-monitoring.ts`.
- [ ] Deploy with `npx vercel deploy --yes` (no `--prod`).
- [ ] Verify deployed preview endpoints (`/api/telegram/status`, `/api/telegram/pipeline`) via curl with protection bypass header.
- [ ] Verify production isolation (no `--prod`, production untouched).
- [ ] Verify journal SHA-256 hash intact.

### Task 5: Phase 16 Comprehensive Final Report
**Files:**
- Create: `plans/2026-11-01-phase16-live-signal-monitoring-report.md`

- [ ] Document all 12 required sections from the brief:
  1. Implementation summary
  2. Live pipeline health
  3. Instruments monitored
  4. Actual opportunities detected
  5. Actual Telegram messages published
  6. Failed and rejected signals with reasons
  7. Five-category template verification
  8. Dashboard changes
  9. Test results
  10. Deployment URL
  11. Safety invariants
  12. Remaining blockers
- [ ] Distinguish: Implemented, Verified, Currently active, Not yet observed in live market conditions.

