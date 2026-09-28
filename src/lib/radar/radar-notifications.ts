/**
 * Cross-Asset Radar Notification & State Transition Engine
 * 
 * Provides:
 * 1. State transition detection (e.g., WATCH -> OPPORTUNITY, BUY -> STRONG BUY, INVALIDATED)
 * 2. Strict alert deduplication (15-minute cooldown window per symbol unless state materially changes)
 * 3. Browser-safe persistence & pub/sub event dispatcher for UI toasts and notification center drawer.
 */

import { RadarOpportunityItem, RadarOpportunityState } from './opportunity-radar-engine';

export type RadarAlertEventType =
  | 'TRADE_OPPORTUNITY_CONFIRMED'
  | 'SETUP_DEVELOPING'
  | 'SETUP_INVALIDATED'
  | 'RISK_RESTRICTED';

export interface RadarNotification {
  id: string;
  symbol: string;
  timestamp: string;
  createdTimeMs: number;
  title: string;
  message: string;
  previousState?: RadarOpportunityState;
  newState: RadarOpportunityState;
  score: number;
  read: boolean;
  priority: 'CRITICAL' | 'HIGH' | 'NORMAL';
  category?: string;
  confidence?: number;
  rr?: string;
  tradeExecutable?: boolean;
  marketState?: string;
  entryZone?: [number, number];
  stopLoss?: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
  eventType?: RadarAlertEventType;
  catalyst?: string;
  riskGuardianAllowed?: boolean;
  evidenceTrust?: number;
  actionabilityState?: string;
  verifiedAgentCount?: number;
  isDataLimited?: boolean;
  isBootAlert?: boolean;
}

const STORAGE_KEY = 'fef_radar_notifications_v1';
const DEDUPLICATION_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// In-memory cache for state tracking
interface LastKnownStateEntry {
  state: RadarOpportunityState;
  score: number;
  lastAlertMs: number;
  actionabilityState?: string;
  eventType?: RadarAlertEventType;
}

const lastKnownStates: Map<string, LastKnownStateEntry> = new Map();

type NotificationListener = (notification: RadarNotification) => void;
const listeners: Set<NotificationListener> = new Set();

/**
 * Register a listener for real-time notification alerts
 */
export function subscribeRadarNotifications(listener: NotificationListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

let memoryStorage: RadarNotification[] | null = null;

/**
 * Clear notification state cache (for controlled testing / simulation)
 */
export function clearRadarNotificationStateForTesting(): void {
  lastKnownStates.clear();
  listeners.clear();
  memoryStorage = null;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }
}

/**
 * Read stored notifications from localStorage safely (with memory fallback)
 */
export function getStoredNotifications(): RadarNotification[] {
  if (typeof window === 'undefined') {
    return memoryStorage || getInitialNotifications();
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = getInitialNotifications();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }
    return JSON.parse(raw);
  } catch (e) {
    console.warn('Failed to read radar notifications from localStorage:', e);
    return memoryStorage || getInitialNotifications();
  }
}

/**
 * Save notifications back to storage
 */
export function saveNotifications(items: RadarNotification[]): void {
  memoryStorage = items.slice(0, 50);
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 50)));
  } catch (e) {
    console.warn('Failed to save radar notifications:', e);
  }
}

/**
 * Mark all notifications as read
 */
export function markAllNotificationsAsRead(): RadarNotification[] {
  const current = getStoredNotifications();
  const updated = current.map((n) => ({ ...n, read: true }));
  saveNotifications(updated);
  return updated;
}

/**
 * Evaluate newly scanned opportunities and trigger deduplicated notifications on transitions
 */
