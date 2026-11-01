/**
 * FEF CORTEX — OPENAI GPT INTELLIGENCE ASSISTANT CHAT API
 *
 * Phase 12 Workstream 12G: Context-Injected Advisory Chat Route
 * Injects authoritative CORTEX market context, enforces prompt injection
 * defenses, budget controls, and returns streaming or structured JSON answers.
 */

import { NextResponse } from 'next/server';
import { openAiService } from '@/lib/intelligence/openai-client';
import { buildCortexContextSnapshot } from '@/lib/intelligence/market-context-builder';
import { telemetryRepository } from '@/lib/telemetry/telemetry-repository';
import { mt5HttpClient } from '@/lib/bridge/mt5-http-client';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    const symbol = (typeof body.symbol === 'string' ? body.symbol : 'XAUUSD').toUpperCase();
    const conversationHistory = Array.isArray(body.conversationHistory) ? body.conversationHistory : [];

    if (!prompt) {
      return NextResponse.json(
        { success: false, error: 'User prompt is required', errorCode: 'EMPTY_PROMPT' },
        { status: 400 }
      );
    }

    if (prompt.length > 2000) {
      return NextResponse.json(
        { success: false, error: 'Prompt exceeds maximum length of 2000 characters', errorCode: 'PROMPT_TOO_LONG' },
        { status: 400 }
      );
    }

    // Retrieve latest authoritative CORTEX market data from telemetry repository
    let telemetryData: any = null;
    let quoteData: any = null;

    try {
      telemetryData = await mt5HttpClient.getStatus();
      if (telemetryData && telemetryData.quotes) {
        quoteData = telemetryData.quotes[symbol];
      }
    } catch {
      // Graceful fallback to repository directly
      try {
        const hb = await telemetryRepository.getLatestHeartbeat();
        const quotes = await telemetryRepository.getLatestQuotes();
        telemetryData = { mt5Connected: Boolean(hb), lastHeartbeat: hb?.receivedAt, quotes };
        quoteData = quotes ? quotes[symbol] : null;
      } catch {}
    }

    // Build compact CORTEX context snapshot
    const contextSnapshot = buildCortexContextSnapshot(
      symbol,
      quoteData,
      telemetryData
    );

    // Call OpenAI service with context injection
    const response = await openAiService.generateChatResponse({
      prompt,
      contextSnapshot,
      conversationHistory: conversationHistory.slice(-6), // keep last 3 turns
    });

    if (!response.success) {
      const httpStatus = response.errorCode === 'OPENAI_DISABLED'
        ? 403
        : (response.errorCode === 'CREDENTIALS_REQUIRED'
          ? 401
          : (response.errorCode === 'BUDGET_EXCEEDED' ? 429 : 502));

      return NextResponse.json(
        {
          success: false,
          error: response.error,
          errorCode: response.errorCode,
          model: response.model,
          budgetRemainingUsd: response.budgetRemainingUsd,
          generatedAt: response.generatedAt,
        },
        { status: httpStatus }
      );
    }

    return NextResponse.json({
      success: true,
      answer: response.content,
      model: response.model,
      symbol,
      contextSnapshot: {
        symbol: contextSnapshot.symbol,
        freshness: contextSnapshot.marketData.freshness,
        bid: contextSnapshot.marketData.bid,
        ask: contextSnapshot.marketData.ask,
        spreadPoints: contextSnapshot.marketData.spreadPoints,
        bias: contextSnapshot.decisionEngineV2.bias,
        confidencePct: contextSnapshot.decisionEngineV2.confidencePct,
      },
      tokensUsed: response.tokensUsed,
      estimatedCostUsd: response.estimatedCostUsd,
      budgetRemainingUsd: response.budgetRemainingUsd,
      generatedAt: response.generatedAt,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Internal server error in Assistant endpoint',
        errorCode: 'INTERNAL_ERROR',
      },
      { status: 500 }
    );
  }
}
