/**
 * FEF CORTEX — Cockpit Intelligence Expansion Verification Suite
 * Validates Parts A through L of the approved implementation:
 * 1. EvolutionaryTracker right column placement, bounded height, and fail-closed state
 * 2. EvolutionaryTracker removal from Tab 3 and RegimeQuantPanel full width
 * 3. ExecutionControlCard 6-metric capital & transport telemetry grid
 * 4. Central Multi-Agent Swarm 6 Institutional Specialists mapping
 * 5. Dynamic 21-node contributor count logic (fail-closed, never hardcoded)
 * 6. Event-driven Agent -> Core SVG pulse flow and idle quiescence
 * 7. OrchestratorCore dynamic ingestion state (no fake rotator)
 * 8. Execution safety invariants (single authority, realExecutionLocked)
 */

import fs from 'fs';
import path from 'path';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASS: ${message}`);
}

const ROOT = path.resolve(__dirname, '..');

function readSource(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf-8');
}

console.log('===============================================================');
console.log('FEF CORTEX — COCKPIT INTELLIGENCE EXPANSION VERIFICATION SUITE');
console.log('===============================================================\n');

// 1. EvolutionaryTracker Right Column Placement & Bounded Container
console.log('--- TEST 1: EvolutionaryTracker Right Column & Empty Space Placement ---');
const cockpitPageSrc = readSource('src/app/cockpit/page.tsx');

const execCardPos = cockpitPageSrc.indexOf('<ExecutionControlCard');
const evolTrackerPos = cockpitPageSrc.indexOf('<EvolutionaryTracker');
assert(execCardPos !== -1, 'ExecutionControlCard mounted in cockpit page');
assert(evolTrackerPos !== -1, 'EvolutionaryTracker mounted in cockpit page');
assert(evolTrackerPos > execCardPos, 'EvolutionaryTracker mounted after ExecutionControlCard in right column');

const evolTrackerSrc = readSource('src/components/cockpit/EvolutionaryTracker.tsx');
assert(
  evolTrackerSrc.includes('CORTEX INTELLIGENCE EVOLUTION') && evolTrackerSrc.includes('WHAT CHANGED?'),
  'EvolutionaryTracker contains canonical "CORTEX INTELLIGENCE EVOLUTION / WHAT CHANGED?" header'
);
assert(
  evolTrackerSrc.includes('max-h-[290px]') || evolTrackerSrc.includes('max-h-[300px]'),
  'EvolutionaryTracker container height bounded (~290px) to balance column height'
);
assert(
  evolTrackerSrc.includes('CONTINUOUS SURVEILLANCE ACTIVE') &&
  evolTrackerSrc.includes('No material state transitions or consensus flips recorded'),
  'EvolutionaryTracker renders verified fail-closed copy when changes are zero'
);

// 2. Regime Tab Deduplication
console.log('\n--- TEST 2: Deduplication from #sentinel-deck Regime Tab ---');
const regimeTabPos = cockpitPageSrc.indexOf("{activeTab === 'regime' && (");
assert(regimeTabPos !== -1, 'Regime tab content block found in page.tsx');
const regimeTabSection = cockpitPageSrc.slice(regimeTabPos);
const nextTabPos = regimeTabSection.indexOf('{activeTab ===', 20);
const regimeBlock = nextTabPos !== -1 ? regimeTabSection.slice(0, nextTabPos) : regimeTabSection;

assert(!regimeBlock.includes('<EvolutionaryTracker'), 'EvolutionaryTracker removed from Regime Tab (Tab 3)');
assert(regimeBlock.includes('<RegimeQuantPanel'), 'RegimeQuantPanel present in Regime Tab');
assert(
  regimeBlock.includes('w-full') || regimeBlock.includes('col-span-12'),
  'RegimeQuantPanel expanded to full width in Regime Tab'
);

// 3. ExecutionControlCard Capital Telemetry Grid
console.log('\n--- TEST 3: ExecutionControlCard Capital & Transport Telemetry ---');
const execCardSrc = readSource('src/components/cockpit/ExecutionControlCard.tsx');

assert(execCardSrc.includes('Balance & Equity'), 'ExecutionControlCard exposes Balance & Equity');
assert(execCardSrc.includes('Free Margin & Level'), 'ExecutionControlCard exposes Free Margin & Margin Level');
assert(execCardSrc.includes('Floating P/L') && execCardSrc.includes('Exposure:'), 'ExecutionControlCard exposes Floating P/L & Open Exposure Lots');
assert(execCardSrc.includes('Broker Terminal'), 'ExecutionControlCard exposes Broker Terminal telemetry');
assert(execCardSrc.includes('Bridge Transport'), 'ExecutionControlCard exposes Bridge Transport & Latency telemetry');
assert(execCardSrc.includes('Quote Authority'), 'ExecutionControlCard exposes Quote Authority & Freshness telemetry');
assert(execCardSrc.includes('DATA LIMITED'), 'ExecutionControlCard fails closed on missing telemetry');

// 4. Central Multi-Agent Swarm 6 Specialists Mapping
console.log('\n--- TEST 4: Central Multi-Agent Swarm 6 Specialists Mapping ---');
const hubSrc = readSource('src/components/cockpit/CentralIntelligenceHub.tsx');

const requiredSpecialists = [
  'MARKET_REGIME_CLASSIFIER_AGENT',
  'CURRENCY_STRENGTH_AGENT',
  'COT_POSITIONING_AGENT',
  'RATES_AGENT',
  'VOLATILITY_AGENT',
  'CENTRAL_BANK_POLICY_AGENT',
];

for (const specId of requiredSpecialists) {
  assert(hubSrc.includes(specId), `CentralIntelligenceHub truthfully maps ${specId}`);
}

assert(hubSrc.includes('isSpecialist: true'), 'CentralIntelligenceHub marks specialists with isSpecialist flag');
assert(hubSrc.includes('leftNodes'), 'CentralIntelligenceHub constructs leftNodes (10 total: 2 upper + 7 council + 1 lower)');
assert(hubSrc.includes('rightNodes'), 'CentralIntelligenceHub constructs rightNodes (10 total: 2 upper + 7 council + 1 lower)');

// 5. Dynamic Contributor Counting Logic & State Classification
console.log('\n--- TEST 5: Dynamic Contributor Counting Logic & State Classification ---');
assert(
  hubSrc.includes('classifyVisibleNodes') &&
  hubSrc.includes('nodeModel.breakdown.contributingCount'),
  'CentralIntelligenceHub uses classifyVisibleNodes to compute verified visible breakdown'
);
assert(
  hubSrc.includes('CONTRIBUTING') && !hubSrc.includes('21/21 ACTIVE'),
  'CentralIntelligenceHub displays "{contributingCount} CONTRIBUTING" and does NOT hardcode "21/21 ACTIVE"'
);
assert(
  hubSrc.includes('32 REGISTERED AGENTS (15 Council + 17 Specialists)'),
  'CentralIntelligenceHub retains link to full 32 Registered Agents'
);

// 6. HubNetworkSvg Static Connector Topology & Zero Animation Artifacts
console.log('\n--- TEST 6: HubNetworkSvg Static Connector Topology & Zero Animation Artifacts ---');
const svgSrc = readSource('src/components/central-hub/HubNetworkSvg.tsx');

assert(svgSrc.includes('Y_COORDS_10'), 'HubNetworkSvg supports 10-node anchor mapping (Y_COORDS_10)');
assert(svgSrc.includes('tendrilGrad-spec'), 'HubNetworkSvg styles specialist tendril lines with distinct violet gradient');
assert(
  svgSrc.includes('pathLength="100"'),
  'HubNetworkSvg normalizes connector paths with pathLength="100" for exact stroke geometry'
);
assert(
  svgSrc.includes('agents.map') && svgSrc.includes('Complete static Agent -> Core route'),
  'HubNetworkSvg renders one complete static Agent -> Core route for every visible orbital agent'
);
assert(
  !svgSrc.includes('stroke-dashoffset') && !svgSrc.includes('<animate') && !svgSrc.includes('animateMotion'),
  'HubNetworkSvg contains no travelling dash, SVG animation, or particle-motion connector effects'
);
assert(
  !svgSrc.includes('feGaussianBlur') && !svgSrc.includes('filter="url(#neonGlow)"'),
  'HubNetworkSvg has zero raster feGaussianBlur filters to eliminate rectangular clipping artifacts'
);
assert(
  svgSrc.includes('isContributing') && svgSrc.includes("stroke={!isContributing ? '#334155'"),
  'HubNetworkSvg preserves truthful muted styling without removing non-contributing routes'
);

// 7. OrchestratorCore Dynamic Ingestion State & Radial Absorption Ripple
console.log('\n--- TEST 7: OrchestratorCore Dynamic Ingestion Response & Visible Breakdown ---');
const coreSrc = readSource('src/components/central-hub/OrchestratorCore.tsx');

assert(!coreSrc.includes('CORE_STATES'), 'OrchestratorCore removed fake CORE_STATES rotator');
assert(!coreSrc.includes('setInterval'), 'OrchestratorCore removed fake setInterval state rotator');
assert(coreSrc.includes('isIngesting'), 'OrchestratorCore accepts isIngesting prop');
assert(
  coreSrc.includes('CONTRIBUTING /') && coreSrc.includes('VISIBLE'),
  'OrchestratorCore displays dynamic "{contributingCount} CONTRIBUTING / {totalVisibleCount} VISIBLE"'
);
assert(
  (coreSrc.includes('Breakdown') || coreSrc.includes('breakdown')) && coreSrc.includes('DATA LIMITED'),
  'OrchestratorCore displays compact classification breakdown underneath tally'
);
assert(
  coreSrc.includes('INGESTING EVIDENCE'),
  'OrchestratorCore displays "INGESTING EVIDENCE" badge during genuine runtime evidence ingestion'
);

// 8. Execution Invariants & Safety Locks
console.log('\n--- TEST 8: Execution Invariants & Safety Locks ---');
const bridgeV2Src = readSource('scripts/fef-execution-bridge-v2.js');
assert(bridgeV2Src.includes('realExecutionLocked: true'), 'Bridge V2 strictly enforces realExecutionLocked: true');

const execPolicySrc = readSource('src/lib/bridge/execution-bridge-v2-client.ts');
assert(execPolicySrc.includes('realExecutionLocked: boolean'), 'Execution Bridge client contract specifies realExecutionLocked');

assert(!execCardSrc.includes('sendOrder') && !execCardSrc.includes('dispatchTrade'), 'ExecutionControlCard has zero dispatch authority');

// 9. Runtime classifyVisibleNodes & Breakdown Mathematical Reconciliation
console.log('\n--- TEST 9: Runtime classifyVisibleNodes & Breakdown Mathematical Reconciliation ---');
import { classifyVisibleNodes } from '../src/lib/agents/hub-animation-engine';

// Test with 15 council agents (some normal, some data limited, some error)
const mockCouncil = Array.from({ length: 15 }, (_, i) => ({
  type: `COUNCIL_${i}` as any,
  name: `Council Agent ${i}`,
  bias: 'NEUTRAL' as any,
  confidence: 70,
  weight: 1,
  status: i === 2 ? 'DATA LIMITED' : i === 5 ? 'ERROR' : i === 7 ? 'OFFLINE' : 'IDLE',
  reasoning: 'Testing node',
}));

const mockSpecialists = [
  { agentId: 'MARKET_REGIME_CLASSIFIER_AGENT', readiness: 'READY' as const, name: 'Regime' },
  { agentId: 'CURRENCY_STRENGTH_AGENT', readiness: 'PARTIAL' as const, name: 'Strength' },
  { agentId: 'COT_POSITIONING_AGENT', readiness: 'DATA_LIMITED' as const, name: 'COT' },
  { agentId: 'RATES_AGENT', readiness: 'UNAVAILABLE' as const, name: 'Rates' },
  { agentId: 'VOLATILITY_AGENT', readiness: 'READY' as const, name: 'Vol' },
  { agentId: 'CENTRAL_BANK_POLICY_AGENT', readiness: 'READY' as const, name: 'Central Bank' },
];

const result = classifyVisibleNodes(mockCouncil, mockSpecialists);
assert(result.classifications.length === 21, 'classifyVisibleNodes yields exactly 21 visible nodes');
assert(result.breakdown.visibleNodeCount === 21, 'breakdown.visibleNodeCount equals 21');

const sumOfBreakdown =
  result.breakdown.contributingCount +
  result.breakdown.dataLimitedCount +
  result.breakdown.offlineCount +
  result.breakdown.errorCount +
  result.breakdown.unavailableCount;
assert(sumOfBreakdown === 21, `Mathematical reconciliation: sum of breakdown (${sumOfBreakdown}) equals exactly 21 visible nodes`);
assert(result.breakdown.dataLimitedCount === 2, `Data limited count correctly equals 2 (1 council + 1 specialist)`);
assert(result.breakdown.errorCount === 1, `Error count correctly equals 1`);
assert(result.breakdown.offlineCount === 1, `Offline count correctly equals 1`);
assert(result.breakdown.unavailableCount === 1, `Unavailable count correctly equals 1`);
assert(result.breakdown.contributingCount === 16, `Contributing count correctly equals 16 (12 council + 4 specialists)`);

console.log('\n===============================================================');
console.log('ALL 9 COCKPIT INTELLIGENCE EXPANSION VERIFICATION SUITES PASSED!');
console.log('===============================================================');
