/**
 * FEF CORTEX — PHASE 7B.3 INDEPENDENCE AUDIT TRACE
 * Read-only deterministic trace for BTCUSD and XAUUSD across:
 * - CORRELATION (Council Agent #3)
 * - CROSS_ASSET (Specialist Agent #4)
 * - CROSS_ASSET_LEAD_LAG (Specialist Agent #8)
 * 
 * ZERO BROKER TRADES. ZERO GEMINI NETWORK CALLS.
 */

import { generateAssetIntelligence } from '../src/lib/agents/multi-asset-pipeline';
import { getVerifiedCandles, aggregateCandlesToH4 } from '../src/lib/candles/independent-candle-service';
import { buildCrossAssetMatrixFromCandles } from '../src/lib/cross-asset/cross-asset-engine';
import { buildVerifiedLeadLagEnvelope, CANONICAL_LEAD_LAG_PAIRS } from '../src/lib/cross-asset/lead-lag-engine';
import { DecisionEngineV2, AGENT_DEPENDENCY_REGISTRY } from '../src/lib/decision/decision-engine-v2';

async function runTrace(symbol: string) {
  console.log(`\n=================== TRACE FOR ${symbol} ===================`);

  // 1. Fetch candles
  const [h1Res, goldH1, silverH1, oilH1, equityH1] = await Promise.all([
    getVerifiedCandles(symbol, 'H1', 40),
    getVerifiedCandles('XAUUSD', 'H1', 25),
    getVerifiedCandles('XAGUSD', 'H1', 25),
    getVerifiedCandles('USOIL', 'H1', 25),
    getVerifiedCandles('US100', 'H1', 25),
  ]);

  const h1 = h1Res?.candles || [];
  const currentPrice = h1[h1.length - 1]?.close || 1000;

  // 2. Build crossAsset matrix if gold candles available
  let crossAsset = null;
  if (goldH1?.candles && goldH1.candles.length >= 15) {
    const env = buildCrossAssetMatrixFromCandles(
      goldH1.candles,
      {
        silverCandles: silverH1?.candles,
        oilCandles: oilH1?.candles,
        equityCandles: equityH1?.candles,
      },
      true
    );
    crossAsset = env.payload;
  }

  // 3. Build lead/lag observation
  let leadLagPayload = null;
  const pair = CANONICAL_LEAD_LAG_PAIRS[symbol];
  if (pair) {
    const [leadRes, follRes] = await Promise.all([
      getVerifiedCandles(pair.leader, 'H1', 25),
      getVerifiedCandles(pair.follower, 'H1', 25),
    ]);
    if (leadRes?.candles && follRes?.candles && leadRes.candles.length >= 20 && follRes.candles.length >= 20) {
      const llEnv = buildVerifiedLeadLagEnvelope(leadRes.candles, follRes.candles, pair.leader, pair.follower, 'H1');
      leadLagPayload = llEnv.payload;
    }
  }

  const feeds = {
    timestamp: new Date().toISOString(),
    news: [],
    macro: [],
    events: [],
    alerts: [],
    sentiment: {},
    crossAsset: crossAsset,
    leadLag: leadLagPayload ? { payload: leadLagPayload } : null,
  };

  const assetIntel = generateAssetIntelligence(
    symbol,
    { symbol, price: currentPrice, change24h: 1.0, high24h: currentPrice * 1.05, low24h: currentPrice * 0.95, spread: 0.1 } as any,
    'H1',
    h1,
    'INDEPENDENT_VERIFIED',
    'Exness MT5',
    new Date(),
    feeds as any
  );

  const corrAgent = assetIntel.agents.find(a => a.type === 'CORRELATION');
  const crossSpec = assetIntel.specialistAgents?.find(a => a.agentId === 'CROSS_ASSET_AGENT');
  const leadLagSpec = assetIntel.specialistAgents?.find(a => a.agentId === 'CROSS_ASSET_LEAD_LAG_AGENT');

  console.log(`1. CORRELATION Agent:`);
  console.log(`   status: ${corrAgent?.status}`);
  console.log(`   bias: ${corrAgent?.bias}`);
  console.log(`   confidence: ${corrAgent?.confidence}`);
  console.log(`   provenance: ${corrAgent?.provenanceSourceType}`);
  console.log(`   independenceGroup: ${AGENT_DEPENDENCY_REGISTRY['CORRELATION']?.independenceGroup}`);
  console.log(`   derivationType: ${AGENT_DEPENDENCY_REGISTRY['CORRELATION']?.derivationType}`);

  console.log(`2. CROSS_ASSET Specialist:`);
  console.log(`   direction: ${crossSpec?.direction}`);
  console.log(`   confidence: ${crossSpec?.confidence}`);
  console.log(`   readiness: ${crossSpec?.readiness}`);
  console.log(`   domainFamily: ${crossSpec?.domainFamily}`);
  console.log(`   independenceGroup: ${AGENT_DEPENDENCY_REGISTRY['CROSS_ASSET']?.independenceGroup}`);
  console.log(`   derivationType: ${AGENT_DEPENDENCY_REGISTRY['CROSS_ASSET']?.derivationType}`);

  console.log(`3. CROSS_ASSET_LEAD_LAG Specialist:`);
  console.log(`   direction: ${leadLagSpec?.direction}`);
  console.log(`   confidence: ${leadLagSpec?.confidence}`);
  console.log(`   readiness: ${leadLagSpec?.readiness}`);
  console.log(`   domainFamily: ${leadLagSpec?.domainFamily}`);
  console.log(`   independenceGroup: ${AGENT_DEPENDENCY_REGISTRY['CROSS_ASSET_LEAD_LAG']?.independenceGroup}`);
  console.log(`   derivationType: ${AGENT_DEPENDENCY_REGISTRY['CROSS_ASSET_LEAD_LAG']?.derivationType}`);

  // Inspect Decision Engine V2 Result from pipeline
  const decisionResult = assetIntel.decisionIntelligenceV2;

  console.log(`\nDECISION ENGINE V2 EVALUATION:`);
  console.log(`   Final Bias: ${decisionResult?.bias}`);
  console.log(`   Final Maturity: ${decisionResult?.maturity}`);
  console.log(`   Independent Domains Count: ${decisionResult?.independentDomainCount}`);
  const crossAssetDomain = decisionResult?.domains?.find((d: any) => d.family === 'CROSS_ASSET');
  console.log(`   CROSS_ASSET Domain Consensus Polarity: ${crossAssetDomain?.polarity}`);
  console.log(`   CROSS_ASSET Domain Readiness: ${crossAssetDomain?.readiness}`);
  console.log(`   CROSS_ASSET Domain Trust: ${crossAssetDomain?.trust}`);
  console.log(`   CROSS_ASSET Domain Quality: ${crossAssetDomain?.quality}`);
  console.log(`   CROSS_ASSET Domain Participating Agents: ${crossAssetDomain?.primaryAgents?.join(', ')}`);
  console.log(`   All Domains:`, decisionResult?.domains?.map((d: any) => `${d.family}: ${d.polarity} (${d.readiness}, agents: ${d.primaryAgents?.join('+')})`));
}

async function main() {
  await runTrace('BTCUSD');
  await runTrace('XAUUSD');
}

main().catch(console.error);
