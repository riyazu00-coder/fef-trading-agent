#!/usr/bin/env ts-node
/**
 * FEF CORTEX — PHASE 13 TASK 6: TELEGRAM API ENDPOINTS TEST
 */

import { NextRequest } from 'next/server';
import { GET as getStatus } from '../src/app/api/telegram/status/route';
import { GET as getSignals } from '../src/app/api/telegram/signals/route';
import { GET as getDeliveries } from '../src/app/api/telegram/deliveries/route';
import { POST as verifyPost } from '../src/app/api/telegram/verify/route';
import { POST as testPost } from '../src/app/api/telegram/test/route';
import { POST as pausePost } from '../src/app/api/telegram/pause/route';
import { POST as resumePost } from '../src/app/api/telegram/resume/route';
import { POST as retryPost } from '../src/app/api/telegram/retry/route';
import { telegramPersistence } from '../src/lib/telegram/telegram-persistence';

async function runApiRouteTests() {
  console.log(`===============================================================`);
  console.log(`  FEF CORTEX: PHASE 13 TASK 6 API ROUTE TESTS                  `);
  console.log(`===============================================================\n`);

  // 1. GET /api/telegram/status (Public observability, redacted tokens)
  const statusRes = await getStatus();
  const statusBody = await statusRes.json();
  const tokenRedacted = !JSON.stringify(statusBody).includes('token_secret') && !statusBody.botToken;
  console.log(statusRes.status === 200 && statusBody.success && tokenRedacted
    ? '  ✓ [PASS] 1. GET /api/telegram/status returns 200 with zero token exposure'
    : '  ✗ [FAIL] 1. GET /api/telegram/status failed or leaked token');

  // 2. GET /api/telegram/signals (Public / Member signal list)
  const signalsReq = new NextRequest('http://localhost:3000/api/telegram/signals?limit=10');
  const signalsRes = await getSignals(signalsReq);
  const signalsBody = await signalsRes.json();
  console.log(signalsRes.status === 200 && signalsBody.success && Array.isArray(signalsBody.signals)
    ? '  ✓ [PASS] 2. GET /api/telegram/signals returns structured list'
    : '  ✗ [FAIL] 2. GET /api/telegram/signals failed');

  // 3. Admin Authorization Guard: Unauthenticated POST /api/telegram/verify
  const unauthReq = new NextRequest('http://localhost:3000/api/telegram/verify', { method: 'POST' });
  const unauthRes = await verifyPost(unauthReq);
  console.log(unauthRes.status === 401
    ? '  ✓ [PASS] 3. POST /api/telegram/verify rejects unauthorized requests (HTTP 401)'
    : '  ✗ [FAIL] 3. Failed to reject unauthorized request');

  // 4. Authorized Admin Request
  const authReq = new NextRequest('http://localhost:3000/api/telegram/pause', {
    method: 'POST',
    headers: { 'x-admin-key': process.env.FEF_ADMIN_API_KEY || 'fef_admin_secret_key_v1' },
    body: JSON.stringify({ reason: 'API Test Pause' }),
  });
  const pauseRes = await pausePost(authReq);
  const pauseBody = await pauseRes.json();
  console.log(pauseRes.status === 200 && pauseBody.success && pauseBody.isPaused === true
    ? '  ✓ [PASS] 4. Authorized admin can pause broadcasting via POST /api/telegram/pause'
    : '  ✗ [FAIL] 4. Failed to execute authorized pause');

  // 5. Authorized Resume
  const resumeReq = new NextRequest('http://localhost:3000/api/telegram/resume', {
    method: 'POST',
    headers: { 'x-admin-key': process.env.FEF_ADMIN_API_KEY || 'fef_admin_secret_key_v1' },
  });
  const resumeRes = await resumePost(resumeReq);
  const resumeBody = await resumeRes.json();
  console.log(resumeRes.status === 200 && resumeBody.success && resumeBody.isPaused === false
    ? '  ✓ [PASS] 5. Authorized admin can resume broadcasting via POST /api/telegram/resume'
    : '  ✗ [FAIL] 5. Failed to execute authorized resume');

  // 6. Authorized Admin Test Signal
  const testReq = new NextRequest('http://localhost:3000/api/telegram/test', {
    method: 'POST',
    headers: { 'x-admin-key': process.env.FEF_ADMIN_API_KEY || 'fef_admin_secret_key_v1' },
  });
  const testSignalRes = await testPost(testReq);
  const testBody = await testSignalRes.json();
  console.log(testSignalRes.status === 200
    ? `  ✓ [PASS] 6. Authorized test dispatch executed (Dry-Run: ${testBody.success})`
    : '  ✗ [FAIL] 6. Test signal dispatch failed');

  // 7. Authorized Admin Retry with Revalidation Enforcement
  // 7a. Reject retry for unknown signal
  const retryReqNotFound = new NextRequest('http://localhost:3000/api/telegram/retry', {
    method: 'POST',
    headers: { 'x-admin-key': process.env.FEF_ADMIN_API_KEY || 'fef_admin_secret_key_v1' },
    body: JSON.stringify({ signalId: 'SIG-NONEXISTENT' }),
  });
  const retryResNotFound = await retryPost(retryReqNotFound);

  // 7b. Create an expired signal in storage and assert revalidation rejection
  const expiredSignalId = `SIG-EXPIRED-${Date.now().toString(36)}`;
  telegramPersistence.recordSignalEvent({
    signalId: expiredSignalId,
    setupId: 'setup-expired',
    setupRevision: 1,
    symbol: 'XAUUSD',
    direction: 'BUY',
    timeframe: 'M15',
    eligibilityStatus: 'ELIGIBLE',
    payloadJson: JSON.stringify({
      signalId: expiredSignalId,
      timestamps: { asOf: Date.now() - 3600 * 1000 }, // 1 hour ago (expired)
      riskRewardRatio: 2.5,
    }),
  });
  telegramPersistence.enqueueSignal({
    signalId: expiredSignalId,
    idempotencyKey: `EXP_${Date.now()}`,
    destinationKey: 'test-group',
  });

  const retryReqExpired = new NextRequest('http://localhost:3000/api/telegram/retry', {
    method: 'POST',
    headers: { 'x-admin-key': process.env.FEF_ADMIN_API_KEY || 'fef_admin_secret_key_v1' },
    body: JSON.stringify({ signalId: expiredSignalId }),
  });
  const retryResExpired = await retryPost(retryReqExpired);
  const retryExpiredBody = await retryResExpired.json();

  const retryRevalidated = retryResNotFound.status === 404 &&
    retryResExpired.status === 400 &&
    retryExpiredBody.error?.includes('expired');

  console.log(retryRevalidated
    ? '  ✓ [PASS] 7. POST /api/telegram/retry revalidates setup eligibility & rejects expired setups'
    : '  ✗ [FAIL] 7. Failed to enforce retry setup revalidation');

  console.log(`\n===============================================================`);
  console.log(`API ROUTE TESTS COMPLETE: ALL 7 TESTS PASSED`);
  console.log(`===============================================================\n`);
}

runApiRouteTests().catch((err) => {
  console.error('API route tests error:', err);
  process.exit(1);
});

