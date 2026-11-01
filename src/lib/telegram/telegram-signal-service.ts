/**
 * FEF CORTEX — TELEGRAM SIGNAL ORCHESTRATION SERVICE
 *
 * Phase 13 Workstream: Validated Signal Queue Worker & Broadcast Service
 *
 * INVARIANTS:
 * - VALIDATED SETUPS ONLY: Every broadcast candidate must pass all 21 eligibility gates
 * - Atomic single-worker lock to prevent concurrent double-broadcasting
 * - Zero impact on local MT5 market-data ingestion or SQLite persistence during Telegram outages
 * - Read-only analytical information delivery only — zero execution
 */

import { evaluateSignalEligibility, ValidatedSignalPayload } from './telegram-signal-eligibility';
import { TelegramPersistenceService, telegramPersistence } from './telegram-persistence';
import { TelegramClient, telegramClient, CANONICAL_CHANNEL_USERNAME } from './telegram-client';
import { renderSignalCardPng } from './telegram-image-renderer';
import { hashDestinationChat } from './telegram-idempotency';
import { DecisionIntelligenceV2 } from '../decision/decision-engine-v2';
import { SetupIntelligenceV3 } from '../setup/setup-intelligence-v3';

export interface SignalServiceOptions {
  persistence?: TelegramPersistenceService;
  client?: TelegramClient;
}

export class TelegramSignalService {
  private persistence: TelegramPersistenceService;
  private client: TelegramClient;
  private isProcessingQueue = false;
  private isPaused = false;
  private pauseReason: string | null = null;

  constructor(options?: SignalServiceOptions) {
    this.persistence = options?.persistence || telegramPersistence;
    this.client = options?.client || telegramClient;
  }

  /**
   * Intakes candidate setup and runs the 21-check Validated Eligibility Gate
   */
  public async processCandidateSetup(
    decision: DecisionIntelligenceV2 | null | undefined,
    setup: SetupIntelligenceV3 | null | undefined,
    telemetry: any
  ): Promise<{
    enqueued: boolean;
    status: string;
    signalId?: string;
    rejectionReason?: string;
  }> {
    if (this.isPaused) {
      return {
        enqueued: false,
        status: 'PAUSED',
        rejectionReason: this.pauseReason || 'Telegram broadcasting is currently paused by administrator',
      };
    }

    const publicCfg = this.client.getPublicConfig();
    if (!publicCfg.enabled) {
      return {
        enqueued: false,
        status: 'DISABLED',
        rejectionReason: 'Telegram signal broadcasting is disabled by policy (TELEGRAM_SIGNAL_ENABLED=false)',
      };
    }

    // Consult known idempotency keys to suppress duplicates
    const knownKeys = this.persistence.getKnownIdempotencyKeys();
    const eligibility = evaluateSignalEligibility(decision, setup, telemetry, knownKeys);

    if (!eligibility.isEligible || !eligibility.payload) {
      // Record rejected event for observability and audit
      if (setup?.setupId && setup?.symbol) {
        this.persistence.recordSignalEvent({
          signalId: `REJ-${setup.symbol}-${Date.now().toString(36).toUpperCase()}`,
          setupId: setup.setupId,
          setupRevision: 1,
          symbol: setup.symbol,
          direction: setup.direction === 'LONG' ? 'BUY' : 'SELL',
          timeframe: setup.structuralContext?.structureTf || 'M15',
          eligibilityStatus: eligibility.status,
          rejectionReason: eligibility.rejectionReason,
        });
      }

      return {
        enqueued: false,
        status: eligibility.status,
        rejectionReason: eligibility.rejectionReason,
      };
    }

    const payload = eligibility.payload;

    // Record Validated Signal Event in SQLite
    this.persistence.recordSignalEvent({
      signalId: payload.signalId,
      setupId: payload.setupId,
      setupRevision: payload.setupRevision,
      symbol: payload.symbol,
      direction: payload.direction,
      timeframe: payload.timeframe,
      eligibilityStatus: 'ELIGIBLE',
      payloadJson: JSON.stringify(payload),
      validatedAt: payload.timestamps.validatedAt,
    });

    // Enqueue for delivery
    const queueRecord = this.persistence.enqueueSignal({
      signalId: payload.signalId,
      idempotencyKey: payload.idempotencyKey,
      destinationKey: publicCfg.destinationKey || 'default-private-group',
    });

    if (!queueRecord) {
      return {
        enqueued: false,
        status: 'QUEUE_ERROR',
        rejectionReason: 'Failed to enqueue signal in SQLite queue',
      };
    }

    // Trigger immediate queue dispatch
    await this.processQueue().catch(() => {});

    return {
      enqueued: true,
      status: 'ELIGIBLE',
      signalId: payload.signalId,
    };
  }

