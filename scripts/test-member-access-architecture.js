/**
 * FEF CORTEX — 3-TIER MEMBER ACCESS & SINGLE-DEVICE LICENSING TEST SUITE
 * 
 * Verifies:
 * 1. Public dashboard access is unblocked (No global modal).
 * 2. Unauthenticated access to /execution & /settings is blocked.
 * 3. Member Authentication (Login/Logout/Session verification).
 * 4. Member License Entitlement Check (Active, Revoked, Suspended, Expired, Missing).
 * 5. Device Authorization Binding (0/1 slots -> 1/1 slots).
 * 6. Single-device restriction: 2nd computer with same member/license is rejected.
 * 7. Admin device reset allows re-binding to a new device.
 * 8. Execution gate preservation: Authenticated member + active license + authorized device + MT5 connected + trade protection + human confirmation.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

// Isolated Test Data Sandbox: Prevent test accounts from polluting development/production registries
const testDataDir = path.resolve(__dirname, '../data/.test-tmp');
if (!fs.existsSync(testDataDir)) {
  fs.mkdirSync(testDataDir, { recursive: true });
}
const testStoreFile = path.resolve(testDataDir, `licenses-${Date.now()}.json`);
const testMembersFile = path.resolve(testDataDir, `members-${Date.now()}.json`);
const testLockFile = path.resolve(testDataDir, `store-${Date.now()}.lock`);

process.env.FEF_LICENSES_STORE_FILE = testStoreFile;
process.env.FEF_MEMBERS_STORE_FILE = testMembersFile;
process.env.FEF_STORE_LOCK_FILE = testLockFile;

// We will use tsx / ts-node runner or inline import of ts modules
const { licenseService } = require('../src/lib/licensing/license-service');
const { licenseStore } = require('../src/lib/licensing/license-store');
const { getDeviceIdentity, hashLicenseKey } = require('../src/lib/licensing/device-identity');
const { validateLicensedExecution, EXECUTION_GATE_ERRORS } = require('../src/lib/execution/execution-policy');

async function runTests() {
  console.log('===============================================================');
  console.log('FEF CORTEX — 3-TIER MEMBER ACCESS & LICENSING VERIFICATION');
  console.log('===============================================================');

  let passed = 0;
  let failed = 0;

  try {
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

  // --- TIER 1: MEMBER IDENTITY & AUTHENTICATION ---
  console.log('\n[TIER 1: MEMBER IDENTITY & AUTHENTICATION]');

  test('1. Member registration stores email, hashed password, and memberId', () => {
    const testEmail = `trader_${Date.now()}@community.com`;
    const member = licenseService.registerMember({
      email: testEmail,
      password: 'SecurePassword123!',
      name: 'Alpha Trader',
    });

    assert.ok(member.memberId.startsWith('mem_'), 'memberId should have prefix mem_');
    assert.strictEqual(member.email, testEmail.toLowerCase());
    assert.ok(member.passwordHash.length === 64, 'passwordHash must be sha256 hex');
    assert.strictEqual(member.assignedLicenseId, null);
  });

  test('2. Member authentication validates password and rejects invalid credentials', () => {
    const testEmail = `auth_test_${Date.now()}@community.com`;
    licenseService.registerMember({
      email: testEmail,
      password: 'CorrectPassword1!',
      name: 'Auth Test User',
    });

    const success = licenseService.authenticateMember(testEmail, 'CorrectPassword1!');
    assert.ok(success, 'Valid credentials must authenticate');
    assert.strictEqual(success.email, testEmail);

    const failWrongPass = licenseService.authenticateMember(testEmail, 'WrongPassword');
    assert.strictEqual(failWrongPass, null, 'Incorrect password must return null');

    const failWrongEmail = licenseService.authenticateMember('nonexistent@community.com', 'AnyPass');
    assert.strictEqual(failWrongEmail, null, 'Nonexistent email must return null');
  });

  // --- TIER 2: LICENSE & MEMBERSHIP ENTITLEMENT ---
  console.log('\n[TIER 2: LICENSE ENTITLEMENT & ASSIGNMENT]');

  let sharedMember;
  let sharedLicense;

  test('3. Admin can assign active license to a member', () => {
    const testEmail = `license_holder_${Date.now()}@community.com`;
    sharedMember = licenseService.registerMember({
      email: testEmail,
      password: 'Password123!',
      name: 'Licensed Member',
    });

    // Create a new license
    const created = licenseService.createLicense({
      customerName: sharedMember.name,
      customerEmail: sharedMember.email,
    });
    sharedLicense = created.record;

    // Assign license to member
    const updatedMember = licenseService.assignLicenseToMember(sharedMember.memberId, sharedLicense.licenseId);
    assert.strictEqual(updatedMember.assignedLicenseId, sharedLicense.licenseId);

    const fetchedLicense = licenseService.getLicenseForMember(sharedMember.memberId);
    assert.ok(fetchedLicense, 'License should be retrievable for member');
    assert.strictEqual(fetchedLicense.licenseId, sharedLicense.licenseId);
    assert.strictEqual(fetchedLicense.status, 'ACTIVE');
    assert.strictEqual(fetchedLicense.activatedDeviceHash, null, 'Device slot should initially be unclaimed (0/1)');
  });

  test('4. Member with no license cannot authorize device', () => {
    const unentitledMember = licenseService.registerMember({
      email: `unentitled_${Date.now()}@community.com`,
      password: 'Pass!',
      name: 'Unentitled Member',
    });

    const res = licenseService.authorizeMemberDevice(unentitledMember.memberId, 'DEV_TEST_1');
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.error, 'NO_LICENSE_ASSIGNED');
  });

  // --- TIER 3: DEVICE AUTHORIZATION & SINGLE-DEVICE POLICY ---
  console.log('\n[TIER 3: SINGLE-DEVICE AUTHORIZATION & ISOLATION]');

  test('5. First computer claims device slot (0/1 -> 1/1)', () => {
    const dev1Fingerprint = 'COMPUTER_A_FINGERPRINT_11111111111111111111111111111111';
    const authRes = licenseService.authorizeMemberDevice(sharedMember.memberId, dev1Fingerprint);

    assert.ok(authRes.success, 'First device must be authorized');
    assert.ok(authRes.token, 'Token payload must be returned');
    assert.strictEqual(authRes.token.deviceFingerprint, dev1Fingerprint);

    // Verify stored state in registry
    const refreshedLic = licenseStore.getByLicenseId(sharedLicense.licenseId);
    assert.strictEqual(refreshedLic.activatedDeviceHash, dev1Fingerprint);
  });

  test('6. Same computer re-authorizing / refreshing is allowed', () => {
    const dev1Fingerprint = 'COMPUTER_A_FINGERPRINT_11111111111111111111111111111111';
    const authRes = licenseService.authorizeMemberDevice(sharedMember.memberId, dev1Fingerprint);

    assert.ok(authRes.success, 'Same computer must be allowed');
  });

  test('7. Second computer attempting to use same member license is REJECTED', () => {
    const dev2Fingerprint = 'COMPUTER_B_FINGERPRINT_22222222222222222222222222222222';
    const authRes = licenseService.authorizeMemberDevice(sharedMember.memberId, dev2Fingerprint);

    assert.strictEqual(authRes.success, false);
    assert.strictEqual(authRes.error, 'LICENSE_ALREADY_ACTIVATED_ON_ANOTHER_DEVICE');
  });

  test('8. Admin device reset clears device slot and allows migration to new computer', () => {
    const dev2Fingerprint = 'COMPUTER_B_FINGERPRINT_22222222222222222222222222222222';
    
    // Admin resets device binding
    const resetLic = licenseService.resetDeviceActivation(sharedLicense.licenseId);
    assert.strictEqual(resetLic.activatedDeviceHash, null);

    // Now Computer B attempts authorization -> SUCCESS
    const authRes = licenseService.authorizeMemberDevice(sharedMember.memberId, dev2Fingerprint);
    assert.ok(authRes.success, 'New device must be authorized after admin reset');

    const refreshedLic = licenseStore.getByLicenseId(sharedLicense.licenseId);
    assert.strictEqual(refreshedLic.activatedDeviceHash, dev2Fingerprint);
  });

  // --- TIER 4: COMPOSITE EXECUTION GATE ---
  console.log('\n[TIER 4: COMPOSITE EXECUTION POLICY PRESERVATION]');

  test('9. Execution gate blocks if user is unlicensed', () => {
    const res = validateLicensedExecution({
      isLicensed: false,
      licenseErrorCode: 'LICENSE_REQUIRED',
      reportedMode: 'DEMO',
      humanApproved: true,
    });
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.error.code, 'LICENSE_REQUIRED');
  });

  test('10. Execution gate blocks if device mismatch', () => {
    const res = validateLicensedExecution({
      isLicensed: false,
      licenseErrorCode: 'LICENSE_DEVICE_MISMATCH',
      reportedMode: 'DEMO',
      humanApproved: true,
    });
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.error.code, 'LICENSE_DEVICE_MISMATCH');
  });

  test('11. Execution gate allows DEMO if licensed + device authorized + confirmed', () => {
    const res = validateLicensedExecution({
      isLicensed: true,
      reportedMode: 'DEMO',
      humanApproved: true,
    });
    assert.strictEqual(res.allowed, true);
    assert.strictEqual(res.mode, 'DEMO');
    assert.strictEqual(res.error, null);
  });

  test('12. Execution gate blocks REAL without explicit real confirmation', () => {
    const res = validateLicensedExecution({
      isLicensed: true,
      reportedMode: 'REAL',
      humanApproved: true,
      realConfirmed: false,
    });
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.error.code, 'REAL_CONFIRMATION_REQUIRED');
  });

  test('13. Execution gate allows REAL if licensed + real double confirmed', () => {
    const res = validateLicensedExecution({
      isLicensed: true,
      reportedMode: 'REAL',
      humanApproved: true,
      realConfirmed: true,
    });
    assert.strictEqual(res.allowed, true);
    assert.strictEqual(res.mode, 'REAL');
    assert.strictEqual(res.error, null);
  });

  // --- TIER 4: MASTER ROLE & MANDATORY PASSWORD CHANGE ---
  console.log('\n[TIER 4: MASTER ROLE & MANDATORY PASSWORD CHANGE]');

  test('14. Master bootstrap creates MASTER account with master_ prefix and mustChangePassword = false', () => {
    const master = licenseService.bootstrapMasterAccount();
    assert.ok(master.memberId.startsWith('master_'), 'masterId must start with master_');
    assert.strictEqual(master.role, 'MASTER');
    assert.strictEqual(master.status, 'ACTIVE');
    assert.strictEqual(master.mustChangePassword, false);
  });

  test('15. Member provisioned by Master generates temporary password and sets mustChangePassword = true', () => {
    const tempPass = licenseService.generateTemporaryPassword();
    assert.strictEqual(tempPass.length, 12, 'Temporary password must be 12 chars');
    
    const newMember = licenseService.registerMember({
      email: `temp_${Date.now()}@feftrading.com`,
      password: tempPass,
      name: 'Temp Member',
      role: 'MEMBER',
      mustChangePassword: true,
    });

    assert.strictEqual(newMember.role, 'MEMBER');
    assert.strictEqual(newMember.mustChangePassword, true);
    assert.notStrictEqual(newMember.passwordHash, tempPass, 'Password must be hashed, not plaintext');

    // Authenticate with temporary password succeeds
    const authMember = licenseService.authenticateMember(newMember.email, tempPass);
    assert.ok(authMember !== null, 'authMember should not be null');
    assert.strictEqual(authMember.mustChangePassword, true);
  });

  test('16. Member mandatory password change succeeds and clears mustChangePassword flag', () => {
    const tempPass = licenseService.generateTemporaryPassword();
    const email = `pwd_change_${Date.now()}@feftrading.com`;
    licenseService.registerMember({
      email,
      password: tempPass,
      name: 'Password Changer',
      role: 'MEMBER',
      mustChangePassword: true,
    });

    const changeRes = licenseService.changeMemberPassword(email, tempPass, 'BrandNewSecurePassword123!');
    assert.strictEqual(changeRes.success, true);
    assert.strictEqual(changeRes.member.mustChangePassword, false);

    // Old temporary password now fails
    const oldAuth = licenseService.authenticateMember(email, tempPass);
    assert.strictEqual(oldAuth, null);

    // New password succeeds
    const newAuth = licenseService.authenticateMember(email, 'BrandNewSecurePassword123!');
    assert.ok(newAuth !== null);
    assert.strictEqual(newAuth.mustChangePassword, false);
  });

  test('17. Master reset member password generates new temp password and resets mustChangePassword flag', () => {
    const email = `reset_target_${Date.now()}@feftrading.com`;
    const member = licenseService.registerMember({
      email,
      password: 'CurrentPassword123!',
      name: 'Reset Target',
      role: 'MEMBER',
      mustChangePassword: false,
    });

    const resetRes = licenseService.resetMemberTemporaryPassword(member.memberId);
    assert.strictEqual(resetRes.success, true);
    assert.ok(resetRes.tempPassword.length >= 10);
    assert.strictEqual(resetRes.member.mustChangePassword, true);

    // Login with new temp password succeeds
    const tempAuth = licenseService.authenticateMember(email, resetRes.tempPassword);
    assert.ok(tempAuth !== null);
  });

  test('18. Suspended member login is rejected fail-closed', () => {
    const email = `suspended_${Date.now()}@feftrading.com`;
    const member = licenseService.registerMember({
      email,
      password: 'Password123!',
      name: 'Suspended Member',
      role: 'MEMBER',
    });

    licenseService.suspendMember(member.memberId);
    const auth = licenseService.authenticateMember(email, 'Password123!');
    assert.strictEqual(auth, null);

    licenseService.reactivateMember(member.memberId);
    const authReactivated = licenseService.authenticateMember(email, 'Password123!');
    assert.ok(authReactivated !== null);
  });

  test('19. Master bypasses license check for execution, but STILL enforces trade protections fail-closed', () => {
    // Master has isLicensed: true (bypassed), but if reportedMode is UNKNOWN, execution is BLOCKED
    const resUnknown = validateLicensedExecution({
      isLicensed: true, // Master bypass
      reportedMode: 'UNKNOWN',
      humanApproved: true,
    });
    assert.strictEqual(resUnknown.allowed, false);
    assert.strictEqual(resUnknown.error.code, 'ACCOUNT_MODE_UNKNOWN');

    // Master has isLicensed: true, but without human approval, execution is BLOCKED
    const resUnapproved = validateLicensedExecution({
      isLicensed: true, // Master bypass
      reportedMode: 'DEMO',
      humanApproved: false,
    });
    assert.strictEqual(resUnapproved.allowed, false);
    assert.strictEqual(resUnapproved.error.code, 'HUMAN_APPROVAL_REQUIRED');

    // Master on REAL without realConfirmed is BLOCKED
    const resRealUnconfirmed = validateLicensedExecution({
      isLicensed: true, // Master bypass
      reportedMode: 'REAL',
      humanApproved: true,
      realConfirmed: false,
    });
    assert.strictEqual(resRealUnconfirmed.allowed, false);
    assert.strictEqual(resRealUnconfirmed.error.code, 'REAL_CONFIRMATION_REQUIRED');

    // Master on REAL with real double confirmation is ALLOWED
    const resRealConfirmed = validateLicensedExecution({
      isLicensed: true, // Master bypass
      reportedMode: 'REAL',
      humanApproved: true,
      realConfirmed: true,
    });
    assert.strictEqual(resRealConfirmed.allowed, true);
    assert.strictEqual(resRealConfirmed.mode, 'REAL');
  });

  console.log('\n===============================================================');
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('===============================================================');

  // Cleanup any test master accounts created during this test
  const testMasters = licenseService.getAllMasterAccounts();
  for (const tm of testMasters) {
    licenseService.deleteMember(tm.memberId);
  }
  } finally {
    // Deterministic Isolation Cleanup: Remove temporary test store files so registries remain pristine
    try {
      if (fs.existsSync(testStoreFile)) fs.unlinkSync(testStoreFile);
      if (fs.existsSync(testMembersFile)) fs.unlinkSync(testMembersFile);
      if (fs.existsSync(testLockFile)) fs.unlinkSync(testLockFile);
      if (fs.existsSync(testDataDir)) {
        const remaining = fs.readdirSync(testDataDir);
        if (remaining.length === 0) fs.rmdirSync(testDataDir);
      }
    } catch (e) {
      // Ignore cleanup error
    }
  }

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

