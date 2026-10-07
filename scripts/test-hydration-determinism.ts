import React from 'react';
import { renderToString } from 'react-dom/server';
import { HubMiniFeed } from '../src/components/central-hub/HubMiniFeed';
import { getTruthfulLiveMessages, HubLiveMessage } from '../src/lib/agents/hub-animation-engine';
import { generateAssetIntelligence, AssetIntelligenceProfile } from '../src/lib/agents/multi-asset-pipeline';

console.log('====================================================');
console.log('FEF CORTEX: CLIENT HYDRATION DETERMINISM VERIFICATION');
console.log('====================================================');

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, msg: string) {
  totalTests++;
  if (condition) {
    console.log(`[PASS] ${msg}`);
    passedTests++;
  } else {
    console.error(`[FAIL] ${msg}`);
    process.exitCode = 1;
  }
}

// 1. Test HubMiniFeed Determinism across Server T1 (13:21:27) vs Client T2 (13:21:29)
console.log('\n--- Test 1: HubMiniFeed Initial Render Determinism ---');
const messagesT1: HubLiveMessage[] = [
  {
    id: 'XAUUSD-msg-0',
    timestamp: '13:21:27',
    agentName: 'TECHNICAL',
    agentType: 'TECHNICAL',
    recipient: 'AI Orchestrator',
    message: 'Market structure analyzed.',
    status: 'BULLISH',
    packetColor: '#00f0ff',
  },
  {
    id: 'XAUUSD-msg-1',
    timestamp: '13:21:27',
    agentName: 'MACRO',
    agentType: 'MACRO',
    recipient: 'AI Orchestrator',
    message: 'Macro bias neutral.',
    status: 'NEUTRAL',
    packetColor: '#3b82f6',
  },
];

const messagesT2: HubLiveMessage[] = [
  {
    id: 'XAUUSD-msg-0',
    timestamp: '13:21:29',
    agentName: 'TECHNICAL',
    agentType: 'TECHNICAL',
    recipient: 'AI Orchestrator',
    message: 'Market structure analyzed.',
    status: 'BULLISH',
    packetColor: '#00f0ff',
  },
  {
    id: 'XAUUSD-msg-1',
    timestamp: '13:21:29',
    agentName: 'MACRO',
    agentType: 'MACRO',
    recipient: 'AI Orchestrator',
    message: 'Macro bias neutral.',
    status: 'NEUTRAL',
    packetColor: '#3b82f6',
  },
];

const serverHtmlFeed = renderToString(
  React.createElement(HubMiniFeed, { messages: messagesT1, activeSymbol: 'XAUUSD' })
);
const clientInitialHtmlFeed = renderToString(
  React.createElement(HubMiniFeed, { messages: messagesT2, activeSymbol: 'XAUUSD' })
);

assert(
  !serverHtmlFeed.includes('13:21:27'),
  'Server HTML does not leak volatile 13:21:27 before mount'
);
assert(
  !clientInitialHtmlFeed.includes('13:21:29'),
  'Client initial render does not leak volatile 13:21:29 before mount'
);
assert(
  serverHtmlFeed.includes('--:--:--'),
  'Server HTML renders deterministic placeholder --:--:--'
);
assert(
  clientInitialHtmlFeed.includes('--:--:--'),
  'Client initial render renders deterministic placeholder --:--:--'
);
assert(
  serverHtmlFeed === clientInitialHtmlFeed,
  'Server HTML and Client Initial HTML match 100% identically'
);

// 2. Test getTruthfulLiveMessages ID Determinism
console.log('\n--- Test 2: getTruthfulLiveMessages ID Stability ---');
const date1 = new Date('2026-03-30T13:21:27.000Z');
const date2 = new Date('2026-03-30T13:21:29.000Z');

const profile1 = generateAssetIntelligence(
  'XAUUSD',
  { symbol: 'XAUUSD', price: 2350.5, change24h: 0.5, spread: 1.2, high24h: 2360, low24h: 2340, volume: '1B', sparkline: '', source: 'Broker', lastUpdated: 'Live', category: 'METALS' } as any,
  'H1',
  undefined,
  undefined,
  undefined,
  date1
);

const profile2 = generateAssetIntelligence(
  'XAUUSD',
  { symbol: 'XAUUSD', price: 2350.5, change24h: 0.5, spread: 1.2, high24h: 2360, low24h: 2340, volume: '1B', sparkline: '', source: 'Broker', lastUpdated: 'Live', category: 'METALS' } as any,
  'H1',
  undefined,
  undefined,
  undefined,
  date2
);

const liveMsgs1 = getTruthfulLiveMessages(profile1);
const liveMsgs2 = getTruthfulLiveMessages(profile2);

assert(liveMsgs1.length > 0, 'Profile 1 generated truthful live messages');
assert(liveMsgs2.length > 0, 'Profile 2 generated truthful live messages');
assert(
  liveMsgs1[0].id === liveMsgs2[0].id,
  `Message IDs are deterministic across evaluation times: ${liveMsgs1[0]?.id}`
);
assert(
  !liveMsgs1[0].id.includes('13:21:27'),
  'Message ID does not contain volatile timestamp string'
);

// 3. Test Full Hub Mini Feed Render using Profile Messages
console.log('\n--- Test 3: Full HubMiniFeed Render using Real Pipeline Messages ---');
const serverFeedFromProfile = renderToString(
  React.createElement(HubMiniFeed, { messages: liveMsgs1, activeSymbol: 'XAUUSD' })
);
const clientFeedFromProfile = renderToString(
  React.createElement(HubMiniFeed, { messages: liveMsgs2, activeSymbol: 'XAUUSD' })
);

assert(
  serverFeedFromProfile === clientFeedFromProfile,
  'Real pipeline-generated HubMiniFeed renders identically across T1 and T2'
);

console.log('\n====================================================');
console.log(`RESULTS: ${passedTests} / ${totalTests} assertions passed.`);
console.log('====================================================');
if (passedTests === totalTests) {
  console.log('ALL HYDRATION DETERMINISM CHECKS PASSED.');
} else {
  console.error('SOME HYDRATION DETERMINISM CHECKS FAILED.');
  process.exit(1);
}

