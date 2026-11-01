/**
 * FEF CORTEX — SYSTEM INFRASTRUCTURE MONITOR TEST SUITE
 * 
 * Verifies Phase 5 System Infrastructure Monitor:
 * 1. Honest component status handling across all 7 local components + cloud store
 * 2. Stale heartbeat detection (fresh < 15s, degraded 15-60s, disconnected > 60s)
 * 3. Never asserts CONNECTED on process existence alone
 * 4. External Redis store reported as DEGRADED with SQLite fallback active
 * 5. Data sanitization: zero leaked tokens, secrets, full logins, or internal paths
 * 6. Agent data readiness explanations without synthetic fabrication
 * 7. Strict trading safety: READ_ONLY and MT5_ORDER_TRANSPORT_ENABLED=false
 */

const assert = require('assert');

// 1. Test Aggregator Module Logic
async function runTests() {
  console.log('=================================================================');
  console.log('FEF CORTEX — SYSTEM INFRASTRUCTURE MONITOR TEST SUITE');
  console.log('=================================================================\n');

  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`  ✓ Test ${total}: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✕ Test ${total}: ${name}`);
      console.error(`    Error: ${err.message}`);
    }
  }

  async function testAsync(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✓ Test ${total}: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✕ Test ${total}: ${name}`);
      console.error(`    Error: ${err.message}`);
    }
  }

  // Load implementation module
  let infrastructureAggregator;
  try {
    infrastructureAggregator = require('../src/lib/infrastructure/infrastructure-aggregator');
  } catch (e) {
    console.log('  [RED PHASE] infrastructure-aggregator module not yet implemented or imported:', e.message);
  }

  test('Module export structure', () => {
    assert(infrastructureAggregator, 'infrastructure-aggregator must be loaded');
    assert.strictEqual(typeof infrastructureAggregator.aggregateInfrastructureHealth, 'function');
    assert.strictEqual(typeof infrastructureAggregator.evaluateHeartbeatStatus, 'function');
    assert.strictEqual(typeof infrastructureAggregator.getAgentReadinessExplanation, 'function');
  });

  test('Heartbeat evaluation handles freshness thresholds honestly', () => {
    const { evaluateHeartbeatStatus } = infrastructureAggregator;
    
    // Fresh: < 15,000ms
    assert.strictEqual(evaluateHeartbeatStatus(2000, true), 'CONNECTED');
    assert.strictEqual(evaluateHeartbeatStatus(14000, true), 'CONNECTED');

    // Degraded: 15,000ms - 60,000ms
    assert.strictEqual(evaluateHeartbeatStatus(15500, true), 'DEGRADED');
    assert.strictEqual(evaluateHeartbeatStatus(45000, true), 'DEGRADED');

    // Disconnected: > 60,000ms
    assert.strictEqual(evaluateHeartbeatStatus(65000, true), 'DISCONNECTED');
    assert.strictEqual(evaluateHeartbeatStatus(null, true), 'DISCONNECTED');

    // Explicitly unlinked
    assert.strictEqual(evaluateHeartbeatStatus(2000, false), 'DISCONNECTED');
  });

  test('Component state model rejects fake CONNECTED based on process existence alone', () => {
    const { normalizeComponentHealth } = infrastructureAggregator;
    
    // Process running but zero responses / dead port -> DISCONNECTED
    const deadProcessState = normalizeComponentHealth({
      processAlive: true,
      responding: false,
      lastHeartbeatAgeMs: null,
    });
    assert.strictEqual(deadProcessState.status, 'DISCONNECTED');
    assert.strictEqual(deadProcessState.isProcessOnly, true);
  });

  test('External Cloud Redis store correctly categorized as DEGRADED with SQLite fallback identified', () => {
    const { evaluateCloudStoreStatus } = infrastructureAggregator;

    const cloudStatus = evaluateCloudStoreStatus({
      quotaExceeded: true,
      httpStatus: 503,
      localSqliteOnline: true,
    });

    assert.strictEqual(cloudStatus.status, 'DEGRADED');
    assert.strictEqual(cloudStatus.fallbackActive, true);
    assert(cloudStatus.detail.includes('Local SQLite fallback'), 'Must mention local SQLite fallback');
  });

  test('Sanitization masks full logins, tokens, secrets and file paths', () => {
    const { sanitizeInfrastructurePayload } = infrastructureAggregator;

    const dirtyPayload = {
      token: 'secret-token-xyz-123',
      bridgeToken: 'fef-bridge-key',
      accountLogin: '472945523',
      dbPath: '/Users/mac/.fef/data/fef-cortex.db',
      nested: {
        apiKey: 'sk-12345678',
        homeDir: '/Users/mac/projects',
        cleanNumber: 18031,
      }
    };

    const sanitized = sanitizeInfrastructurePayload(dirtyPayload);
    assert.strictEqual(sanitized.token, undefined);
    assert.strictEqual(sanitized.bridgeToken, undefined);
    assert.strictEqual(sanitized.accountLogin, '47***23');
    assert.strictEqual(sanitized.dbPath, undefined);
    assert.strictEqual(sanitized.nested.apiKey, undefined);
    assert.strictEqual(sanitized.nested.homeDir, '[REDACTED_LOCAL_PATH]');
    assert.strictEqual(sanitized.nested.cleanNumber, 18031);
  });

  test('Agent readiness explanations accurately document missing external feeds', () => {
    const { getAgentReadinessExplanation } = infrastructureAggregator;

    // COT Specialist
    const cotExp = getAgentReadinessExplanation('cot_positioning', 'DATA LIMITED');
    assert(cotExp.requiredFeed.includes('CFTC'), 'COT must reference CFTC');
    assert.strictEqual(cotExp.isExpected, true);

    // Order Flow Delta / DOM Specialist
    const ofExp = getAgentReadinessExplanation('order_flow_delta', 'DATA LIMITED');
    assert(ofExp.requiredFeed.includes('Level 2'), 'Order flow must reference Level 2 / DOM');
    assert.strictEqual(ofExp.isExpected, true);

    // Central Bank Specialist
    const cbExp = getAgentReadinessExplanation('central_bank_policy', 'DATA LIMITED');
    assert(cbExp.requiredFeed.includes('Economic') || cbExp.requiredFeed.includes('Central Bank'), 'Central bank must reference external feed');
    assert.strictEqual(cbExp.isExpected, true);

    // Technical / Market Structure on XAUUSD
    const techExp = getAgentReadinessExplanation('market_structure', 'ONLINE');
    assert.strictEqual(techExp.isExpected, false);
    assert.strictEqual(techExp.status, 'READY');
  });

  await testAsync('Live ecosystem aggregation reflects actual 7 components', async () => {
    const { aggregateInfrastructureHealth } = infrastructureAggregator;

    const report = await aggregateInfrastructureHealth();
    assert(report, 'Report must be returned');
    assert.strictEqual(typeof report.healthyCount, 'number');
    assert.strictEqual(typeof report.totalCount, 'number');
    assert(report.totalCount >= 7, 'Must monitor at least 7 components');
    assert(['HEALTHY', 'DEGRADED', 'CRITICAL'].includes(report.overallCondition));

    // Check all 7 components are present
    const compIds = report.components.map(c => c.id);
    assert(compIds.includes('antigravity_hub'), 'Must include Antigravity Hub');
    assert(compIds.includes('mt5_terminal'), 'Must include MT5 Terminal');
    assert(compIds.includes('http_bridge'), 'Must include HTTP Bridge');
    assert(compIds.includes('supervisor'), 'Must include Supervisor');
    assert(compIds.includes('connector_agent'), 'Must include Connector Agent');
    assert(compIds.includes('sqlite_db'), 'Must include SQLite DB');
    assert(compIds.includes('cortex_app'), 'Must include CORTEX App');

    // Strict safety invariant check in health report
    assert.strictEqual(report.tradingSafety.operatingMode, 'READ_ONLY');
    assert.strictEqual(report.tradingSafety.orderTransportAllowed, false);
  });

  console.log(`\n=================================================================`);
  console.log(`TESTS SUMMARY: ${passed}/${total} PASSED`);
  console.log(`=================================================================`);

  if (passed < total) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});

