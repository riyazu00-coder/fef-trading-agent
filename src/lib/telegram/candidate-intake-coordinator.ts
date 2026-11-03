/**
 * FEF TRADING SOLUTIONS — CANDIDATE INTAKE COORDINATOR & REJECTION INTELLIGENCE
 * Phase 17: Production Live Signal Ingestion & Gate Audit
 *
 * Bridges the multi-asset intelligence pipeline to the Telegram Signal Service:
 * 1. Consumes AssetIntelligenceProfiles from the surveillance worker / ingress loop.
 * 2. Evaluates Decision Intelligence V2 + Setup Intelligence V3 against the 21-check gate.
 * 3. Enqueues eligible setups into Telegram queue and immediately dispatches.
 * 4. Captures comprehensive rejection telemetry for real-time operational audit.
 */

import { AssetIntelligenceProfile } from '../agents/multi-asset-pipeline';
import { telegramSignalService } from './telegram-signal-service';

export interface IntakeRejectionEvent {
  symbol: string;
  setupId: string;
  direction: string;
  status: string;
  rejectionReason: string;
  timestamp: number;
}

export interface CandidateIntakeMetrics {
  totalEvaluated: number;
  totalEligible: number;
  totalRejected: number;
  totalEnqueued: number;
  lastEvaluationTime: number | null;
  rejectionBreakdown: Record<string, number>;
  recentRejections: IntakeRejectionEvent[];
}

class CandidateIntakeCoordinator {
  private metrics: CandidateIntakeMetrics = {
    totalEvaluated: 0,
    totalEligible: 0,
    totalRejected: 0,
    totalEnqueued: 0,
    lastEvaluationTime: null,
    rejectionBreakdown: {},
    recentRejections: []
  };

  /**
   * Evaluates all candidate setups across current asset intelligence profiles
   */
  public async evaluateAndDispatchCandidates(
    profiles: Record<string, AssetIntelligenceProfile>,
    telemetry?: any
  ): Promise<{
    evaluated: number;
    enqueued: number;
    rejected: number;
    results: Record<string, { status: string; enqueued: boolean; reason?: string }>;
  }> {
    const results: Record<string, { status: string; enqueued: boolean; reason?: string }> = {};
    let enqueuedCount = 0;
    let rejectedCount = 0;
    let evaluatedCount = 0;

    const now = Date.now();
    this.metrics.lastEvaluationTime = now;

    for (const [symbol, profile] of Object.entries(profiles)) {
      evaluatedCount++;
      this.metrics.totalEvaluated++;

      const decision = profile.decisionIntelligenceV2;
      const setup = profile.setupIntelligenceV3;

      // Only evaluate if profile has decision and setup structures
      if (!decision || !setup) {
        results[symbol] = {
          status: 'NO_SETUP_ACTIVE',
          enqueued: false,
          reason: 'Awaiting decision and setup intelligence formation'
        };
        continue;
      }

      // Check if setup is armed or active
      const hasDirection = setup.direction === 'LONG' || setup.direction === 'SHORT';
      if (!hasDirection || !setup.setupId || setup.setupId.endsWith('NONE')) {
        results[symbol] = {
          status: 'NO_DIRECTIONAL_SETUP',
          enqueued: false,
          reason: 'Setup direction is NONE or setup not yet formed'
        };
        continue;
      }

      try {
        const processResult = await telegramSignalService.processCandidateSetup(
          decision,
          setup,
          telemetry || { provider: 'MT5', symbol }
        );

        results[symbol] = {
          status: processResult.status,
          enqueued: processResult.enqueued,
          reason: processResult.rejectionReason
        };

        if (processResult.enqueued) {
          enqueuedCount++;
          this.metrics.totalEligible++;
          this.metrics.totalEnqueued++;
        } else {
          rejectedCount++;
          this.metrics.totalRejected++;

          const rStatus = processResult.status || 'UNKNOWN_REJECTION';
          this.metrics.rejectionBreakdown[rStatus] = (this.metrics.rejectionBreakdown[rStatus] || 0) + 1;

          this.metrics.recentRejections.unshift({
            symbol,
            setupId: setup.setupId,
            direction: setup.direction,
            status: rStatus,
            rejectionReason: processResult.rejectionReason || 'Institutional gate rejection',
            timestamp: now
          });

          if (this.metrics.recentRejections.length > 50) {
            this.metrics.recentRejections.pop();
          }
        }
      } catch (err: any) {
        results[symbol] = {
          status: 'PROCESSING_ERROR',
          enqueued: false,
          reason: err?.message || String(err)
        };
      }
    }

    // If any signals were enqueued, immediately process the dispatch queue
    if (enqueuedCount > 0) {
      telegramSignalService.processQueue().catch((err) => {
        console.error('[CANDIDATE INTAKE] Failed processing Telegram queue:', err?.message || err);
      });
    }

    return {
      evaluated: evaluatedCount,
      enqueued: enqueuedCount,
      rejected: rejectedCount,
      results
    };
  }

  /**
   * Returns current candidate intake telemetry metrics
   */
  public getMetrics(): CandidateIntakeMetrics {
    return {
      ...this.metrics,
      rejectionBreakdown: { ...this.metrics.rejectionBreakdown },
      recentRejections: [...this.metrics.recentRejections]
    };
  }

  /**
   * Reset metrics for test isolation
   */
  public resetMetricsForTesting(): void {
    this.metrics = {
      totalEvaluated: 0,
      totalEligible: 0,
      totalRejected: 0,
      totalEnqueued: 0,
      lastEvaluationTime: null,
      rejectionBreakdown: {},
      recentRejections: []
    };
  }
}

export const candidateIntakeCoordinator = new CandidateIntakeCoordinator();

