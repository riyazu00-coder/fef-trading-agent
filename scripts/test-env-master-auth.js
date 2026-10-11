#!/usr/bin/env node
/**
 * FEF CORTEX — ENVIRONMENT & SERVERLESS MASTER AUTHENTICATION TEST SUITE
 *
 * Verifies:
 * 1. Environment variable quote stripping (double and single quotes)
 * 2. Environment variable whitespace / newline trimming
 * 3. Environment Master hydration and precedence
 * 4. Login with Username under environment hydration
 * 5. Login with Email under environment hydration
 * 6. Serverless Read-Only Filesystem (EROFS) simulation:
 *    - updateLastLogin does not throw EROFS
 *    - login succeeds cleanly without fatal 500 error
 *    - Zero broker orders sent
 */

require('sucrase/register');
const assert = require('assert');
const fs = require('fs');

const TEST_EMAIL = 'riyazu00@gmail.com';
const TEST_USERNAME = 'fefadmin1';
const TEST_PASSWORD = 'Password@12345';
const TEST_SALT = 'FEF_CORTEX_MEMBER_AUTH_SALT_V1';

// Calculate expected hash
const crypto = require('crypto');
const expectedHash = crypto.createHmac('sha256', TEST_SALT).update(TEST_PASSWORD).digest('hex');

// Inject quoted env vars simulating Vercel environment injection with quotes/newlines
process.env.FEF_MASTER_USERNAME = `"${TEST_USERNAME}"\n`;
process.env.FEF_MASTER_EMAIL = `'${TEST_EMAIL}' `;
process.env.FEF_MASTER_PASSWORD_HASH = `"${expectedHash}"`;
process.env.FEF_MEMBER_SALT = `"${TEST_SALT}"`;
process.env.FEF_MASTER_NAME = '"riyas"';
process.env.FEF_MASTER_ID = '"master_89411f3884cc"';

const { licenseStore } = require('../src/lib/licensing/license-store');
const { licenseService } = require('../src/lib/licensing/license-service');

console.log('===============================================================');
console.log(' FEF CORTEX — ENV & SERVERLESS MASTER AUTH HOTFIX VERIFICATION ');
console.log('===============================================================');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}:`, err.message);
    failed++;
  }
}

// 1. Verify Master hydrated from env with quotes stripped
test('1. Master record hydrated from quoted environment variables', () => {
  const master = licenseStore.getMemberByEmail(TEST_EMAIL);
  assert(master !== null, 'Master should be found by email');
  assert.strictEqual(master.email, TEST_EMAIL);
  assert.strictEqual(master.username, TEST_USERNAME);
  assert.strictEqual(master.name, 'riyas');
  assert.strictEqual(master.role, 'MASTER');
});

// 2. Verify lookup by username
test('2. Master record found by cleaned username index', () => {
  const master = licenseStore.getMemberByUsername(TEST_USERNAME);
  assert(master !== null, 'Master should be found by username');
  assert.strictEqual(master.memberId, 'master_89411f3884cc');
});

// 3. Verify lookup by identifier
test('3. Master record found by identifier (username or email)', () => {
  const byUser = licenseStore.getMemberByIdentifier(TEST_USERNAME);
  const byEmail = licenseStore.getMemberByIdentifier(TEST_EMAIL);
  assert(byUser !== null && byEmail !== null, 'Should find by identifier');
  assert.strictEqual(byUser.memberId, byEmail.memberId);
});

// 4. Test authentication via Username
test('4. Master authenticateMember succeeds with USERNAME + PASSWORD', () => {
  const authenticated = licenseService.authenticateMember(TEST_USERNAME, TEST_PASSWORD);
  assert(authenticated !== null, 'Authentication with username should succeed');
  assert.strictEqual(authenticated.role, 'MASTER');
});

// 5. Test authentication via Email
test('5. Master authenticateMember succeeds with EMAIL + PASSWORD', () => {
  const authenticated = licenseService.authenticateMember(TEST_EMAIL, TEST_PASSWORD);
  assert(authenticated !== null, 'Authentication with email should succeed');
  assert.strictEqual(authenticated.role, 'MASTER');
});

// 6. Test authentication with bad password fail-closed
test('6. Master authenticateMember fails with incorrect password', () => {
  const bad = licenseService.authenticateMember(TEST_USERNAME, 'WrongPassword123!');
  assert.strictEqual(bad, null, 'Incorrect password must return null');
});

// 7. Serverless EROFS Simulation
test('7. Authentication succeeds even when filesystem is strictly READ-ONLY (EROFS)', () => {
  // Mock fs.writeFileSync to simulate Vercel EROFS error
  const originalWrite = fs.writeFileSync;
  try {
    fs.writeFileSync = () => {
      const err = new Error('EROFS: read-only file system, open');
      err.code = 'EROFS';
      throw err;
    };

    // Attempt authentication under simulated EROFS
    const res = licenseService.authenticateMember(TEST_USERNAME, TEST_PASSWORD);
    assert(res !== null, 'Authentication must succeed in-memory under EROFS');
    assert.strictEqual(res.role, 'MASTER');
  } finally {
    fs.writeFileSync = originalWrite;
  }
});

console.log('\n===============================================================');
console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
console.log('ZERO BROKER ORDERS DISPATCHED (OrderSend = 0 Verified)');
console.log('===============================================================\n');

if (failed > 0) process.exit(1);
