import assert from 'assert';
import fs from 'fs';
import path from 'path';

console.log('--- Testing TradingView Workspace Integrity & Separation ---');

const tvPagePath = path.join(__dirname, '../src/app/tradingview/page.tsx');
const dockPath = path.join(__dirname, '../src/components/tradingview/QuickScalpDock.tsx');
const cockpitPath = path.join(__dirname, '../src/app/cockpit/page.tsx');
const bridgeRoutePath = path.join(__dirname, '../src/app/api/bridge/mt5/route.ts');

// 1. TradingView Workspace Route Exists
assert.ok(fs.existsSync(tvPagePath), 'src/app/tradingview/page.tsx must exist');
const tvContent = fs.readFileSync(tvPagePath, 'utf8');

assert.ok(
  tvContent.includes('TradingViewChartWidget'),
  'TradingView page must integrate TradingViewChartWidget'
);
assert.ok(
  tvContent.includes('QuickScalpDock'),
  'TradingView page must integrate QuickScalpDock'
);
assert.ok(
  tvContent.includes('MasterTopNav'),
  'TradingView page must preserve MasterTopNav'
);
assert.ok(
  tvContent.includes('QUICK_SYMBOLS') && tvContent.includes('TIMEFRAMES'),
  'TradingView page must provide symbol quick-select and timeframe selectors'
);

// 2. QuickScalpDock manual execution integrity
assert.ok(fs.existsSync(dockPath), 'src/components/tradingview/QuickScalpDock.tsx must exist');
const dockContent = fs.readFileSync(dockPath, 'utf8');

assert.ok(
  dockContent.includes('BUY') && dockContent.includes('SELL'),
  'QuickScalpDock must provide manual BUY and SELL order actions'
);
assert.ok(
  dockContent.includes('reanchorProtectionLevels'),
  'QuickScalpDock must utilize dynamic pip re-anchoring protection'
);
assert.ok(
  dockContent.includes('/api/bridge/mt5'),
  'QuickScalpDock must wire to official /api/bridge/mt5 endpoint'
);

// 3. Cockpit Separation (Cockpit must not embed TradingViewChartWidget directly)
assert.ok(fs.existsSync(cockpitPath), 'src/app/cockpit/page.tsx must exist');
const cockpitContent = fs.readFileSync(cockpitPath, 'utf8');

assert.ok(
  !cockpitContent.includes('TradingViewChartWidget'),
  'Cockpit must not embed TradingViewChartWidget directly (TradingView belongs in dedicated /tradingview workspace)'
);

// 4. Verify Bridge API preserves hard-locked safety
if (fs.existsSync(bridgeRoutePath)) {
  const bridgeContent = fs.readFileSync(bridgeRoutePath, 'utf8');
  assert.ok(
    bridgeContent.includes('realExecutionLocked') || bridgeContent.includes('DEMO') || bridgeContent.includes('BLOCK'),
    'Bridge API must enforce execution safety gating'
  );
}

console.log('✅ Task 5 Test Passed: TradingView workspace integrity, manual controls, and cockpit separation verified.');

