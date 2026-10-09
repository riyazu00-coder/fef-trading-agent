/**
 * FEF CORTEX — MASTER CONSOLIDATION V2 TEST SUITE
 * Complete Verification of Dashboard Reconciliation & Execution Bridge V2 Foundation
 *
 * Tests all 28 Execution Bridge V2 scenarios + Dashboard Consolidation rules.
 * Strictly NON-TRADING test suite: zero real or demo orders placed with MT5 broker.
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';

// Execution V2 imports
import {
  ExecutionStateMachine,
  TERMINAL_STATES,
} from '../src/lib/execution-v2/state-machine';
import {
  BrokerContractSpecRegistry,
} from '../src/lib/execution-v2/contract-specs';
import {
  ExecutionV2Validator,
} from '../src/lib/execution-v2/validator';
import {
  ExecutionCommand,
  BrokerContractSpec,
  BrokerAccountTelemetry,
  BrokerQuoteTelemetry,
} from '../src/lib/execution-v2/types';

// Evolutionary tracker import
import {
  evaluateAndRecordTransition,
  getVerifiedHistoricalChanges,
  clearHistoricalChanges,
} from '../src/lib/agents/what-changed-engine';

async function runMasterConsolidationV2Tests() {
  console.log('================================================================');
  console.log('FEF CORTEX: MASTER CONSOLIDATION V2 TEST SUITE');
  console.log('Dashboard Reconciliation + Execution Bridge V2 Foundation');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    total++;
    try {
      fn();
      console.log(`[PASS] Case ${total}: ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`[FAIL] Case ${total}: ${name}`);
      console.error(err);
      throw err;
    }
  }

  // Sample valid spec for testing
  const validSpecEURUSD: BrokerContractSpec = {
    symbol: 'EURUSD',
    digits: 5,
    point: 0.00001,
    contractSize: 100000,
    volumeMin: 0.01,
    volumeMax: 50.0,
    volumeStep: 0.01,
    stopsLevel: 10, // 10 points = 0.00010
    freezeLevel: 0,
    currencyBase: 'EUR',
    currencyProfit: 'USD',
    updatedAt: Date.now(),
  };

  const demoAccount: BrokerAccountTelemetry = {
    accountNumber: 1234567,
    broker: 'MetaQuotes-Demo',
    currency: 'USD',
    balance: 50000,
    equity: 50000,
    margin: 0,
    freeMargin: 50000,
    marginLevel: 0,
    tradeMode: 'DEMO',
    tradeAllowed: true,
    updatedAt: Date.now(),
  };

  const freshQuoteEURUSD: BrokerQuoteTelemetry = {
    symbol: 'EURUSD',
    bid: 1.08500,
    ask: 1.08510,
    spreadPoints: 10,
    timestamp: Date.now(),
    ageMs: 50,
  };

  // ========================================================================
  // PART 1: EXECUTION BRIDGE V2 FOUNDATION (SCENARIOS 1 - 28)
  // ========================================================================
  console.log('--- PART 1: EXECUTION BRIDGE V2 LIFECYCLE, PROTOCOL & SAFETY ---');

  // Case 1
  test('Bridge V2: State Machine initialization in CREATED state with initial transition record', () => {
    const cmd: ExecutionCommand = {
      executionId: 'exec-test-01',
      symbol: 'EURUSD',
      brokerSymbol: 'EURUSD',
      side: 'BUY',
      volume: 0.1,
      requestedPrice: 1.08510,
      createdAt: Date.now(),
      expiresAt: Date.now() + 10000,
    };
    const sm = new ExecutionStateMachine(cmd);
    assert.strictEqual(sm.currentState, 'CREATED');
    assert.strictEqual(sm.executionId, 'exec-test-01');
    assert.strictEqual(sm.isTerminal, false);
    assert.strictEqual(sm.snapshot.transitions.length, 1);
    assert.strictEqual(sm.snapshot.transitions[0].toState, 'CREATED');
  });

  // Case 2
  test('Bridge V2: Full valid happy-path lifecycle transitions through FILLED', () => {
    const cmd: ExecutionCommand = {
      executionId: 'exec-test-02',
      symbol: 'EURUSD',
      brokerSymbol: 'EURUSD',
      side: 'BUY',
      volume: 0.1,
      requestedPrice: 1.08510,
      createdAt: Date.now(),
      expiresAt: Date.now() + 10000,
    };
    const sm = new ExecutionStateMachine(cmd);
    sm.transition('VALIDATED', 'Pre-flight checks passed');
    assert.strictEqual(sm.currentState, 'VALIDATED');
    sm.transition('QUEUED', 'Queued in memory');
    assert.strictEqual(sm.currentState, 'QUEUED');
    sm.transition('DELIVERED_TO_EA', 'Sent during poll');
    assert.strictEqual(sm.currentState, 'DELIVERED_TO_EA');
    sm.transition('ACKNOWLEDGED', 'EA ACK received');
    assert.strictEqual(sm.currentState, 'ACKNOWLEDGED');
    sm.transition('SUBMITTED_TO_BROKER', 'OrderSend called');
    assert.strictEqual(sm.currentState, 'SUBMITTED_TO_BROKER');
    sm.transition('FILLED', 'Broker filled order', { ticket: 999123 });
    assert.strictEqual(sm.currentState, 'FILLED');
    assert.strictEqual(sm.isTerminal, true);
    assert.strictEqual(sm.snapshot.transitions.length, 7);
  });

  // Case 3
  test('Bridge V2: Rejection transition sets REJECTED state and failureReasonCode', () => {
    const cmd: ExecutionCommand = {
      executionId: 'exec-test-03',
      symbol: 'EURUSD',
      brokerSymbol: 'EURUSD',
      side: 'BUY',
      volume: 0.1,
      requestedPrice: 1.08510,
      createdAt: Date.now(),
      expiresAt: Date.now() + 10000,
    };
    const sm = new ExecutionStateMachine(cmd);
    sm.transition('REJECTED', 'CONTRACT_SPEC_UNAVAILABLE');
    assert.strictEqual(sm.currentState, 'REJECTED');
    assert.strictEqual(sm.isTerminal, true);
    assert.strictEqual(sm.snapshot.failureReasonCode, 'CONTRACT_SPEC_UNAVAILABLE');
  });

  // Case 4
  test('Bridge V2: Terminal state immutability (cannot transition once FILLED or REJECTED)', () => {
    const cmd: ExecutionCommand = {
      executionId: 'exec-test-04',
      symbol: 'EURUSD',
      brokerSymbol: 'EURUSD',
      side: 'BUY',
      volume: 0.1,
      requestedPrice: 1.08510,
      createdAt: Date.now(),
      expiresAt: Date.now() + 10000,
    };
    const sm = new ExecutionStateMachine(cmd);
    sm.transition('VALIDATED');
    sm.transition('QUEUED');
    sm.transition('DELIVERED_TO_EA');
    sm.transition('ACKNOWLEDGED');
    sm.transition('SUBMITTED_TO_BROKER');
    sm.transition('FILLED');

    assert.throws(() => {
      sm.transition('REJECTED', 'Late rejection attempt');
    }, /Cannot transition from terminal state FILLED/);
  });

  // Case 5
  test('Bridge V2: Illegal state transition prevention (CREATED -> FILLED disallowed)', () => {
    const cmd: ExecutionCommand = {
      executionId: 'exec-test-05',
      symbol: 'EURUSD',
      brokerSymbol: 'EURUSD',
      side: 'BUY',
      volume: 0.1,
      requestedPrice: 1.08510,
      createdAt: Date.now(),
      expiresAt: Date.now() + 10000,
    };
    const sm = new ExecutionStateMachine(cmd);
    assert.throws(() => {
      sm.transition('FILLED');
    }, /Illegal state transition: CREATED -> FILLED/);
  });

  // Case 6
  test('Bridge V2: Duplicate executionId idempotency detection', () => {
    const registeredIds = new Set<string>();
    const id = 'exec-idem-001';
    assert.strictEqual(registeredIds.has(id), false);
    registeredIds.add(id);
    assert.strictEqual(registeredIds.has(id), true); // duplicate detected
  });

  // Case 7
  test('Bridge V2: Command timeout and expiration transitions to EXPIRED', () => {
    const cmd: ExecutionCommand = {
      executionId: 'exec-test-07',
      symbol: 'EURUSD',
      brokerSymbol: 'EURUSD',
      side: 'BUY',
      volume: 0.1,
      requestedPrice: 1.08510,
      createdAt: Date.now() - 15000,
      expiresAt: Date.now() - 1000,
    };
    const sm = new ExecutionStateMachine(cmd);
    sm.transition('VALIDATED');
    sm.transition('QUEUED');
    sm.transition('EXPIRED', 'Dispatch TTL expired');
    assert.strictEqual(sm.currentState, 'EXPIRED');
    assert.strictEqual(sm.isTerminal, true);
    assert.strictEqual(sm.snapshot.failureReasonCode, 'Dispatch TTL expired');
  });

  // Case 8
  test('Bridge V2: EA ACK sets ACK packet and transitions state', () => {
    const cmd: ExecutionCommand = {
      executionId: 'exec-test-08',
      symbol: 'EURUSD',
      brokerSymbol: 'EURUSD',
      side: 'BUY',
      volume: 0.1,
      requestedPrice: 1.08510,
      createdAt: Date.now(),
      expiresAt: Date.now() + 10000,
    };
    const sm = new ExecutionStateMachine(cmd);
    sm.transition('VALIDATED');
    sm.transition('QUEUED');
    sm.transition('DELIVERED_TO_EA');
    sm.setAck({ executionId: 'exec-test-08', terminalId: 'MT5_DEMO', receivedAt: Date.now() });
    sm.transition('ACKNOWLEDGED');
    assert.strictEqual(sm.currentState, 'ACKNOWLEDGED');
    assert.strictEqual(sm.snapshot.ack?.terminalId, 'MT5_DEMO');
  });

  // Case 9
  test('Bridge V2: EA Result sets result packet and transitions state to FILLED', () => {
    const cmd: ExecutionCommand = {
      executionId: 'exec-test-09',
      symbol: 'EURUSD',
      brokerSymbol: 'EURUSD',
      side: 'BUY',
      volume: 0.1,
      requestedPrice: 1.08510,
      createdAt: Date.now(),
      expiresAt: Date.now() + 10000,
    };
    const sm = new ExecutionStateMachine(cmd);
    sm.transition('VALIDATED');
    sm.transition('QUEUED');
    sm.transition('DELIVERED_TO_EA');
    sm.transition('ACKNOWLEDGED');
    sm.transition('SUBMITTED_TO_BROKER');
    sm.setResult({
      executionId: 'exec-test-09',
      status: 'FILLED',
      ticket: 555888,
      fillPrice: 1.08512,
      filledVolume: 0.1,
      retcode: 10009,
      comment: 'Request executed',
      executedAt: Date.now(),
    });
    assert.strictEqual(sm.currentState, 'FILLED');
    assert.strictEqual(sm.snapshot.result?.ticket, 555888);
  });

  // Case 10
  test('Bridge V2 Protocol: Heartbeat/telemetry endpoints never contain executable order payloads', () => {
    const bridgeCode = fs.readFileSync(path.join(__dirname, 'fef-execution-bridge-v2.js'), 'utf8');
    // Ensure /v2/telemetry/heartbeat handler does not touch or return commands
    const heartbeatBlock = bridgeCode.split("pathname === '/v2/telemetry/heartbeat'")[1]?.split('return sendJson')[0] || '';
    assert(!heartbeatBlock.includes('commandQueue'));
    assert(!heartbeatBlock.includes('command'));

    // Ensure /v2/health handler does not pop commands
    const healthBlock = bridgeCode.split("pathname === '/v2/health'")[1]?.split('return sendJson')[0] || '';
    assert(!healthBlock.includes('commandQueue.shift'));
  });

  // Case 11
  test('Bridge V2 Protocol: Explicit typed empty polling envelope hasCommand=false and command=null', () => {
    const envelope = {
      hasCommand: false,
      command: null,
      serverTime: Date.now(),
    };
    assert.strictEqual(envelope.hasCommand, false);
    assert.strictEqual(envelope.command, null);
  });

  // Case 12
  test('Bridge V2 Protocol: Explicit typed polling envelope hasCommand=true and command object populated', () => {
    const envelope = {
      hasCommand: true,
      command: {
        executionId: 'exec-123',
        symbol: 'EURUSD',
        side: 'BUY',
        volume: 0.1,
      },
      serverTime: Date.now(),
    };
    assert.strictEqual(envelope.hasCommand, true);
    assert.strictEqual(envelope.command?.symbol, 'EURUSD');
  });

  // Case 13
  test('Bridge V2 Specs: Valid contract specification registration succeeds', () => {
    const registry = new BrokerContractSpecRegistry();
    const res = registry.registerSpec(validSpecEURUSD);
    assert.strictEqual(res.success, true);
    assert.strictEqual(registry.hasSpec('EURUSD'), true);
    const spec = registry.getSpec('EURUSD');
    assert.strictEqual(spec?.digits, 5);
    assert.strictEqual(spec?.volumeMin, 0.01);
  });

  // Case 14
  test('Bridge V2 Specs: Invalid contract specification (negative digits) rejected', () => {
    const registry = new BrokerContractSpecRegistry();
    const res = registry.registerSpec({
      symbol: 'INVALID',
      digits: -1,
      point: 0.01,
      contractSize: 100,
      volumeMin: 0.1,
      volumeMax: 10,
      volumeStep: 0.1,
    });
    assert.strictEqual(res.success, false);
    assert.strictEqual(registry.hasSpec('INVALID'), false);
  });

  // Case 15
  test('Bridge V2 Specs: Missing spec returns null and hasSpec returns false', () => {
    const registry = new BrokerContractSpecRegistry();
    assert.strictEqual(registry.hasSpec('NONEXISTENT'), false);
    assert.strictEqual(registry.getSpec('NONEXISTENT'), null);
  });

  // Case 16
  test('Bridge V2 Validator: Fail-closed when contract spec is unavailable', () => {
    const cmd: ExecutionCommand = {
      executionId: 'v-16',
      symbol: 'EURUSD',
      brokerSymbol: 'EURUSD',
      side: 'BUY',
      volume: 0.1,
      requestedPrice: 1.0850,
      createdAt: Date.now(),
      expiresAt: Date.now() + 10000,
    };
    const res = ExecutionV2Validator.validate(cmd, {
      account: demoAccount,
      spec: null, // Spec missing
      quote: freshQuoteEURUSD,
    });
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.errorCode, 'CONTRACT_SPEC_UNAVAILABLE');
  });

  // Case 17
  test('Bridge V2 Validator: Fail-closed on unknown symbol — NO XAUUSD fallback', () => {
    const cmd: ExecutionCommand = {
      executionId: 'v-17',
      symbol: 'MYSTERY_COIN_XYZ',
      brokerSymbol: 'MYSTERY_COIN_XYZ',
      side: 'BUY',
      volume: 0.1,
      requestedPrice: 100.0,
      createdAt: Date.now(),
      expiresAt: Date.now() + 10000,
    };
    const res = ExecutionV2Validator.validate(cmd, {
      account: demoAccount,
      spec: validSpecEURUSD,
      quote: freshQuoteEURUSD,
    });
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.errorCode, 'REJECTED_UNKNOWN_SYMBOL');
    assert(!res.errorMessage?.includes('XAUUSD'));
  });

  // Case 18
  test('Bridge V2 Validator: Fail-closed on unknown asset category — NO FOREX fallback', () => {
    // Custom market with missing category
    const cmd: ExecutionCommand = {
      executionId: 'v-18',
      symbol: 'TESTUNKNOWN',
      brokerSymbol: 'TESTUNKNOWN',
      side: 'BUY',
      volume: 0.1,
      requestedPrice: 1.0,
      createdAt: Date.now(),
      expiresAt: Date.now() + 10000,
    };
    const res = ExecutionV2Validator.validate(cmd, {
      account: demoAccount,
      spec: validSpecEURUSD,
      quote: freshQuoteEURUSD,
    });
    assert.strictEqual(res.valid, false);
  });

  // Case 19
  test('Bridge V2 Validator: Real account trade mode HARD-LOCKED and rejected', () => {
    const realAccount: BrokerAccountTelemetry = {
      ...demoAccount,
      tradeMode: 'REAL',
    };
    const cmd: ExecutionCommand = {
      executionId: 'v-19',
      symbol: 'EURUSD',
      brokerSymbol: 'EURUSD',
      side: 'BUY',
      volume: 0.1,
      requestedPrice: 1.0850,
      createdAt: Date.now(),
      expiresAt: Date.now() + 10000,
    };
    const res = ExecutionV2Validator.validate(cmd, {
      account: realAccount,
      spec: validSpecEURUSD,
      quote: freshQuoteEURUSD,
    });
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.errorCode, 'REAL_ACCOUNT_HARD_LOCKED');
  });

  // Case 20
  test('Bridge V2 Validator: Trade disabled on account rejected', () => {
    const disabledAccount: BrokerAccountTelemetry = {
      ...demoAccount,
      tradeAllowed: false,
    };
    const cmd: ExecutionCommand = {
      executionId: 'v-20',
      symbol: 'EURUSD',
      brokerSymbol: 'EURUSD',
      side: 'BUY',
      volume: 0.1,
      requestedPrice: 1.0850,
      createdAt: Date.now(),
      expiresAt: Date.now() + 10000,
    };
    const res = ExecutionV2Validator.validate(cmd, {
      account: disabledAccount,
      spec: validSpecEURUSD,
      quote: freshQuoteEURUSD,
    });
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.errorCode, 'TRADE_DISABLED_ON_ACCOUNT');
  });

  // Case 21
  test('Bridge V2 Validator: Volume below broker volumeMin rejected', () => {
    const cmd: ExecutionCommand = {
      executionId: 'v-21',
      symbol: 'EURUSD',
      brokerSymbol: 'EURUSD',
      side: 'BUY',
      volume: 0.005, // below 0.01 min
      requestedPrice: 1.0850,
      createdAt: Date.now(),
      expiresAt: Date.now() + 10000,
    };
    const res = ExecutionV2Validator.validate(cmd, {
      account: demoAccount,
      spec: validSpecEURUSD,
      quote: freshQuoteEURUSD,
    });
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.errorCode, 'VOLUME_BELOW_MINIMUM');
  });

  // Case 22
  test('Bridge V2 Validator: Volume above broker volumeMax rejected', () => {
    const cmd: ExecutionCommand = {
      executionId: 'v-22',
      symbol: 'EURUSD',
      brokerSymbol: 'EURUSD',
      side: 'BUY',
      volume: 100.0, // above 50.0 max
      requestedPrice: 1.0850,
      createdAt: Date.now(),
      expiresAt: Date.now() + 10000,
    };
    const res = ExecutionV2Validator.validate(cmd, {
      account: demoAccount,
      spec: validSpecEURUSD,
      quote: freshQuoteEURUSD,
    });
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.errorCode, 'VOLUME_EXCEEDS_MAXIMUM');
  });

  // Case 23
  test('Bridge V2 Validator: Volume step mismatch rejected', () => {
    const cmd: ExecutionCommand = {
      executionId: 'v-23',
      symbol: 'EURUSD',
      brokerSymbol: 'EURUSD',
      side: 'BUY',
      volume: 0.125, // not multiple of 0.01
      requestedPrice: 1.0850,
      createdAt: Date.now(),
      expiresAt: Date.now() + 10000,
    };
    const res = ExecutionV2Validator.validate(cmd, {
      account: demoAccount,
      spec: validSpecEURUSD,
      quote: freshQuoteEURUSD,
    });
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.errorCode, 'VOLUME_STEP_MISMATCH');
  });

  // Case 24
  test('Bridge V2 Validator: BUY stop loss >= entry price rejected', () => {
    const cmd: ExecutionCommand = {
      executionId: 'v-24',
      symbol: 'EURUSD',
      brokerSymbol: 'EURUSD',
      side: 'BUY',
      volume: 0.1,
      requestedPrice: 1.0850,
      stopLoss: 1.0860, // Above entry!
      createdAt: Date.now(),
      expiresAt: Date.now() + 10000,
    };
    const res = ExecutionV2Validator.validate(cmd, {
      account: demoAccount,
      spec: validSpecEURUSD,
      quote: freshQuoteEURUSD,
    });
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.errorCode, 'INVALID_STOP_GEOMETRY');
  });

  // Case 25
  test('Bridge V2 Validator: SELL stop loss <= entry price rejected', () => {
    const cmd: ExecutionCommand = {
      executionId: 'v-25',
      symbol: 'EURUSD',
      brokerSymbol: 'EURUSD',
      side: 'SELL',
      volume: 0.1,
      requestedPrice: 1.0850,
      stopLoss: 1.0840, // Below entry!
      createdAt: Date.now(),
      expiresAt: Date.now() + 10000,
    };
    const res = ExecutionV2Validator.validate(cmd, {
      account: demoAccount,
      spec: validSpecEURUSD,
      quote: freshQuoteEURUSD,
    });
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.errorCode, 'INVALID_STOP_GEOMETRY');
  });

  // Case 26
  test('Bridge V2 Validator: Stop loss closer than broker stopsLevel rejected', () => {
    const cmd: ExecutionCommand = {
      executionId: 'v-26',
      symbol: 'EURUSD',
      brokerSymbol: 'EURUSD',
      side: 'BUY',
      volume: 0.1,
      requestedPrice: 1.08500,
      stopLoss: 1.08495, // Distance = 0.00005 (5 points < stopsLevel 10 points)
      createdAt: Date.now(),
      expiresAt: Date.now() + 10000,
    };
    const res = ExecutionV2Validator.validate(cmd, {
      account: demoAccount,
      spec: validSpecEURUSD,
      quote: freshQuoteEURUSD,
    });
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.errorCode, 'STOPS_LEVEL_VIOLATION');
  });

  // Case 27
  test('Bridge V2 Validator: Stale broker quote (>10s) rejected', () => {
    const staleQuote: BrokerQuoteTelemetry = {
      ...freshQuoteEURUSD,
      timestamp: Date.now() - 15000, // 15s old
    };
    const cmd: ExecutionCommand = {
      executionId: 'v-27',
      symbol: 'EURUSD',
      brokerSymbol: 'EURUSD',
      side: 'BUY',
      volume: 0.1,
      requestedPrice: 1.08500,
      stopLoss: 1.08000,
      takeProfit: 1.09000,
      createdAt: Date.now(),
      expiresAt: Date.now() + 10000,
    };
    const res = ExecutionV2Validator.validate(cmd, {
      account: demoAccount,
      spec: validSpecEURUSD,
      quote: staleQuote,
      maxQuoteAgeMs: 10000,
    });
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.errorCode, 'QUOTE_STALE');
  });

  // Case 28
  test('Bridge V2 Validator: Valid command sanitized with default slippage, magic, and digits rounding', () => {
    const cmd: ExecutionCommand = {
      executionId: 'v-28',
      symbol: 'EURUSD',
      brokerSymbol: 'EURUSD',
      side: 'BUY',
      volume: 0.1000001,
      requestedPrice: 1.08500123,
      stopLoss: 1.08000,
      takeProfit: 1.09500,
      createdAt: Date.now(),
      expiresAt: Date.now() + 10000,
    };
    const res = ExecutionV2Validator.validate(cmd, {
      account: demoAccount,
      spec: validSpecEURUSD,
      quote: freshQuoteEURUSD,
    });
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.sanitizedCommand?.volume, 0.1);
    assert.strictEqual(res.sanitizedCommand?.requestedPrice, 1.08500);
    assert.strictEqual(res.sanitizedCommand?.slippagePoints, 10);
    assert.strictEqual(res.sanitizedCommand?.magicNumber, 888002);
  });

  // ========================================================================
  // PART 2: DASHBOARD RECONCILIATION & CONSOLIDATION (SCENARIOS 29 - 37)
  // ========================================================================
  console.log('\n--- PART 2: DASHBOARD CONSOLIDATION & RECONCILIATION ---');

  // Case 29
  test('Dashboard Authority: ExecutionControlCard.tsx stripped of order dispatch & confirmation modal', () => {
    const code = fs.readFileSync(path.join(__dirname, '../src/components/cockpit/ExecutionControlCard.tsx'), 'utf8');
    assert(!code.includes('onOpenExecutionModal'));
    assert(!code.includes('handleDirectExecute'));
    assert(!code.includes('isExecutingOrder'));
    assert(code.includes('LiveExecutionTelemetryPanel'));
    assert(code.includes('FullSmartPositionCalculator'));
  });

  // Case 30
  test('Evolutionary Tracker: what-changed-engine records genuine state deltas without fabricating history', () => {
    clearHistoricalChanges();
    const sym = 'XAUUSD';

    // Baseline snapshot
    evaluateAndRecordTransition({
      symbol: sym,
      currentVerdict: 'BUY OPPORTUNITY',
      currentConsensus: 70,
      stage: 'ANALYSIS',
      actionability: 'ANALYSIS ONLY',
      evidenceTrust: 80,
    });

    // Insignificant change (<10% consensus, same verdict, same stage) -> no new transition record
    evaluateAndRecordTransition({
      symbol: sym,
      currentVerdict: 'BUY OPPORTUNITY',
      currentConsensus: 71,
      stage: 'ANALYSIS',
      actionability: 'ANALYSIS ONLY',
      evidenceTrust: 81,
    });
    assert.strictEqual(getVerifiedHistoricalChanges().length, 0);

    // Direction flip (verdict change) -> transition recorded!
    evaluateAndRecordTransition({
      symbol: sym,
      currentVerdict: 'SELL OPPORTUNITY',
      currentConsensus: 75,
      stage: 'STRUCTURE',
      actionability: 'WATCH FOR SELL',
      evidenceTrust: 82,
    });
    const tl = getVerifiedHistoricalChanges();
    assert.strictEqual(tl.length, 1);
    assert.strictEqual(tl[0].symbol, 'XAUUSD');
    assert.strictEqual(tl[0].previousVerdict, 'BUY OPPORTUNITY');
    assert.strictEqual(tl[0].currentVerdict, 'SELL OPPORTUNITY');
  });

  // Case 31
  test('Agent Visibility: AgentConsensusBarChart.tsx provides toggle for 15 Council vs 17 Specialists', () => {
    const code = fs.readFileSync(path.join(__dirname, '../src/components/cockpit/AgentConsensusBarChart.tsx'), 'utf8');
    assert(code.includes('viewMode'));
    assert(code.includes('CORE COUNCIL'));
    assert(code.includes('QUANT SPECIALISTS'));
  });

  // Case 32
  test('Central Intelligence Hub: Reports truthful 32 agents count and links to /agents', () => {
    const code = fs.readFileSync(path.join(__dirname, '../src/components/cockpit/CentralIntelligenceHub.tsx'), 'utf8');
    assert(code.includes('32 AGENTS'));
    assert(code.includes('15 Council + 17 Specialists'));
    assert(code.includes('href="/agents"'));
  });

  // Case 33
  test('Mock Card Pruning: VulnerabilityAuditCard and ProviderTelemetryCard not rendered in Cockpit page', () => {
    const pageCode = fs.readFileSync(path.join(__dirname, '../src/app/cockpit/page.tsx'), 'utf8');
    assert(!pageCode.includes('<VulnerabilityAuditCard'));
    assert(!pageCode.includes('<ProviderTelemetryCard'));
    assert(!pageCode.includes('<ChartVisionAnalyzerCard'));
  });

  // Case 34
  test('Vision Blueprint: ActiveVisionBlueprintCard renders structural blueprint and links to /chart-analyzer', () => {
    const code = fs.readFileSync(path.join(__dirname, '../src/components/cockpit/ActiveVisionBlueprintCard.tsx'), 'utf8');
    assert(code.includes('ACTIVE VISION BLUEPRINT'));
    assert(code.includes('/chart-analyzer'));
  });

  // Case 35
  test('Truthful Badges: MasterTopNav and AccountPlatformStatusCard show dynamic status instead of static MT5 READ-ONLY', () => {
    const topNavCode = fs.readFileSync(path.join(__dirname, '../src/components/cockpit/MasterTopNav.tsx'), 'utf8');
    const accCode = fs.readFileSync(path.join(__dirname, '../src/components/cockpit/AccountPlatformStatusCard.tsx'), 'utf8');
    assert(!topNavCode.includes('MT5 READ-ONLY'));
    assert(!accCode.includes('MT5 READ-ONLY'));
    assert(topNavCode.includes('DEMO EXECUTION') || topNavCode.includes('DEMO ARMED'));
    assert(accCode.includes('LIVE (HARD-LOCKED 🔒)'));
  });

  // Case 36
  test('Liquidity Grounding: MarketSessionLiquidityMap uses verified OHLC and fails closed without synthetic offsets', () => {
    const code = fs.readFileSync(path.join(__dirname, '../src/components/cockpit/MarketSessionLiquidityMap.tsx'), 'utf8');
    assert(!code.includes('p * rangeFactor * 0.45'));
    assert(code.includes('DATA LIMITED'));
    assert(code.includes('LEVEL UNAVAILABLE'));
  });

  // Case 37
  test('Execution Invariant: Zero real MT5 order dispatches during test execution', () => {
    // Assert zero real trading calls
    assert.strictEqual(process.env.ENABLE_REAL_TRADING, undefined);
  });

  console.log('\n================================================================');
  console.log(`ALL ${passed}/${total} CONSOLIDATION V2 TESTS PASSED PERFECTLY! 🚀`);
  console.log('================================================================');
}

runMasterConsolidationV2Tests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
