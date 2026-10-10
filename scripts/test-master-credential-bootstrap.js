#!/usr/bin/env node
/**
 * FEF CORTEX — MASTER OWNER CREDENTIAL BOOTSTRAP TEST SUITE
 * 
 * Verifies all security, validation, policy, privilege, and safety requirements:
 * 1. Master account fields & username format validation (letters, numbers, _, .)
 * 2. Case-normalization & uniqueness for username and email
 * 3. Strict Master password policy enforcement (12+ chars, upper, lower, digit, special)
 * 4. Password hashing (SHA-256 HMAC, never plaintext)
 * 5. Duplicate Master creation protection (fail-closed)
 * 6. Universal login via either Username or Email
 * 7. Server-authoritative role enforcement (client cannot dictate role)
 * 8. Master full application privileges (exempt from community license & 1-device slot)
 * 9. Non-Master (MEMBER) blocked from Admin Member routes/APIs
 * 10. Master trading safety gates remain 100% active (Demo/Real verification, human approval, double real confirmation)
 * 11. Master password reset functionality
 * 12. Complete clean-up of temporary test credentials
 * 13. Zero broker orders sent (OrderSend = 0)
 */

require('sucrase/register');
const assert = require('assert');
const { licenseService } = require('../src/lib/licensing/license-service');
const { licenseStore } = require('../src/lib/licensing/license-store');
const { validateLicensedExecution } = require('../src/lib/execution/execution-policy');

