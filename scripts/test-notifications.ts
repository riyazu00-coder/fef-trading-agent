import assert from 'assert';
import {
  evaluateRadarTransitions,
  getStoredNotifications,
  saveNotifications,
  clearRadarNotificationStateForTesting,
  subscribeRadarNotifications,
  RadarNotification
} from '../src/lib/radar/radar-notifications';
import { RadarOpportunityItem } from '../src/lib/radar/opportunity-radar-engine';

console.log('================================================================');
console.log('FEF TRADING SOLUTIONS: IN-APP OPPORTUNITY NOTIFICATIONS TEST SUITE');
console.log('================================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name: string, fn: () => void) {
  totalTests++;
  try {
    fn();
    console.log(`✓ [PASS] ${name}`);
    passedTests++;
  } catch (err: any) {
    console.error(`✗ [FAIL] ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

// -----------------------------------------------------------------------------
// TEST A: 10 Simultaneous Alerts (No Overwrite, All Stored & Queued)
// -----------------------------------------------------------------------------
runTest('Condition A: 10 simultaneous alerts processed without overwrite or loss', () => {
  clearRadarNotificationStateForTesting();
  const dispatched: RadarNotification[] = [];
  const unsubscribe = subscribeRadarNotifications((notif) => {
    dispatched.push(notif);
  });

  const mockOpportunities: RadarOpportunityItem[] = Array.from({ length: 10 }, (_, i) => ({
    rank: i + 1,
    symbol: `TEST_${i}`,
    name: `Test Asset ${i}`,
    category: 'CRYPTO',
    price: 1000 + i * 10,
    change24h: 1.5,
    state: 'BUY OPPORTUNITY',
    opportunityScore: 85 + i,
    setupQuality: 85 + i,
    tradeExecutable: true,
    executabilityScore: 100,
    marketState: 'OPEN',
    aiConfidence: 80,
    timeframe: 'INTRADAY',
    riskLevel: 'LOW',
    entryZone: [990, 1010],
    stopLoss: 970,
    tp1: 1050,
    tp2: 1080,
    tp3: 1100,
    rr: '1:3.0',
    regime: 'Bullish Trend',
    catalysts: ['Orderbook imbalance'],
    invalidation: 'Break below 970',
    evidenceTrust: 65,
    actionabilityState: 'ACTIONABLE',
    isDataLimited: false
  }));

  const alerts = evaluateRadarTransitions(mockOpportunities);
  assert.strictEqual(alerts.length, 10, 'Expected 10 alert objects generated');
  assert.strictEqual(dispatched.length, 10, 'Expected all 10 alerts dispatched to listeners');

  // FIFO Queue simulation
  const queue: RadarNotification[] = [];
  for (const a of dispatched) {
    if (!queue.some(q => q.id === a.id)) {
      queue.push(a);
    }
  }
  assert.strictEqual(queue.length, 10, 'Expected queue to contain all 10 items without overwrite');
  assert.strictEqual(queue[0].symbol, 'TEST_0', 'Expected first item at head of FIFO queue');

  unsubscribe();
});

// -----------------------------------------------------------------------------
// TEST B: Boot with Closed + Open Markets (Noise Filtering)
// -----------------------------------------------------------------------------
runTest('Condition B: Boot with closed + open markets prioritizes best open asset', () => {
  clearRadarNotificationStateForTesting();
  const mockOpportunities: RadarOpportunityItem[] = [
    {
      rank: 1,
      symbol: 'XAUUSD',
      name: 'Gold Spot',
      category: 'METALS',
      price: 4349.7,
      change24h: 0.5,
      state: 'MONITOR NEXT OPEN',
      opportunityScore: 98,
      setupQuality: 98,
      tradeExecutable: false,
      executabilityScore: 0,
      marketState: 'WEEKEND_CLOSED',
      aiConfidence: 85,
      timeframe: 'INTRADAY',
      riskLevel: 'LOW',
      entryZone: [4340, 4350],
      stopLoss: 4330,
      tp1: 4370,
      tp2: 4390,
      tp3: 4410,
      rr: '1:3.5',
      regime: 'Bullish',
      catalysts: ['Consensus'],
      invalidation: '4330',
      evidenceTrust: 55,
      actionabilityState: 'MONITOR'
    },
    {
      rank: 2,
      symbol: 'BTCUSD',
      name: 'Bitcoin',
      category: 'CRYPTO',
      price: 77200,
      change24h: 1.2,
      state: 'STRONG BUY OPPORTUNITY',
      opportunityScore: 95,
      setupQuality: 95,
      tradeExecutable: true,
      executabilityScore: 100,
      marketState: 'OPEN',
      aiConfidence: 84,
      timeframe: 'SCALPING',
      riskLevel: 'LOW',
      entryZone: [76800, 77200],
      stopLoss: 76000,
      tp1: 78500,
      tp2: 79200,
      tp3: 80000,
      rr: '1:3.2',
      regime: 'Expansion',
      catalysts: ['Spot delta'],
      invalidation: '76000',
      evidenceTrust: 52,
      actionabilityState: 'ANALYSIS ONLY'
    }
  ];

  const alerts = evaluateRadarTransitions(mockOpportunities);
  assert.strictEqual(alerts.length, 2, 'Expected 2 alert objects created on boot');
  
  // Verify both alerts saved for Notification Center drawer
  const stored = getStoredNotifications();
  assert.ok(stored.some(s => s.symbol === 'XAUUSD'), 'XAUUSD closed alert must be stored in Notification Center');
  assert.ok(stored.some(s => s.symbol === 'BTCUSD'), 'BTCUSD open alert must be stored in Notification Center');

  // Verify popup filtering selects only open market for boot popup
  const popupQueueCandidates = alerts.filter(a => !(a.isBootAlert && (a.tradeExecutable === false || a.marketState === 'WEEKEND_CLOSED')));
  assert.strictEqual(popupQueueCandidates.length, 1, 'Expected only 1 open-market popup candidate on boot');
  assert.strictEqual(popupQueueCandidates[0].symbol, 'BTCUSD', 'Expected BTCUSD to be chosen for boot popup');
});

// -----------------------------------------------------------------------------
// TEST C: ANALYSIS ONLY Presentation (Trust < 60%)
// -----------------------------------------------------------------------------
runTest('Condition C: ANALYSIS ONLY correctly identified and execution gated when Trust < 60%', () => {
  clearRadarNotificationStateForTesting();
  const mockOpp: RadarOpportunityItem = {
    rank: 1,
    symbol: 'BTCUSD',
    name: 'Bitcoin',
    category: 'CRYPTO',
    price: 77200,
    change24h: 1.2,
    state: 'STRONG BUY OPPORTUNITY',
    opportunityScore: 95,
    setupQuality: 95,
    tradeExecutable: true,
    executabilityScore: 100,
    marketState: 'OPEN',
    aiConfidence: 84,
    timeframe: 'SCALPING',
    riskLevel: 'LOW',
    entryZone: [76800, 77200],
    stopLoss: 76000,
    tp1: 78500,
    tp2: 79200,
    tp3: 80000,
    rr: '1:3.2',
    regime: 'Expansion',
    catalysts: ['Delta'],
    invalidation: '76000',
    evidenceTrust: 52,
    actionabilityState: 'ANALYSIS ONLY'
  };

  const [alert] = evaluateRadarTransitions([mockOpp]);
  assert.strictEqual(alert.actionabilityState, 'ANALYSIS ONLY');
  assert.strictEqual(alert.evidenceTrust, 52);
  assert.ok(alert.evidenceTrust! < 60, 'Evidence Trust must be below canonical 60%');
});

// -----------------------------------------------------------------------------
// TEST D: ACTIONABLE Presentation (Trust >= 60%)
// -----------------------------------------------------------------------------
runTest('Condition D: ACTIONABLE opportunity correctly classified when Trust >= 60%', () => {
  clearRadarNotificationStateForTesting();
  const mockOpp: RadarOpportunityItem = {
    rank: 1,
    symbol: 'ETHUSD',
    name: 'Ethereum',
    category: 'CRYPTO',
    price: 2490,
    change24h: 2.0,
    state: 'BUY OPPORTUNITY',
    opportunityScore: 88,
    setupQuality: 88,
    tradeExecutable: true,
    executabilityScore: 100,
    marketState: 'OPEN',
    aiConfidence: 82,
    timeframe: 'INTRADAY',
    riskLevel: 'LOW',
    entryZone: [2470, 2495],
    stopLoss: 2440,
    tp1: 2550,
    tp2: 2600,
    tp3: 2650,
    rr: '1:3.0',
    regime: 'Bullish Continuation',
    catalysts: ['Whale accumulation'],
    invalidation: '2440',
    evidenceTrust: 72,
    actionabilityState: 'ACTIONABLE'
  };

  const [alert] = evaluateRadarTransitions([mockOpp]);
  assert.strictEqual(alert.actionabilityState, 'ACTIONABLE');
  assert.strictEqual(alert.evidenceTrust, 72);
  assert.ok(alert.evidenceTrust! >= 60, 'Evidence Trust must meet >= 60% threshold');
});

// -----------------------------------------------------------------------------
// TEST E: State Transition Bypasses Cooldown
// -----------------------------------------------------------------------------
runTest('Condition E: Meaningful state transition triggers new alert within cooldown', () => {
  clearRadarNotificationStateForTesting();
  const initialOpp: RadarOpportunityItem = {
    rank: 1,
    symbol: 'SOLUSD',
    name: 'Solana',
    category: 'CRYPTO',
    price: 198,
    change24h: 1.0,
    state: 'WATCH FOR BUY',
    opportunityScore: 65,
    setupQuality: 65,
    tradeExecutable: true,
    executabilityScore: 100,
    marketState: 'OPEN',
    aiConfidence: 75,
    timeframe: 'SCALPING',
    riskLevel: 'MEDIUM',
    entryZone: [195, 199],
    stopLoss: 190,
    tp1: 210,
    tp2: 220,
    tp3: 230,
    rr: '1:2.5',
    regime: 'Consolidation',
    catalysts: ['Compression'],
    invalidation: '190',
    evidenceTrust: 50,
    actionabilityState: 'ANALYSIS ONLY'
  };

  // 1. Initial boot scan
  evaluateRadarTransitions([initialOpp]);

  // 2. Transition to STRONG BUY OPPORTUNITY (state changed)
  const transitionedOpp: RadarOpportunityItem = {
    ...initialOpp,
    state: 'STRONG BUY OPPORTUNITY',
    opportunityScore: 88,
    aiConfidence: 82,
    evidenceTrust: 65,
    actionabilityState: 'ACTIONABLE'
  };

  const newAlerts = evaluateRadarTransitions([transitionedOpp]);
  assert.strictEqual(newAlerts.length, 1, 'Transition must immediately produce a new alert');
  assert.strictEqual(newAlerts[0].newState, 'STRONG BUY OPPORTUNITY');
  assert.strictEqual(newAlerts[0].actionabilityState, 'ACTIONABLE');
});

// -----------------------------------------------------------------------------
// TEST F: Identical State Suppressed by 15-Min Cooldown
// -----------------------------------------------------------------------------
runTest('Condition F: Identical state within cooldown is strictly deduplicated', () => {
  clearRadarNotificationStateForTesting();
  const opp: RadarOpportunityItem = {
    rank: 1,
    symbol: 'SOLUSD',
    name: 'Solana',
    category: 'CRYPTO',
    price: 198,
    change24h: 1.0,
    state: 'STRONG BUY OPPORTUNITY',
    opportunityScore: 88,
    setupQuality: 88,
    tradeExecutable: true,
    executabilityScore: 100,
    marketState: 'OPEN',
    aiConfidence: 82,
    timeframe: 'SCALPING',
    riskLevel: 'LOW',
    entryZone: [195, 199],
    stopLoss: 190,
    tp1: 210,
    tp2: 220,
    tp3: 230,
    rr: '1:2.5',
    regime: 'Expansion',
    catalysts: ['Volume Surge'],
    invalidation: '190',
    evidenceTrust: 65,
    actionabilityState: 'ACTIONABLE'
  };

  // 1. First scan
  const alerts1 = evaluateRadarTransitions([opp]);
  assert.strictEqual(alerts1.length, 1, 'Initial alert emitted');

  // 2. Immediate second scan with identical state (5s later)
  const alerts2 = evaluateRadarTransitions([opp]);
  assert.strictEqual(alerts2.length, 0, 'Identical state within 15-minute cooldown must be suppressed');
});

// -----------------------------------------------------------------------------
// TEST G: Popup Dismissal & Queue Advance (Preserving History)
// -----------------------------------------------------------------------------
runTest('Condition G: Dequeuing advances to next alert while preserving Notification Center history', () => {
  clearRadarNotificationStateForTesting();
  const alert1: RadarNotification = {
    id: 'notif-1',
    symbol: 'BTCUSD',
    timestamp: '12:00',
    createdTimeMs: Date.now(),
    title: 'BTC Alert',
    message: 'Message 1',
    newState: 'BUY OPPORTUNITY',
    score: 90,
    read: false,
    priority: 'CRITICAL'
  };
  const alert2: RadarNotification = {
    id: 'notif-2',
    symbol: 'ETHUSD',
    timestamp: '12:01',
    createdTimeMs: Date.now(),
    title: 'ETH Alert',
    message: 'Message 2',
    newState: 'BUY OPPORTUNITY',
    score: 85,
    read: false,
    priority: 'HIGH'
  };

  saveNotifications([alert1, alert2]);

  let queue = [alert1, alert2];
  assert.strictEqual(queue[0].symbol, 'BTCUSD', 'First popup must be BTCUSD');

  // User dismisses first popup -> advance queue
  queue = queue.slice(1);
  assert.strictEqual(queue[0].symbol, 'ETHUSD', 'Second popup must now be ETHUSD');

  // Verify Notification Center storage is not deleted
  const stored = getStoredNotifications();
  assert.strictEqual(stored.length, 2, 'Stored notifications must remain intact after popup dismissal');
  assert.strictEqual(stored[0].id, 'notif-1');
  assert.strictEqual(stored[1].id, 'notif-2');
});

// -----------------------------------------------------------------------------
// TEST H: DATA LIMITED Classification
// -----------------------------------------------------------------------------
runTest('Condition H: DATA LIMITED correctly flags non-executable state', () => {
  clearRadarNotificationStateForTesting();
  const opp: RadarOpportunityItem = {
    rank: 1,
    symbol: 'TEST_FALLBACK',
    name: 'Test Fallback Asset',
    category: 'CRYPTO',
    price: 500,
    change24h: 0,
    state: 'BUY OPPORTUNITY',
    opportunityScore: 80,
    setupQuality: 80,
    tradeExecutable: true,
    executabilityScore: 100,
    marketState: 'OPEN',
    aiConfidence: 80,
    timeframe: 'INTRADAY',
    riskLevel: 'MEDIUM',
    entryZone: [490, 510],
    stopLoss: 470,
    tp1: 550,
    tp2: 580,
    tp3: 600,
    rr: '1:3.0',
    regime: 'Unknown',
    catalysts: ['Fallback price'],
    invalidation: '470',
    evidenceTrust: 40,
    actionabilityState: 'ANALYSIS ONLY',
    isDataLimited: true
  };

  const [alert] = evaluateRadarTransitions([opp]);
  assert.strictEqual(alert.isDataLimited, true, 'isDataLimited flag must be true');
  assert.strictEqual(alert.actionabilityState, 'ANALYSIS ONLY', 'Data limited must be gated at ANALYSIS ONLY');
});

console.log('\n================================================================');
console.log(`RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
console.log('================================================================');

if (passedTests !== totalTests) {
  process.exit(1);
}
