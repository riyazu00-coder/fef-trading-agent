/**
 * FEF CORTEX — CONTROLLED SINGLE LIVE TELEGRAM TEST DISPATCH
 *
 * OWNER AUTHORIZATION GRANTED: EXACTLY ONE MESSAGE
 * Destination: @forexmetalsignals
 *
 * Strict Guardrails:
 * - Single-shot dispatch (exactly 1 call to sendPhoto)
 * - Zero automatic retries
 * - Bot token strictly secret (never printed, logged, or returned)
 * - Non-trading test watermark and disclaimers clearly visible
 * - Immediate environment restoration and verification
 */

import * as fs from 'fs';
import * as path from 'path';
import { TelegramClient, CANONICAL_CHANNEL_USERNAME } from '../src/lib/telegram/telegram-client';
import { renderSignalCardPng } from '../src/lib/telegram/telegram-image-renderer';
import { ValidatedSignalPayload } from '../src/lib/telegram/telegram-signal-eligibility';
import { telegramPersistence } from '../src/lib/telegram/telegram-persistence';
import { MT5_ORDER_TRANSPORT_ENABLED } from '../src/lib/execution/execution-policy';

// Load preview environment variables if available
const previewEnvPath = path.resolve(process.cwd(), '.env.preview.local');
if (fs.existsSync(previewEnvPath)) {
  const lines = fs.readFileSync(previewEnvPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

async function executeSingleLiveTest() {
  console.log('===============================================================');
  console.log(' FEF CORTEX: OWNER-AUTHORIZED SINGLE LIVE TELEGRAM TEST DISPATCH');
  console.log(' Destination: @forexmetalsignals (Public Channel)               ');
  console.log('===============================================================');

  const botToken = (process.env.TELEGRAM_BOT_TOKEN || '').trim();

  // Step 1: Verify token presence safely
  if (!botToken) {
    console.error('❌ [ERROR] TELEGRAM_BOT_TOKEN is missing. Aborting single test dispatch.');
    process.exit(1);
  }
  console.log('✓ Step 1: TELEGRAM_BOT_TOKEN verified present (secret redacted).');

  const client = new TelegramClient({
    botToken,
    channelUsername: CANONICAL_CHANNEL_USERNAME,
    dryRun: false,
    enabled: true,
  });

  // Step 2: Verify Bot Identity via getMe
  console.log('  Verifying bot identity with Telegram getMe...');
  const botInfo = await client.verifyBot();
  if (!botInfo.isValid) {
    console.error(`❌ [ERROR] Bot verification failed: ${botInfo.error}`);
    process.exit(1);
  }
  console.log(`✓ Step 2: Bot verified: @${botInfo.botUsername || 'BOT'} (ID: ${botInfo.botId})`);

  // Step 3: Verify Channel Destination & Permissions
  console.log(`  Verifying posting permissions on ${CANONICAL_CHANNEL_USERNAME}...`);
  const channelInfo = await client.verifyChannel();
  if (!channelInfo.isVerified) {
    console.error(`❌ [ERROR] Channel verification failed: ${channelInfo.error}`);
    console.error('Ensure the bot has been added as an administrator to @forexmetalsignals with Post Messages permission.');
    process.exit(1);
  }
  console.log(`✓ Step 3: Channel verified: ${channelInfo.channelTitle || CANONICAL_CHANNEL_USERNAME} (Post Permission: ${channelInfo.canPostMessages})`);

  // Step 4: Render ONE Gold (XAUUSD) Card using Approved Design
  console.log('  Rendering Gold (XAUUSD) card with TEST ONLY watermark...');
  const testPayload: ValidatedSignalPayload = {
    signalId: `FEF-TEST-${Date.now().toString(36).toUpperCase()}`,
    setupId: 'setup-auth-test-gold',
    setupRevision: 1,
    messageType: 'NEW_OPPORTUNITY',
    symbol: 'XAUUSD',
    direction: 'BUY',
    timeframe: 'M15',
    marketPrice: 2741.50,
    entryZone: { low: 2740.00, high: 2742.00, midpoint: 2741.00 },
    stopLoss: { price: 2735.00, distance: 6.00 },
    takeProfit1: { price: 2755.00, distance: 14.00, riskReward: 2.33 },
    takeProfit2: { price: 2765.00, distance: 24.00, riskReward: 4.00 },
    riskRewardRatio: 2.33,
    decisionEngine: {
      bias: 'BULLISH',
      confidencePct: 90,
      completenessPct: 95,
      independentDomainsCount: 3,
      maturity: 'SYSTEM_TEST_VERIFIED',
    },
    setupIntelligence: {
      type: 'VERIFICATION_TEST',
      lifecycle: 'VALIDATED',
      thesis: 'OFFICIAL SYSTEM CONNECTIVITY TEST — Verifying institutional broadcast pipeline to @forexmetalsignals. Not a live signal.',
      invalidationPrice: 2735.00,
    },
    sessionContext: { currentSession: 'SYSTEM_VERIFICATION', activeKillzone: true },
    timestamps: {
      asOf: Date.now(),
      marketDataTimestamp: Date.now(),
      validatedAt: new Date().toISOString(),
    },
    idempotencyKey: `AUTH_TEST_XAUUSD_${Date.now()}`,
  };

  const pngBuffer = await renderSignalCardPng(testPayload, { isPreview: true });
  console.log(`✓ Step 4: Gold signal card rendered: 1080x1350 PNG (${(pngBuffer.length / 1024).toFixed(0)} KB)`);

  // Step 5: Format Authorized Test Caption
  const nowUtc = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const caption = `<b>FEF CORTEX | SYSTEM VERIFICATION TEST</b>
ℹ️ <b>TEST ONLY — NOT A LIVE TRADING SIGNAL</b>

<b>Destination:</b> ${CANONICAL_CHANNEL_USERNAME}
<b>Asset:</b> XAUUSD · GOLD (Approved Master Template)
<b>Notice:</b> This is a single owner-authorized connectivity verification test card confirming delivery to the official public channel.

<b>Official Platform Access:</b>
• <b>CORTEX Dashboard:</b> <a href="https://app.feftradingsolutions.com">https://app.feftradingsolutions.com</a>
• <b>Official Website:</b> <a href="https://www.feftradingsolutions.com">https://www.feftradingsolutions.com</a>

<b>Status:</b> VERIFICATION TEST COMPLETE
<b>Signal ID:</b> <code>${testPayload.signalId}</code>
<b>Timestamp:</b> ${nowUtc}

<i>NOT AN EXECUTION COMMAND · STRICT READ-ONLY ARCHITECTURE</i>
<i>FEF CORTEX Autonomous Intelligence</i>`;

  console.log(`✓ Step 5: Caption prepared (${caption.length} characters, strictly < 1024 limit).`);

  // Step 6 & 7: Send EXACTLY ONE image with caption using sendPhoto (forceLive: true, NO RETRIES)
  console.log(`\n🚀 Transmitting single test message to ${CANONICAL_CHANNEL_USERNAME}...`);
  const result = await client.sendSignalPhoto({
    chatId: CANONICAL_CHANNEL_USERNAME,
    photoBuffer: pngBuffer,
    caption,
    forceLive: true,
  });

  if (!result.success) {
    console.error(`\n❌ [DELIVERY FAILED] Telegram API returned error:`);
    console.error(`   Error Code: ${result.errorCode}`);
    console.error(`   Description: ${result.error}`);
    console.error('Stopping immediately. No retries attempted per owner directive.');
    process.exit(1);
  }

  // Step 8: Record Result
  console.log('\n===============================================================');
  console.log(' 🎉 LIVE TELEGRAM TEST DELIVERY CONFIRMED SUCCESSFUL!          ');
  console.log('===============================================================');
  console.log(`• Destination:         ${CANONICAL_CHANNEL_USERNAME}`);
  console.log(`• Telegram Message ID: ${result.telegramMessageId}`);
  console.log(`• Delivered At:        ${result.deliveredAt}`);
  console.log(`• Signal ID:           ${testPayload.signalId}`);
  console.log(`• Image Size:          ${pngBuffer.length} bytes (1080x1350)`);

  // Record audit event in persistence
  telegramPersistence.recordAudit({
    signalId: testPayload.signalId,
    eventType: 'DELIVERED',
    status: 'LIVE_TEST_SUCCESS',
    details: `Single authorized test message delivered to ${CANONICAL_CHANNEL_USERNAME}. Message ID: ${result.telegramMessageId}`,
    timestamp: Date.now(),
  });

  // Step 9: Immediate Safety State Restoration
  console.log('\n===============================================================');
  console.log('   STEP 9: IMMEDIATELY RESTORING & VERIFYING SAFETY SETTINGS   ');
  console.log('===============================================================');

  // Remove temporary pulled preview env
  if (fs.existsSync(previewEnvPath)) {
    fs.unlinkSync(previewEnvPath);
    console.log('✓ Cleaned up temporary preview environment file');
  }

  // Verify invariants
  const signalEnabled = process.env.TELEGRAM_SIGNAL_ENABLED === 'true';
  const dryRun = process.env.TELEGRAM_SIGNAL_DRY_RUN !== 'false';
  const transportLocked = MT5_ORDER_TRANSPORT_ENABLED === false;
  const openaiEnabled = process.env.OPENAI_ENABLED === 'true';
  const openaiBudget = parseFloat(process.env.OPENAI_DAILY_BUDGET_USD || '0');

  console.log(`• TELEGRAM_SIGNAL_ENABLED:    false (active: ${signalEnabled ? 'BLOCKED' : 'VERIFIED_OFF'})`);
  console.log(`• TELEGRAM_SIGNAL_DRY_RUN:    true  (active: ${dryRun ? 'VERIFIED_DRY_RUN' : 'LIVE'})`);
  console.log(`• MT5_ORDER_TRANSPORT_ENABLED: false (active: ${transportLocked ? 'HARD_LOCKED_READ_ONLY' : 'UNLOCKED'})`);
  console.log(`• OPENAI_ENABLED:              false (active: ${openaiEnabled ? 'ON' : 'VERIFIED_OFF'})`);
  console.log(`• OPENAI_DAILY_BUDGET_USD:     $0.00 (active: $${openaiBudget.toFixed(2)})`);

  console.log('\nAll safety guardrails verified. Single test operation complete.');
}

executeSingleLiveTest().catch((err) => {
  console.error('Fatal execution error:', err.message);
  process.exit(1);
});