export function evaluateRadarTransitions(opportunities: RadarOpportunityItem[]): RadarNotification[] {
  const now = Date.now();
  const newAlerts: RadarNotification[] = [];

  for (const opp of opportunities) {
    const prev = lastKnownStates.get(opp.symbol);

    // Actionable opportunities if state is BUY or SELL (closed markets produce MONITOR NEXT OPEN / PRE-OPEN WATCH)
    const isOpportunityState = opp.tradeExecutable && (opp.state.includes('BUY') || opp.state.includes('SELL'));
    const isDevelopingClosed = !opp.tradeExecutable && (opp.state === 'MONITOR NEXT OPEN' || opp.state === 'PRE-OPEN WATCH' || opp.state === 'WAIT (MARKET CLOSED)') && opp.opportunityScore >= 75;
    const isDevelopingOpen = opp.tradeExecutable && (opp.state.includes('WATCH') || (opp.opportunityScore >= 60 && !opp.state.includes('BUY') && !opp.state.includes('SELL') && opp.state !== 'NO TRADE'));
    const isStrong = opp.state.includes('STRONG');
    const meetsThreshold = opp.opportunityScore >= 75 && opp.aiConfidence >= 78;
    const catalyst = opp.catalysts?.[0] || 'Multi-agent structural alignment confirmed across HTF & LTF.';

    if (!prev) {
      // First time tracking this asset
      lastKnownStates.set(opp.symbol, {
        state: opp.state,
        score: opp.opportunityScore,
        lastAlertMs: now,
        actionabilityState: opp.actionabilityState,
        eventType: isOpportunityState ? 'TRADE_OPPORTUNITY_CONFIRMED' : 'SETUP_DEVELOPING'
      });

      // If actionable or developing setup right on boot, create initial alert
      const shouldBootAlert = (isOpportunityState || isDevelopingClosed) ? meetsThreshold : (isDevelopingOpen && opp.opportunityScore >= 62);
      if (shouldBootAlert) {
        const notif: RadarNotification = {
          id: `radar-boot-${opp.symbol}-${now}`,
          symbol: opp.symbol,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          createdTimeMs: now,
          title: isOpportunityState
            ? `${opp.symbol} — ${opp.state}`
            : isDevelopingOpen
            ? `${opp.symbol} — Setup Developing (${opp.state})`
            : `${opp.symbol} — SETUP DEVELOPING (MARKET CLOSED)`,
          message: isOpportunityState
            ? `${catalyst} Score: ${opp.opportunityScore}/100, AI Conviction: ${opp.aiConfidence}%, RR: ${opp.rr}. Entry: ${opp.entryZone[0]} - ${opp.entryZone[1]}.`
            : isDevelopingOpen
            ? `${catalyst} Setup Score: ${opp.opportunityScore}/100. Surveillance active on M30/M5. Awaiting trigger entry confirmation.`
            : `${catalyst} Setup Quality: ${opp.opportunityScore}/100. Market is closed (${opp.marketState}). Next open: ${opp.sessionCountdown || 'scheduled'}. Orders locked; revalidation required at next open.`,
          newState: opp.state,
          score: opp.opportunityScore,
          read: false,
          priority: isStrong ? 'CRITICAL' : isOpportunityState ? 'HIGH' : 'NORMAL',
          category: opp.category,
          confidence: opp.aiConfidence,
          rr: opp.rr,
          tradeExecutable: opp.tradeExecutable,
          marketState: opp.marketState,
          entryZone: opp.entryZone,
          stopLoss: opp.stopLoss,
          tp1: opp.tp1,
          tp2: opp.tp2,
          tp3: opp.tp3,
          eventType: isOpportunityState ? 'TRADE_OPPORTUNITY_CONFIRMED' : 'SETUP_DEVELOPING',
          catalyst,
          riskGuardianAllowed: opp.riskLevel !== 'HIGH' && opp.tradeExecutable,
          evidenceTrust: opp.evidenceTrust,
          actionabilityState: opp.actionabilityState,
          verifiedAgentCount: opp.verifiedAgentCount,
          isDataLimited: opp.isDataLimited,
          isBootAlert: true
        };
        newAlerts.push(notif);
      }
      continue;
    }

    const stateChanged = prev.state !== opp.state;
    const actionabilityChanged = Boolean(
      opp.actionabilityState && prev.actionabilityState && opp.actionabilityState !== prev.actionabilityState
    );
    const scoreJumped = Math.abs(opp.opportunityScore - prev.score) >= 15;
    const cooldownExpired = now - prev.lastAlertMs > DEDUPLICATION_WINDOW_MS;

    // Meaningful state transition (state change, or actionability change like ANALYSIS ONLY -> ACTIONABLE)
    const isMeaningfulTransition = stateChanged || actionabilityChanged;

    // Classify event type
    let eventType: RadarAlertEventType | null = null;
    let priority: 'CRITICAL' | 'HIGH' | 'NORMAL' = 'NORMAL';

    const prevWasActionable = prev.state.includes('BUY') || prev.state.includes('SELL');

    if (isMeaningfulTransition) {
      if (isOpportunityState && meetsThreshold) {
        eventType = 'TRADE_OPPORTUNITY_CONFIRMED';
        priority = (isStrong || opp.actionabilityState === 'ACTIONABLE') ? 'CRITICAL' : 'HIGH';
      } else if (isDevelopingClosed && meetsThreshold) {
        eventType = 'SETUP_DEVELOPING';
        priority = 'HIGH';
      } else if (isDevelopingOpen) {
        eventType = 'SETUP_DEVELOPING';
        priority = 'NORMAL';
      } else if (prevWasActionable && (opp.state === 'NO TRADE' || opp.state === 'WAIT')) {
        eventType = 'SETUP_INVALIDATED';
        priority = 'HIGH';
      } else if (opp.riskLevel === 'HIGH' && opp.state === 'WAIT') {
        eventType = 'RISK_RESTRICTED';
        priority = 'HIGH';
      }
    } else if (cooldownExpired && isOpportunityState && meetsThreshold) {
      eventType = 'TRADE_OPPORTUNITY_CONFIRMED';
      priority = (isStrong || opp.actionabilityState === 'ACTIONABLE') ? 'CRITICAL' : 'HIGH';
    } else if (cooldownExpired && isDevelopingClosed && meetsThreshold) {
      eventType = 'SETUP_DEVELOPING';
      priority = 'HIGH';
    } else if (cooldownExpired && isDevelopingOpen) {
      eventType = 'SETUP_DEVELOPING';
      priority = 'NORMAL';
    }

    // Trigger alert only when transition occurred or cooldown refreshed an actionable trade
    if (eventType) {
      lastKnownStates.set(opp.symbol, {
        state: opp.state,
        score: opp.opportunityScore,
        lastAlertMs: now,
        actionabilityState: opp.actionabilityState,
        eventType
      });

      const title = eventType === 'TRADE_OPPORTUNITY_CONFIRMED'
        ? `${opp.symbol} — ${opp.state}`
        : eventType === 'SETUP_DEVELOPING'
        ? (opp.tradeExecutable ? `${opp.symbol} — Setup Developing (${opp.state})` : `${opp.symbol} — SETUP DEVELOPING (MARKET CLOSED)`)
        : eventType === 'SETUP_INVALIDATED'
        ? `${opp.symbol} — Setup Invalidated`
        : `${opp.symbol} — Risk Guardian Restricted`;

      const message = eventType === 'TRADE_OPPORTUNITY_CONFIRMED'
        ? `${catalyst} Score: ${opp.opportunityScore}/100, AI Conviction: ${opp.aiConfidence}%, Target 1: ${opp.tp1}.`
        : eventType === 'SETUP_DEVELOPING'
        ? (opp.tradeExecutable
            ? `${catalyst} Setup Score: ${opp.opportunityScore}/100. Surveillance active on M30/M5. Awaiting trigger entry confirmation.`
            : `${catalyst} Setup Quality: ${opp.opportunityScore}/100. Market closed (${opp.marketState}). Next open: ${opp.sessionCountdown || 'scheduled'}. Revalidation required at next open.`)
        : eventType === 'SETUP_INVALIDATED'
        ? `Setup invalidated: Price moved beyond structural boundaries. Swarm reassessing orderflow.`
        : `Volatility spike / event buffer reached. Risk Guardian has paused execution.`;

      const notif: RadarNotification = {
        id: `radar-${opp.symbol}-${now}`,
        symbol: opp.symbol,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        createdTimeMs: now,
        title,
        message,
        previousState: prev.state,
        newState: opp.state,
        score: opp.opportunityScore,
        read: false,
        priority,
        category: opp.category,
        confidence: opp.aiConfidence,
        rr: opp.rr,
        tradeExecutable: opp.tradeExecutable,
        marketState: opp.marketState,
        entryZone: opp.entryZone,
        stopLoss: opp.stopLoss,
        tp1: opp.tp1,
        tp2: opp.tp2,
        tp3: opp.tp3,
        eventType,
        catalyst,
        riskGuardianAllowed: opp.riskLevel !== 'HIGH' && opp.tradeExecutable,
        evidenceTrust: opp.evidenceTrust,
        actionabilityState: opp.actionabilityState,
        verifiedAgentCount: opp.verifiedAgentCount,
        isDataLimited: opp.isDataLimited,
        isBootAlert: false
      };
      newAlerts.push(notif);
    }
  }

  if (newAlerts.length > 0) {
    const existing = getStoredNotifications();
    const combined = [...newAlerts, ...existing].slice(0, 40);
    saveNotifications(combined);

    // Notify registered UI subscribers
    for (const notif of newAlerts) {
      listeners.forEach((listener) => {
        try {
          listener(notif);
        } catch (e) {
          console.error('Error in radar notification listener:', e);
        }
      });
    }
  }

  return newAlerts;
}

/**
 * Phase 2D: Initial notification state is always empty.
 * Notifications are ONLY generated from genuine radar opportunity transitions
 * detected by evaluateRadarTransitions(). No synthetic seeds.
 */
function getInitialNotifications(): RadarNotification[] {
  return [];
}
