/**
 * FEF CORTEX — INSTITUTIONAL MARKET INTELLIGENCE REPORTS API
 *
 * Phase 12 Workstream 12H: Structured AI Market Reports
 * Supports 9 institutional report categories with full provenance,
 * data timestamps, evidence audits, and risk disclaimers.
 */

import { NextResponse } from 'next/server';
import { openAiService } from '@/lib/intelligence/openai-client';
import { buildCortexContextSnapshot } from '@/lib/intelligence/market-context-builder';
import { mt5HttpClient } from '@/lib/bridge/mt5-http-client';

export const dynamic = 'force-dynamic';

export type ReportType =
  | 'DAILY_INTELLIGENCE'
  | 'XAUUSD_ANALYSIS'
  | 'MULTI_ASSET_SUMMARY'
  | 'OPPORTUNITY_SUMMARY'
  | 'AGENT_CONSENSUS'
  | 'DECISION_EXPLANATION'
  | 'SETUP_QUALITY'
  | 'MARKET_CONFLICTS'
  | 'RISK_VOLATILITY';

const REPORT_PROMPTS: Record<ReportType, { title: string; prompt: string }> = {
  DAILY_INTELLIGENCE: {
    title: 'Daily Market Intelligence Report',
    prompt: 'Provide an executive daily market intelligence report analyzing current session market conditions, macro context, liquidity distribution, and key directional biases across major assets.',
  },
  XAUUSD_ANALYSIS: {
    title: 'XAUUSD Institutional Analysis',
    prompt: 'Deliver an in-depth institutional quantitative analysis of XAUUSD (Gold), evaluating order flow, technical market structure, macro yield curve correlation, and Decision Engine V2 alignment.',
  },
  MULTI_ASSET_SUMMARY: {
    title: 'Multi-Asset Cross-Market Summary',
    prompt: 'Summarize cross-asset interactions across Metals, Forex, Indices, Energy, and Crypto majors, highlighting lead-lag relationships, risk-on/risk-off sentiment, and relative strength.',
  },
  OPPORTUNITY_SUMMARY: {
    title: 'Bullish & Bearish Opportunity Summary',
    prompt: 'Break down ranked high-probability opportunities across the universe, detailing directional convictions, risk/reward profiles, and required confirmation triggers.',
  },
  AGENT_CONSENSUS: {
    title: '32-Agent Consensus & Correlation Report',
    prompt: 'Audit the 32-agent architecture consensus, distinguishing independent confirmation agents from correlated OHLC indicators, and summarizing voter distribution.',
  },
  DECISION_EXPLANATION: {
    title: 'Decision Engine V2 Explanation',
    prompt: 'Explain the Decision Engine V2 rationale for the active asset: explain why current bias was accepted or blocked, detailing confidence vs completeness and active vetoes.',
  },
  SETUP_QUALITY: {
    title: 'Setup Intelligence V3 Quality Assessment',
    prompt: 'Assess current Setup Intelligence V3 setups against institutional standards: analyze entry zones, stop-loss placement, take-profit targets, and the mandatory 2.0:1 R:R minimum policy.',
  },
  MARKET_CONFLICTS: {
    title: 'Market Conflict & Discrepancy Report',
    prompt: 'Identify conflicting signals between technical momentum, order flow, macro yields, and retail positioning, explaining how CORTEX risk guards resolve these discrepancies.',
  },
  RISK_VOLATILITY: {
    title: 'Risk & Volatility Architecture Summary',
    prompt: 'Report on market volatility regimes, ATR expansion, spread conditions, session killzones, and drawdown defense parameters currently enforced.',
  },
};

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const type = (url.searchParams.get('type') || 'DAILY_INTELLIGENCE').toUpperCase() as ReportType;
    const symbol = (url.searchParams.get('symbol') || 'XAUUSD').toUpperCase();

    const reportDef = REPORT_PROMPTS[type] || REPORT_PROMPTS.DAILY_INTELLIGENCE;

    // Fetch authoritative market telemetry
    let telemetryData: any = null;
    let quoteData: any = null;

    try {
      telemetryData = await mt5HttpClient.getStatus();
      if (telemetryData && telemetryData.quotes) {
        quoteData = telemetryData.quotes[symbol];
      }
    } catch {}

    const contextSnapshot = buildCortexContextSnapshot(symbol, quoteData, telemetryData);

    const config = openAiService.getConfig();

    // If OpenAI is disabled by policy or API key is missing, return a structured deterministic template report with verified CORTEX telemetry
    if (!config.enabled || !config.apiKey) {
      return NextResponse.json({
        success: true,
        report: {
          type,
          title: reportDef.title,
          generatedAt: new Date().toISOString(),
          marketDataTimestamp: contextSnapshot.timestamp,
          symbol,
          freshness: contextSnapshot.marketData.freshness,
          modelUsed: 'FEF_DETERMINISTIC_ENGINE (Zero-cost compliance: OpenAI disabled)',
          sections: [
            {
              heading: '1. Executive Intelligence Summary',
              content: `Authoritative CORTEX telemetry for ${symbol} confirms ${contextSnapshot.marketData.freshness} market state. Bid: ${contextSnapshot.marketData.bid}, Ask: ${contextSnapshot.marketData.ask}, Spread: ${contextSnapshot.marketData.spreadPoints} points. Decision Engine V2 bias: ${contextSnapshot.decisionEngineV2.bias} (${contextSnapshot.decisionEngineV2.confidencePct}% confidence, ${contextSnapshot.decisionEngineV2.completenessPct}% completeness).`,
            },
            {
              heading: '2. 32-Agent Intelligence Voting Breakdown',
              content: `Total Agents: 32 (31 Upstream Voters + 1 Downstream Synthesizer). Independent Confirmations: ${contextSnapshot.decisionEngineV2.independentConfirmationsCount}. Active Vetoes: ${contextSnapshot.decisionEngineV2.activeVetoes.length > 0 ? contextSnapshot.decisionEngineV2.activeVetoes.join(', ') : 'None'}.`,
            },
            {
              heading: '3. Setup Intelligence V3 Structure',
              content: `Setup Status: ${contextSnapshot.setupIntelligenceV3.hasValidSetup ? 'ACTIVE' : 'IMMATURE'}. Direction: ${contextSnapshot.setupIntelligenceV3.direction || 'WAITING'}. R:R Policy Compliant (>= 2.0:1): ${contextSnapshot.setupIntelligenceV3.meetsMinimumRrPolicy ? 'YES' : 'NO'}.`,
            },
            {
              heading: '4. Institutional Limitations & Disclaimers',
              content: 'All analysis is strictly informational and read-only. MT5 order transport remains strictly disabled. Zero-cost compliance active: OpenAI dynamic generation is disabled by project-owner policy.',
            },
          ],
          telemetryAudit: {
            broker: contextSnapshot.marketData.broker,
            heartbeatAgeMs: contextSnapshot.marketData.heartbeatAgeMs,
            activeInstruments: 25,
            executionMode: 'READ_ONLY',
          },
        },
      });
    }

    // Dynamic AI Report generation via OpenAI API
    const aiResp = await openAiService.generateChatResponse({
      prompt: `${reportDef.prompt} Ensure the output is formatted in clean institutional markdown with sections for Executive Summary, Technical Architecture, Agent Consensus, Risk Evaluation, and Disclaimers.`,
      contextSnapshot,
    });

    if (!aiResp.success) {
      return NextResponse.json(
        {
          success: false,
          error: aiResp.error,
          errorCode: aiResp.errorCode,
          generatedAt: new Date().toISOString(),
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      report: {
        type,
        title: reportDef.title,
        generatedAt: aiResp.generatedAt,
        marketDataTimestamp: contextSnapshot.timestamp,
        symbol,
        freshness: contextSnapshot.marketData.freshness,
        modelUsed: aiResp.model,
        markdownContent: aiResp.content,
        telemetryAudit: {
          broker: contextSnapshot.marketData.broker,
          heartbeatAgeMs: contextSnapshot.marketData.heartbeatAgeMs,
          activeInstruments: 25,
          executionMode: 'READ_ONLY',
        },
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to generate report' },
      { status: 500 }
    );
  }
}
