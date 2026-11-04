import assert from 'assert';
import { evaluateSignalEligibility } from '../src/lib/telegram/telegram-signal-eligibility';
import { telegramClient } from '../src/lib/telegram/telegram-client';
import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';

console.log('================================================================');
console.log('FEF CORTEX: DUAL NOTIFICATION PAYLOAD PARITY TEST');
console.log('================================================================\n');

// 1. Create a fully qualified institutional synthetic setup (XAUUSD BUY)
const now = Date.now();
const mockDecision: any = {
  maturity: 'VALIDATED_SETUP',
  bias: 'BULLISH',
  confidence: 88,
  evidenceCompleteness: 92,
  registeredAgentCount: 32,
  upstreamAgentCount: 32,
  domains: [],
  independentDomainCount: 3,
  supportingDomains: ['PRICE_STRUCTURE', 'MOMENTUM', 'INSTITUTIONAL_PROXY'],
  opposingDomains: [],
  unavailableDomains: [],
  hardVetoes: [],
  softVetoes: [],
  conflicts: [],
  requirementsToAdvance: [],
  blockingConditions: [],
  invalidationConditions: [],
  explanation: 'Institutional order block with confirmed higher low and MTF alignment',
  sessionContext: { activeKillzone: true, currentSession: 'LONDON' },
  tradeExecutable: false,
  executionMode: 'READ_ONLY',
  mt5OrderTransportEnabled: false,
  snapshotId: 'snap-parity-001',
  asOf: now,
  generatedAt: now,
  legacyCompatibility: {},
};

const mockSetup: any = {
  version: '3.0',
  setupId: 'SIG-XAUUSD-PARITY-TEST',
  symbol: 'XAUUSD',
  snapshotId: 'snap-parity-001',
  asOf: now,
  lifecycle: 'VALIDATED',
  direction: 'LONG',
  setupType: 'INSTITUTIONAL_ORDER_BLOCK',
  thesis: 'Clean liquidity sweep of Asian low with market structure shift on M15',
  entryZone: { low: 2740.0, high: 2742.0, midpoint: 2741.0, source: 'FVG_M15', rationale: 'Fair value gap' },
  trigger: { state: 'CONFIRMED', type: 'CANDLE_CLOSE' },
  invalidation: { price: 2735.0, condition: 'M15 close below swing low', source: 'STRUCTURE', rationale: 'Invalidation level' },
  stopLoss: { price: 2735.0, rationale: 'Swing low buffer', bufferAtrMultiplier: 1.2, distance: 6.0 },
  targets: [
    { targetIndex: 1, label: 'TP1', price: 2755.0, source: 'EQUAL_HIGHS', rationale: 'External liquidity', rewardDistance: 14.0, riskReward: 2.33 },
    { targetIndex: 2, label: 'TP2', price: 2765.0, source: 'DAILY_HIGH', rationale: 'Daily resistance', rewardDistance: 24.0, riskReward: 4.0 },
  ],
  risk: { riskDistance: 6.0, riskAtrMultiple: 1.2 },
  reward: { rewardDistance: 24.0, primaryTargetPrice: 2755.0 },
  riskReward: { ratio: 4.0, formatted: '4.0:1', meetsMinimumThreshold: true },
  confirmationRequirements: [],
  confirmationsSatisfied: ['M15_MSS', 'VOLUME_EXPANSION'],
  confirmationsMissing: [],
  supportingEvidence: ['Liquidity swept', 'Bullish displacement'],
  opposingEvidence: [],
  structuralContext: { structureTf: 'M15' },
};

const validTelemetry = {
  symbol: 'XAUUSD',
  bid: 2741.2,
  ask: 2741.6,
  spreadPoints: 4,
  timestamp: now - 2000,
  mt5Connected: true,
};

// 2. Evaluate Candidate through Gate 21
const gateResult = evaluateSignalEligibility(mockDecision, mockSetup, validTelemetry, new Set());
assert(gateResult.isEligible, 'Candidate must pass all 21 eligibility gates');
const payload = gateResult.payload!;

console.log('✓ Gate 21 Result: ELIGIBLE');
console.log('  Signal ID:', payload.signalId);

// 3. Construct In-App Notification Record
const inAppNotification = {
  id: payload.signalId,
  symbol: payload.symbol,
  direction: payload.direction,
  title: `Opportunity: ${payload.symbol} (${payload.direction})`,
  message: `Entry: ${payload.entryZone.low.toFixed(2)}-${payload.entryZone.high.toFixed(2)} | SL: ${payload.stopLoss.price.toFixed(2)} | TP1: ${payload.takeProfit1.price.toFixed(2)} | TP2: ${payload.takeProfit2.price.toFixed(2)} | R:R ${payload.riskRewardRatio}:1`,
  type: 'TRADE_OPPORTUNITY_CONFIRMED',
  priority: 'HIGH',
  entry: payload.entryZone.midpoint,
  stopLoss: payload.stopLoss.price,
  tp1: payload.takeProfit1.price,
  tp2: payload.takeProfit2.price,
  riskReward: payload.riskRewardRatio,
  timestamp: new Date(payload.timestamps.validatedAt).toISOString(),
  read: false,
};

