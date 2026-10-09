import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { MARKET_REGISTRY } from '../src/lib/registry/market-registry';

console.log('--- Testing /how-to-use Page Specification & Invariants ---');

const pagePath = path.join(__dirname, '../src/app/how-to-use/page.tsx');

// 1. File existence
assert.ok(fs.existsSync(pagePath), 'src/app/how-to-use/page.tsx must exist');

const content = fs.readFileSync(pagePath, 'utf8');

// 2. Section anchors verification
const REQUIRED_ANCHORS = [
  'what-you-need',
  'get-ea',
  'install-ea',
  'connect-mt5',
  'account-modes',
  'cloud-architecture',
  'cockpit-walkthrough',
  'opportunity-radar',
  'ai-decision',
  'agents',
  'market-session',
  'risk-calculator',
  'tradingview',
  'tradingview-workspace',
  'chart-analyzer',
  'execution',
  'journal',
  'how-cortex-thinks',
  'supported-markets',
  'daily-workflow',
  'best-practices',
];

for (const anchor of REQUIRED_ANCHORS) {
  assert.ok(
    content.includes(`id="${anchor}"`) || content.includes(`id={'${anchor}'}`),
    `Missing required anchor id="${anchor}" in how-to-use page`
  );
}

// 3. Prohibited terms / leak check
const FORBIDDEN_LEAKS = [
  '/Users/mac/',
  'fef_local_bridge_token',
  'fef-connector-primary',
  'localhost',
  '127.0.0.1',
  '5560',
  'download="FEF_HTTP_Bridge',
  'href="/downloads/',
  'guaranteed profit',
  '99% win rate',
  '24/7 support',
  '24/7 institutional',
  'FEF_HTTP_Bridge_V2.ex5',
];

for (const leak of FORBIDDEN_LEAKS) {
  assert.ok(
    !content.includes(leak),
    `Security/Truthfulness violation: how-to-use page contains prohibited string "${leak}"`
  );
}

// 4. Registry integration check
assert.ok(
  content.includes('MARKET_REGISTRY') || content.includes('market-registry'),
  'how-to-use must integrate with canonical MARKET_REGISTRY for supported markets'
);

// 5. 32 Agents mentioned
assert.ok(
  content.includes('32') && (content.includes('15') || content.includes('17')),
  'Must accurately describe the 32-agent architecture (15 Core Council + 17 Institutional Specialists)'
);

// 6. 12 Steps in daily workflow
for (let step = 1; step <= 12; step++) {
  assert.ok(
    content.includes(`STEP ${step}`) || content.includes(`Step ${step}`),
    `Must include Step ${step} in daily workflow`
  );
}

// 7. Cloud architecture & TradingView workspace sections
assert.ok(
  content.includes('Official FEF CORTEX EA'),
  'Must refer to the EA as Official FEF CORTEX EA instead of raw binary filename'
);

assert.ok(
  content.includes('cloud-architecture') && content.includes('Secure Cloud'),
  'Must contain Secure Cloud & Community Architecture section'
);

assert.ok(
  content.includes('tradingview-workspace') && (content.includes('11-Step') || content.includes('11-step') || content.includes('11 Steps')),
  'Must contain TradingView Workspace section with 11-step manual execution workflow'
);

console.log('✅ Task 3 Test Passed: /how-to-use content and invariants verified.');

