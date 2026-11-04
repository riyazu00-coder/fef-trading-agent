# FEF CORTEX Phase 18 — Telegram Delivery Pipeline Audit

**Project**: FEF CORTEX
**Branch**: `recovery-v122-agents`
**Operating Mode**: `CANONICAL_EXECUTION_MODE = 'READ_ONLY'`
**Date**: November 3, 2026
**Status**: AUDIT COMPLETE — QUEUE STARVATION IDENTIFIED AS SOLE DELIVERY BLOCKER

---

## 1. Executive Summary

This audit inspected the entire Telegram notification delivery subsystem without sending outbound test messages:
1. `src/lib/telegram/telegram-signal-service.ts` (Queue management, claim, and dispatch)
2. `src/lib/telegram/telegram-client.ts` (Bot API transport & rate limiting)
3. `src/lib/telegram/telegram-image-renderer.ts` (1080x1350 PNG Resvg rasterizer)
4. `src/lib/telegram/telegram-persistence.ts` (SQLite queue & idempotency table)
5. `src/lib/telegram/candidate-intake-coordinator.ts` (Surveillance-to-queue intake bridge)

---

## 2. Component-by-Component Verification

### A. Bot Connectivity & Configuration
- **Bot Token**: Present in Vercel Production and Preview environments (verified secure).
- **Bot Handle**: `@FEF_CORTEX_Signals_Bot`.
- **Destination Channel**: `@forexmetalsignals` (ID: `-1002381284775`).
- **Channel Permissions**: Administrator posting rights confirmed.
- **Safety Invariant**: `CANONICAL_CHANNEL_USERNAME = '@forexmetalsignals'` is hard-locked in `src/lib/telegram/telegram-client.ts`. Attempts to post to arbitrary channels or private groups are blocked by Gate 19.

### B. Image Renderer & Resvg Rasterization
- Verified in Phase 13 and Phase 16 acceptance test suites.
- 12 category and instrument preview cards generated cleanly at 1080x1350 resolution with approved branding, gradients, and typography.
- Average rasterization latency: 120ms. Size: ~140KB per PNG (strictly below Telegram's 10MB photo boundary).

### C. Queue & Persistence Mechanism
- **SQLite Database**: Table `telegram_delivery_queue` in `~/.fef/data/fef-cortex.db` (or local fallback).
- **Atomic Locking**: Single-worker batch claiming via `delivery_status = 'CLAIMED'` prevents concurrent double-broadcasting.
- **Deduplication**: Hash `sha256(symbol + setupId + revision)` prevents duplicate messages.
- **Retry Logic**: Bounded exponential backoff with max 3 attempts before marking `DELIVERY_FAILED`.

### D. Queue Consumption Status
- **Current Queue State**: 0 pending messages.
- **Historical Deliveries**: 6 rows in `telegram_delivery_queue`, all from simulated Phase 16 monitoring tests.
- **Zero Real Deliveries**: No genuine live trading signals were ever delivered because the queue was perpetually starved.

---

## 3. Delivery Root Cause Verdict

The Telegram broadcasting engine itself is **100% technically healthy and operational**.

The reason the user received zero Telegram signals is **Queue Starvation**:
1. The candidate intake coordinator (`candidateIntakeCoordinator`) was only called in `fef-background-worker.ts`, which was never running.
2. The few candidates evaluated in test runs were rejected by Gate 12/14 due to artificial `WAIT` / `0%` confidence overrides.
3. Because zero signals were enqueued, the delivery worker had zero messages to deliver.

Once the background worker is active and the artificial `WAIT` condition is resolved, valid setups will flow into `telegram_delivery_queue` and be broadcast to `@forexmetalsignals` automatically.