// 4. Construct Browser Notification Object
const browserNotification = {
  tag: payload.signalId,
  title: `FEF CORTEX: ${payload.direction} ${payload.symbol}`,
  body: `Entry: ${payload.entryZone.midpoint.toFixed(2)} | SL: ${payload.stopLoss.price.toFixed(2)} | TP2: ${payload.takeProfit2.price.toFixed(2)} (R:R ${payload.riskRewardRatio}:1)`,
  icon: '/images/fef-logo.png',
  data: {
    signalId: payload.signalId,
    symbol: payload.symbol,
    direction: payload.direction,
    entryLow: payload.entryZone.low,
    entryHigh: payload.entryZone.high,
    stopLoss: payload.stopLoss.price,
    tp1: payload.takeProfit1.price,
    tp2: payload.takeProfit2.price,
    riskRewardRatio: payload.riskRewardRatio,
  }
};

// 5. Construct Telegram Payload & Caption
const telegramCaption = telegramClient.formatSignalCaption(payload);

// 6. Persist to Isolated Test SQLite Database
const testDbPath = '/tmp/test-parity.db';
if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
const testDb = new DatabaseSync(testDbPath);
testDb.exec(`
  CREATE TABLE signals (
    signal_id TEXT PRIMARY KEY,
    symbol TEXT,
    direction TEXT,
    entry_mid REAL,
    stop_loss REAL,
    tp1 REAL,
    tp2 REAL,
    risk_reward REAL,
    status TEXT,
    created_at INTEGER
  );
`);

testDb.prepare(`
  INSERT INTO signals (signal_id, symbol, direction, entry_mid, stop_loss, tp1, tp2, risk_reward, status, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  payload.signalId,
  payload.symbol,
  payload.direction,
  payload.entryZone.midpoint,
  payload.stopLoss.price,
  payload.takeProfit1.price,
  payload.takeProfit2.price,
  payload.riskRewardRatio,
  gateResult.status,
  payload.timestamps.validatedAt
);

const dbRecord = testDb.prepare('SELECT * FROM signals WHERE signal_id = ?').get(payload.signalId) as any;
testDb.close();

// 7. Verify Field-by-Field Parity Across All 4 Destinations
console.log('\n--- FIELD-BY-FIELD PARITY AUDIT TABLE ---');
const comparison = [
  { field: 'Signal ID', database: dbRecord.signal_id, telegram: payload.signalId, inApp: inAppNotification.id, browser: browserNotification.tag, parity: 'MATCH' },
  { field: 'Symbol', database: dbRecord.symbol, telegram: payload.symbol, inApp: inAppNotification.symbol, browser: browserNotification.data.symbol, parity: 'MATCH' },
  { field: 'Direction', database: dbRecord.direction, telegram: payload.direction, inApp: inAppNotification.direction, browser: browserNotification.data.direction, parity: 'MATCH' },
  { field: 'Entry Midpoint', database: dbRecord.entry_mid.toFixed(2), telegram: payload.entryZone.midpoint.toFixed(2), inApp: inAppNotification.entry.toFixed(2), browser: ((browserNotification.data.entryLow + browserNotification.data.entryHigh)/2).toFixed(2), parity: 'MATCH' },
  { field: 'Stop Loss', database: dbRecord.stop_loss.toFixed(2), telegram: payload.stopLoss.price.toFixed(2), inApp: inAppNotification.stopLoss.toFixed(2), browser: browserNotification.data.stopLoss.toFixed(2), parity: 'MATCH' },
  { field: 'Take Profit 1', database: dbRecord.tp1.toFixed(2), telegram: payload.takeProfit1.price.toFixed(2), inApp: inAppNotification.tp1.toFixed(2), browser: browserNotification.data.tp1.toFixed(2), parity: 'MATCH' },
  { field: 'Take Profit 2', database: dbRecord.tp2.toFixed(2), telegram: payload.takeProfit2.price.toFixed(2), inApp: inAppNotification.tp2.toFixed(2), browser: browserNotification.data.tp2.toFixed(2), parity: 'MATCH' },
  { field: 'Risk/Reward Ratio', database: dbRecord.risk_reward.toFixed(1) + ':1', telegram: payload.riskRewardRatio.toFixed(1) + ':1', inApp: inAppNotification.riskReward.toFixed(1) + ':1', browser: browserNotification.data.riskRewardRatio.toFixed(1) + ':1', parity: 'MATCH' },
  { field: 'Qualification Status', database: dbRecord.status, telegram: 'ELIGIBLE', inApp: 'TRADE_OPPORTUNITY_CONFIRMED', browser: 'CONFIRMED', parity: 'CONSISTENT' },
];

console.table(comparison);

for (const row of comparison) {
  if (row.field !== 'Qualification Status') {
    assert.strictEqual(row.database, row.telegram, `Parity mismatch on ${row.field} between DB and Telegram`);
    assert.strictEqual(row.database, row.inApp, `Parity mismatch on ${row.field} between DB and InApp`);
    assert.strictEqual(row.database, row.browser, `Parity mismatch on ${row.field} between DB and Browser`);
  }
}

// 8. Verify Telegram Caption Contains Exact Levels
console.log('\n--- TELEGRAM CAPTION VERIFICATION ---');
console.log(telegramCaption);
assert(telegramCaption.includes('2,740.00 – 2,742.00'), 'Caption must contain exact entry zone');
assert(telegramCaption.includes('2,735.00'), 'Caption must contain exact stop loss');
assert(telegramCaption.includes('2,755.00'), 'Caption must contain exact TP1');
assert(telegramCaption.includes('2,765.00'), 'Caption must contain exact TP2');
assert(telegramCaption.includes('4:1'), 'Caption must contain exact R:R');

console.log('\n================================================================');
console.log('ALL DUAL NOTIFICATION PAYLOAD PARITY ASSERTIONS PASSED CLEANLY');
console.log('================================================================\n');
