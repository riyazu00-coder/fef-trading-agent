# FEF CORTEX Phase 18 — Application Notification Pipeline Audit

**Project**: FEF CORTEX
**Branch**: `recovery-v122-agents`
**Operating Mode**: `CANONICAL_EXECUTION_MODE = 'READ_ONLY'`
**Date**: November 3, 2026
**Status**: AUDIT COMPLETE — NOTIFICATION SUPPRESSION DEFECT PINPOINTED

---

## 1. Executive Summary

This audit examined the end-to-end application notification pipeline within the FEF CORTEX web dashboard, including:
1. `src/lib/radar/radar-notifications.ts` (Notification state transitions & storage)
2. `src/components/cockpit/TradeOpportunityPopup.tsx` (Interactive HUD popup)
3. `src/components/cockpit/NotificationCenterDrawer.tsx` (Persistent sidebar drawer)
4. `src/components/cockpit/MasterTopNav.tsx` (Notification bell & unread badge)
5. `src/context/ActiveAssetContext.tsx` (Client-side background evaluation loop)

---

## 2. Key Findings & Structural Defects

### A. The Auto-Execution Conflation Defect
In `src/lib/radar/radar-notifications.ts`, line 148:
```typescript
// DEFECTIVE (Prior Implementation):
const isOpportunityState = opp.tradeExecutable && (opp.state.includes('BUY') || opp.state.includes('SELL'));
const isDevelopingOpen = opp.tradeExecutable && (opp.state.includes('WATCH') || (opp.opportunityScore >= 60 && ...));
```
- The codebase enforces `CANONICAL_EXECUTION_MODE = 'READ_ONLY'` to protect user capital from automated execution without human approval.
- In `src/lib/radar/opportunity-radar-engine.ts` (line 905), this policy is strictly mapped:
  ```typescript
  // 1. In READ_ONLY local mode, tradeExecutable must be false.
  opp.tradeExecutable = false;
  ```
- Because `opp.tradeExecutable` is always false, `isOpportunityState` and `isDevelopingOpen` were **physically impossible to satisfy**.
- The only notification condition that did not require `opp.tradeExecutable` was `isDevelopingClosed`:
  ```typescript
  const isDevelopingClosed = !opp.tradeExecutable && (opp.state === 'MONITOR NEXT OPEN' || ...) && opp.opportunityScore >= 75;
  ```
- Consequently, users received notifications only when the market was closed, and **never when an active market formed a valid trading opportunity**.

### B. Single-Asset Context Limitation
In `src/context/ActiveAssetContext.tsx` (lines 665–685):
- `generateGlobalRadarIntelligence` is invoked inside a client-side `useEffect`.
- However, `multiAssetCandleCacheRef.current` only holds candles for assets the user has previously clicked in the dropdown.
- For all other unclicked assets, `candles` are missing, meaning `marketStructure` cannot be computed, preventing radar opportunities from ever forming.

---

## 3. Required Implementation Corrections

1. **Decouple Actionable Opportunity Notification from `tradeExecutable`**:
   - In `radar-notifications.ts`, replace `opp.tradeExecutable` with check on session state or opportunity score:
   ```typescript
   // CORRECTED:
   const isOpportunityState = (opp.state.includes('BUY') || opp.state.includes('SELL')) && opp.opportunityScore >= 60;
   const isDevelopingOpen = (opp.state.includes('WATCH') || opp.opportunityScore >= 60) && opp.marketState !== 'CLOSED';
   ```
2. **Hydrate Multi-Asset Radar with Verified Broker Candles**:
   - Allow `generateGlobalRadarIntelligence` to consume the full multi-asset candle bundle from the local bridge or telemetry snapshot, enabling real-time opportunity detection across all 25 live assets simultaneously.