  /**
   * Worker loop: claims pending items and delivers via Telegram Bot API
   */
  public async processQueue(): Promise<void> {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    try {
      while (true) {
        if (this.isPaused) break;

        const batch = this.persistence.claimNextPendingBatch(1);
        if (!batch || batch.length === 0) break;

        const item = batch[0];

        try {
          // Fetch signal event record to get payload JSON
          const recentSignals = this.persistence.listRecentSignals(100);
          const signalRecord = recentSignals.find((s) => s.signalId === item.signalId);

          let payload: ValidatedSignalPayload | null = null;
          if (signalRecord) {
            // Find full event
            const stmt = (this.persistence as any).db?.prepare(`
              SELECT payload_json FROM telegram_signal_events WHERE signal_id = ?
            `);
            const row = stmt?.get(item.signalId);
            if (row?.payload_json) {
              payload = JSON.parse(row.payload_json);
            }
          }

          if (!payload) {
            this.persistence.markFailed(item.id, 'PAYLOAD_MISSING', 'Signal payload not found in storage');
            continue;
          }

          // Safety Revalidation Gate: Check payload age prior to transmission
          const payloadTimestamp = payload.timestamps?.asOf || 0;
          const payloadAgeMs = Date.now() - payloadTimestamp;
          if (payloadTimestamp > 0 && payloadAgeMs > 15 * 60 * 1000) {
            this.persistence.markFailed(
              item.id,
              'SETUP_EXPIRED',
              `Setup expired prior to delivery (age: ${Math.round(payloadAgeMs / 1000)}s > 900s). Delivery aborted.`
            );
            continue;
          }

          // Generate 1080x1350 PNG locally
          const pngBuffer = await renderSignalCardPng(payload);
          const caption = this.client.formatSignalCaption(payload);

          // Deliver via Telegram Client to authorized channel
          const sendRes = await this.client.sendSignalPhoto({
            chatId: CANONICAL_CHANNEL_USERNAME,
            photoBuffer: pngBuffer,
            caption,
          });

          if (sendRes.success) {
            this.persistence.markDelivered(item.id, sendRes.telegramMessageId || 100001);
          } else {
            this.persistence.markFailed(item.id, sendRes.errorCode || 'DELIVERY_FAILED', sendRes.error || 'Failed to deliver signal');
          }
        } catch (itemErr: any) {
          this.persistence.markFailed(item.id, 'WORKER_EXCEPTION', itemErr.message || 'Worker processing error');
        }
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  /**
   * Admin-Only: Sends a watermarked test image to verify Telegram delivery
   */
  public async sendTestSignal(forceLive = false): Promise<{ success: boolean; telegramMessageId?: number; isDryRun?: boolean; error?: string }> {
    const mockPayload: ValidatedSignalPayload = {
      signalId: `TEST-${Date.now().toString(36).toUpperCase()}`,
      setupId: 'setup-synthetic-test',
      setupRevision: 1,
      symbol: 'XAUUSD',
      direction: 'BUY',
      timeframe: 'M15',
      marketPrice: 2741.50,
      entryZone: { low: 2740.00, high: 2742.00, midpoint: 2741.00 },
      stopLoss: { price: 2735.00, distance: 6.00 },
      takeProfit1: { price: 2755.00, distance: 14.00, riskReward: 2.33 },
      riskRewardRatio: 2.33,
      decisionEngine: {
        bias: 'BULLISH',
        confidencePct: 90,
        completenessPct: 95,
        independentDomainsCount: 3,
        maturity: 'VALIDATED_SETUP',
      },
      setupIntelligence: {
        type: 'SYNTHETIC_TEST',
        lifecycle: 'VALIDATED',
        thesis: 'Synthetic connectivity verification test card for public channel',
        invalidationPrice: 2735.00,
      },
      sessionContext: { currentSession: 'LONDON', activeKillzone: true },
      timestamps: {
        asOf: Date.now(),
        marketDataTimestamp: Date.now(),
        validatedAt: new Date().toISOString(),
      },
      idempotencyKey: `TEST_${Date.now()}`,
    };

    const pngBuffer = await renderSignalCardPng(mockPayload, { isPreview: true });
    const nowUtc = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    const caption = `<b>FEF CORTEX | SYSTEM CONNECTIVITY TEST</b>
ℹ️ <b>TEST ONLY — NOT A LIVE TRADING SIGNAL</b>

<b>Destination:</b> ${CANONICAL_CHANNEL_USERNAME}
<b>Asset:</b> XAUUSD · GOLD (Approved Master Template)
<b>Notice:</b> Single owner-authorized connectivity verification test card confirming delivery to the official public channel.

<b>Official Platform Access:</b>
• <b>CORTEX Dashboard:</b> <a href="https://app.feftradingsolutions.com">https://app.feftradingsolutions.com</a>
• <b>Official Website:</b> <a href="https://www.feftradingsolutions.com">https://www.feftradingsolutions.com</a>

<b>Status:</b> TEST ONLY · VERIFIED
<b>Signal ID:</b> <code>${mockPayload.signalId}</code>
<b>Timestamp:</b> ${nowUtc}

<i>NOT AN EXECUTION COMMAND · STRICT READ-ONLY ARCHITECTURE</i>
<i>FEF CORTEX Autonomous Intelligence</i>`;

    const res = await this.client.sendSignalPhoto({
      chatId: CANONICAL_CHANNEL_USERNAME,
      photoBuffer: pngBuffer,
      caption,
      forceLive,
    });

    if (res.success) {
      this.persistence.recordAudit({
        signalId: mockPayload.signalId,
        eventType: 'DELIVERED',
        status: 'TEST_SUCCESS',
        details: `Admin test signal delivered${res.isDryRun ? ' (dry-run)' : ''}. Msg ID: ${res.telegramMessageId}`,
        timestamp: Date.now(),
      });
      return { success: true, telegramMessageId: res.telegramMessageId, isDryRun: res.isDryRun };
    }

    return { success: false, error: res.error };
  }

  public pauseBroadcasting(reason?: string): void {
    this.isPaused = true;
    this.pauseReason = reason || 'Paused by administrator';
    this.persistence.recordAudit({
      signalId: 'SYSTEM',
      eventType: 'PAUSED',
      status: 'PAUSED',
      details: this.pauseReason,
      timestamp: Date.now(),
    });
  }

  public resumeBroadcasting(): void {
    this.isPaused = false;
    this.pauseReason = null;
    this.persistence.recordAudit({
      signalId: 'SYSTEM',
      eventType: 'UNPAUSED',
      status: 'ACTIVE',
      details: 'Broadcasting resumed by administrator',
      timestamp: Date.now(),
    });
    this.processQueue().catch(() => {});
  }

  public async getStatus() {
    const publicCfg = this.client.getPublicConfig();
    const botCheck = await this.client.verifyBot();
    const channelCheck = await this.client.verifyChannel();
    const queueStats = this.persistence.getQueueStats();

    return {
      service: 'TELEGRAM_SIGNAL_CENTER',
      isConfigured: publicCfg.botTokenConfigured && publicCfg.channelConfigured,
      broadcastingActive: publicCfg.enabled && !this.isPaused && !publicCfg.dryRun,
      isPaused: this.isPaused,
      pauseReason: this.pauseReason,
      isDryRun: publicCfg.dryRun,
      policy: 'VALIDATED_SETUPS_ONLY',
      validatedOnly: publicCfg.validatedOnly,
      zeroCostCompliance: true,
      bot: {
        isConfigured: publicCfg.botTokenConfigured,
        isValid: botCheck.isValid,
        status: botCheck.status,
        botUsername: botCheck.botUsername,
        botFirstName: botCheck.botFirstName,
        error: botCheck.error,
      },
      channel: {
        isConfigured: publicCfg.botTokenConfigured,
        isVerified: channelCheck.isVerified,
        status: channelCheck.status,
        channelUsername: CANONICAL_CHANNEL_USERNAME,
        channelTitle: channelCheck.channelTitle,
        channelType: channelCheck.channelType,
        isAdmin: channelCheck.isAdmin,
        canPostMessages: channelCheck.canPostMessages,
        error: channelCheck.error,
      },
      destination: {
        isConfigured: publicCfg.botTokenConfigured,
        isVerified: channelCheck.isVerified,
        status: channelCheck.status,
        channelUsername: CANONICAL_CHANNEL_USERNAME,
        destinationSummary: publicCfg.destinationSummary,
        canPostMessages: channelCheck.canPostMessages,
        error: channelCheck.error,
      },
      queue: {
        ...queueStats,
        duplicateSuppressionCount: this.persistence.getDuplicateSuppressionCount(),
        averageDeliveryLatencyMs: this.persistence.getAverageDeliveryLatencyMs(),
      },
      rejectionsBreakdown: this.persistence.getRejectionsBreakdown(),
      timestamp: new Date().toISOString(),
    };
  }

  public getRecentSignals(limit = 50) {
    return this.persistence.listRecentSignals(limit);
  }
}

export const telegramSignalService = new TelegramSignalService();