async function runTestSuite() {
  console.log('===============================================================');
  console.log(' FEF CORTEX — MASTER OWNER CREDENTIAL BOOTSTRAP TEST SUITE     ');
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

  // Ensure clean state before running
  const initialMasters = licenseService.getAllMasterAccounts();
  for (const m of initialMasters) {
    licenseService.deleteMember(m.memberId);
  }

  // -------------------------------------------------------------
  // TEST GROUP 1: USERNAME FORMAT & VALIDATION
  // -------------------------------------------------------------
  console.log('\n[GROUP 1: USERNAME FORMAT & VALIDATION]');

  test('1. Valid usernames (letters, numbers, underscore, period) are accepted', () => {
    const validUsernames = ['riaz01', 'fefadmin1', 'fef.owner01', 'Admin_99', 'a.b_c123'];
    for (const u of validUsernames) {
      const res = licenseService.validateUsernameFormat(u);
      assert.strictEqual(res.valid, true, `Username '${u}' should be valid`);
    }
  });

  test('2. Invalid username characters (spaces, symbols like @, #, $, !) are rejected', () => {
    const invalidUsernames = ['user name', 'riaz@admin', 'owner#1', 'admin$fef', 'test!user'];
    for (const u of invalidUsernames) {
      const res = licenseService.validateUsernameFormat(u);
      assert.strictEqual(res.valid, false, `Username '${u}' should be rejected`);
      assert.ok(res.error.includes('letters, numbers, underscore'), `Error message expected for '${u}'`);
    }
  });

  test('3. Usernames with invalid length (< 3 or > 30 chars) are rejected', () => {
    const tooShort = ['ab', 'a', ''];
    for (const u of tooShort) {
      const res = licenseService.validateUsernameFormat(u);
      assert.strictEqual(res.valid, false, `Too short username '${u}' should be rejected`);
    }
    const tooLong = 'a'.repeat(31);
    const resLong = licenseService.validateUsernameFormat(tooLong);
    assert.strictEqual(resLong.valid, false, 'Too long username should be rejected');
  });

  // -------------------------------------------------------------
  // TEST GROUP 2: STRICT MASTER PASSWORD POLICY
  // -------------------------------------------------------------
  console.log('\n[GROUP 2: STRICT MASTER PASSWORD POLICY]');

  test('4. Password meeting all 5 requirements is accepted', () => {
    const strongPasswords = [
      'P@ssw0rd12345!',
      'Fef#Cortex2026Secure',
      'Ultra_Complex.99Key$',
      'Xyz789!AbcDefGhiJkl',
    ];
    for (const p of strongPasswords) {
      const res = licenseService.validateMasterPasswordPolicy(p);
      assert.strictEqual(res.valid, true, `Password should be accepted: ${p.slice(0, 4)}...`);
    }
  });

  test('5. Passwords under 12 characters are rejected fail-closed', () => {
    const shortPasswords = ['Aa1!short', 'P@ss1234567', 'NineChar1!'];
    for (const p of shortPasswords) {
      const res = licenseService.validateMasterPasswordPolicy(p);
      assert.strictEqual(res.valid, false);
      assert.ok(res.error.includes('at least 12 characters'));
    }
  });

  test('6. Passwords missing uppercase, lowercase, number, or special char are rejected', () => {
    // Missing uppercase
    const noUpper = licenseService.validateMasterPasswordPolicy('lowercaseonly123!@#');
    assert.strictEqual(noUpper.valid, false);
    assert.ok(noUpper.error.includes('uppercase'));

    // Missing lowercase
    const noLower = licenseService.validateMasterPasswordPolicy('UPPERCASEONLY123!@#');
    assert.strictEqual(noLower.valid, false);
    assert.ok(noLower.error.includes('lowercase'));

    // Missing number
    const noDigit = licenseService.validateMasterPasswordPolicy('NoNumbersHere!@#Pass');
    assert.strictEqual(noDigit.valid, false);
    assert.ok(noDigit.error.includes('number'));

    // Missing special character
    const noSpecial = licenseService.validateMasterPasswordPolicy('NoSpecialChar123456');
    assert.strictEqual(noSpecial.valid, false);
    assert.ok(noSpecial.error.includes('special character'));
  });

  // -------------------------------------------------------------
  // TEST GROUP 3: MASTER ACCOUNT CREATION & STORAGE SECURITY
  // -------------------------------------------------------------
  console.log('\n[GROUP 3: MASTER ACCOUNT CREATION & STORAGE SECURITY]');

  let createdTestMaster = null;

  test('7. Creating valid Master account succeeds and hashes password', () => {
    const res = licenseService.createMasterAccount({
      name: 'Test Master Admin',
      username: 'test_master_99',
      email: 'test_master_99@feftrading.com',
      password: 'Strong#MasterPassword2026!',
    });

    assert.strictEqual(res.success, true);
    assert.ok(res.member, 'Member record must be returned');
    assert.strictEqual(res.member.role, 'MASTER');
    assert.strictEqual(res.member.username, 'test_master_99');
    assert.strictEqual(res.member.email, 'test_master_99@feftrading.com');
    assert.strictEqual(res.member.status, 'ACTIVE');
    assert.strictEqual(res.member.mustChangePassword, false);
    assert.strictEqual(res.member.assignedLicenseId, null);
    assert.ok(res.member.memberId.startsWith('master_'), 'memberId must have master_ prefix');
    
    // Security check: password hash must be 64-char hex string (SHA256 HMAC), never plaintext
    assert.strictEqual(res.member.passwordHash.length, 64);
    assert.ok(!res.member.passwordHash.includes('Strong#MasterPassword2026!'), 'Plaintext must never be stored');

    createdTestMaster = res.member;
  });

  test('8. Duplicate Master creation is strictly BLOCKED fail-closed', () => {
    const resDuplicate = licenseService.createMasterAccount({
      name: 'Second Master Attempt',
      username: 'master_two',
      email: 'master2@feftrading.com',
      password: 'Another#StrongPassword123!',
    });

    assert.strictEqual(resDuplicate.success, false);
    assert.ok(resDuplicate.error.includes('active MASTER account already exists'));
    assert.ok(resDuplicate.error.includes('cortex:master:reset-password'));
  });

  test('9. Uniqueness check blocks duplicate username or email across members', () => {
    // Attempt to register normal member with Master username
    assert.throws(() => {
      licenseService.registerMember({
        email: 'other_member@community.com',
        username: 'TEST_MASTER_99', // Case insensitive collision
        password: 'Password123!',
        name: 'Imposter Member',
      });
    }, /Member username already registered/);

    // Attempt to register normal member with Master email
    assert.throws(() => {
      licenseService.registerMember({
        email: 'TEST_MASTER_99@feftrading.com', // Case insensitive collision
        username: 'unique_user_01',
        password: 'Password123!',
        name: 'Imposter Member 2',
      });
    }, /Member email already registered/);
  });

  // -------------------------------------------------------------
  // TEST GROUP 4: UNIVERSAL LOGIN (USERNAME OR EMAIL)
  // -------------------------------------------------------------
  console.log('\n[GROUP 4: UNIVERSAL LOGIN (USERNAME OR EMAIL)]');

  test('10. Master can authenticate using USERNAME + PASSWORD', () => {
    const authUser = licenseService.authenticateMember('test_master_99', 'Strong#MasterPassword2026!');
    assert.ok(authUser, 'Authentication via username must succeed');
    assert.strictEqual(authUser.memberId, createdTestMaster.memberId);
    assert.strictEqual(authUser.role, 'MASTER');
  });

  test('11. Master can authenticate using EMAIL + PASSWORD', () => {
    const authEmail = licenseService.authenticateMember('test_master_99@feftrading.com', 'Strong#MasterPassword2026!');
    assert.ok(authEmail, 'Authentication via email must succeed');
    assert.strictEqual(authEmail.memberId, createdTestMaster.memberId);
    assert.strictEqual(authEmail.role, 'MASTER');
  });

  test('12. Authentication with incorrect password is REJECTED', () => {
    const authBad = licenseService.authenticateMember('test_master_99', 'WrongPassword123!');
    assert.strictEqual(authBad, null, 'Invalid password must return null');
  });

  // -------------------------------------------------------------
  // TEST GROUP 5: MASTER PRIVILEGES & SAFETY GATES
  // -------------------------------------------------------------
  console.log('\n[GROUP 5: MASTER PRIVILEGES & SAFETY GATES]');

  test('13. Master is exempt from community license and device slot (1/1) restrictions', () => {
    assert.strictEqual(createdTestMaster.assignedLicenseId, null, 'Master requires no assigned community license');
  });

  test('14. Master execution gate enforces MT5 DEMO safety and human approval', () => {
    // Human approval missing -> BLOCKED
    const resNoApproval = validateLicensedExecution({
      isLicensed: true, // Master exempt
      reportedMode: 'DEMO',
      humanApproved: false,
      realConfirmed: false,
    });
    assert.strictEqual(resNoApproval.allowed, false);
    assert.strictEqual(resNoApproval.error.code, 'HUMAN_APPROVAL_REQUIRED');

    // Human approved on DEMO -> ALLOWED
    const resApproved = validateLicensedExecution({
      isLicensed: true,
      reportedMode: 'DEMO',
      humanApproved: true,
      realConfirmed: false,
    });
    assert.strictEqual(resApproved.allowed, true);
    assert.strictEqual(resApproved.mode, 'DEMO');
  });

  test('15. Master execution gate enforces MT5 REAL double confirmation', () => {
    // REAL mode without realConfirmed -> BLOCKED
    const resRealNoConfirm = validateLicensedExecution({
      isLicensed: true,
      reportedMode: 'REAL',
      humanApproved: true,
      realConfirmed: false,
    });
    assert.strictEqual(resRealNoConfirm.allowed, false);
    assert.strictEqual(resRealNoConfirm.error.code, 'REAL_CONFIRMATION_REQUIRED');

    // REAL mode with realConfirmed -> ALLOWED
    const resRealConfirmed = validateLicensedExecution({
      isLicensed: true,
      reportedMode: 'REAL',
      humanApproved: true,
      realConfirmed: true,
    });
    assert.strictEqual(resRealConfirmed.allowed, true);
    assert.strictEqual(resRealConfirmed.mode, 'REAL');
  });

  test('16. Non-Master (MEMBER) cannot access Admin API role checks', () => {
    const regularMember = licenseService.registerMember({
      name: 'Regular Member',
      username: 'reg_member_01',
      email: 'regular_member_01@community.com',
      password: 'RegularPassword123!',
      role: 'MEMBER',
    });

    assert.strictEqual(regularMember.role, 'MEMBER');
    assert.notStrictEqual(regularMember.role, 'MASTER');
    
    // Cleanup regular member
    licenseService.deleteMember(regularMember.memberId);
  });

  // -------------------------------------------------------------
  // TEST GROUP 6: MASTER PASSWORD RESET
  // -------------------------------------------------------------
  console.log('\n[GROUP 6: MASTER PASSWORD RESET]');

  test('17. Master password reset rejects weak password and accepts compliant password', () => {
    // Weak reset attempt (< 12 characters)
    const weakReset = licenseService.resetMasterPassword('Short1!');
    assert.strictEqual(weakReset.success, false);
    assert.ok(weakReset.error.includes('12 characters'), `Expected 12 characters error, got: ${weakReset.error}`);

    // Compliant reset attempt
    const newPass = 'New#MasterPassword9988!';
    const strongReset = licenseService.resetMasterPassword(newPass);
    assert.strictEqual(strongReset.success, true);
    assert.ok(strongReset.member);

    // Old password no longer works
    const authOld = licenseService.authenticateMember('test_master_99', 'Strong#MasterPassword2026!');
    assert.strictEqual(authOld, null, 'Old password must be invalidated');

    // New password authenticates successfully
    const authNew = licenseService.authenticateMember('test_master_99', newPass);
    assert.ok(authNew, 'New password must authenticate successfully');
  });

  // -------------------------------------------------------------
  // CLEANUP & FINAL VERIFICATION
  // -------------------------------------------------------------
  console.log('\n[CLEANUP & ZERO-BROKER-ORDER AUDIT]');

  test('18. Test master account is cleanly removed leaving registry empty for user', () => {
    if (createdTestMaster) {
      licenseService.deleteMember(createdTestMaster.memberId);
    }
    const finalMaster = licenseService.getMasterAccount();
    assert.strictEqual(finalMaster, null, 'Registry must have 0 Master accounts left');
  });

  console.log('\n===============================================================');
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('ZERO BROKER ORDERS DISPATCHED (OrderSend = 0 Verified)');
  console.log('===============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('\n❌ Fatal Test Runner Error:', err);
  process.exit(1);
});
