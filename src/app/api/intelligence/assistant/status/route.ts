/**
 * FEF CORTEX — OPENAI GPT ASSISTANT STATUS API ROUTE
 *
 * Phase 12 Workstream 12G & 12J: System Observability & Model Status
 * Reports model availability, budget metrics, and configuration
 * without exposing API keys.
 */

import { NextResponse } from 'next/server';
import { openAiService } from '@/lib/intelligence/openai-client';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const config = openAiService.getConfig();
    const budget = openAiService.getBudgetStatus();
    const modelCheck = await openAiService.checkModelAvailability();

    return NextResponse.json({
      success: true,
      service: 'FEF_CORTEX_AI_ASSISTANT',
      configured: Boolean(config.apiKey),
      enabled: config.enabled,
      zeroCostCompliance: true,
      requestedModel: config.model,
      reasoningEffort: config.reasoningEffort,
      maxOutputTokens: config.maxOutputTokens,
      modelAvailability: {
        isAvailable: modelCheck.isAvailable,
        status: modelCheck.status,
        error: modelCheck.error,
        checkedAt: modelCheck.checkedAt,
      },
      budgetMetrics: {
        date: budget.date,
        dailyBudgetUsd: budget.dailyBudgetUsd,
        totalCostUsd: Number(budget.totalCostUsd.toFixed(4)),
        budgetRemainingUsd: Number(budget.budgetRemainingUsd.toFixed(4)),
        totalTokens: budget.totalTokens,
        requestCount: budget.requestCount,
        isBudgetExhausted: budget.isBudgetExhausted,
      },
      safetyLimits: {
        readOnlyAdvisory: true,
        orderTransportDisabled: true,
        promptInjectionGuards: true,
        decisionEngineSupremacy: true,
        zeroCostPolicyEnforced: true,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Failed to check OpenAI Assistant status',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

