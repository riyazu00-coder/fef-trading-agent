import crypto from 'crypto';
import { licenseStore } from '../src/lib/licensing/license-store';
import { licenseService } from '../src/lib/licensing/license-service';

const salt = 'FEF_CORTEX_MEMBER_AUTH_SALT_V1';
const testPass = 'DisposableMasterPass123!@#';
const testHash = crypto.createHmac('sha256', salt).update(testPass).digest('hex');

process.env.FEF_MASTER_USERNAME = 'fefadmin1';
process.env.FEF_MASTER_EMAIL = 'riyazu00@gmail.com';
process.env.FEF_MASTER_NAME = 'riyas';
process.env.FEF_MASTER_ID = 'master_89411f3884cc';
process.env.FEF_MASTER_PASSWORD_HASH = testHash;

console.log('Testing Environment-Backed Master Authentication...');

// 1. Verify username login
const userAuth = licenseService.authenticateMember('fefadmin1', testPass);
if (!userAuth || userAuth.memberId !== 'master_89411f3884cc' || userAuth.role !== 'MASTER') {
  console.error('❌ Username auth failed!');
  process.exit(1);
}
console.log('✓ Username auth: SUCCESS (' + userAuth.memberId + ' / ' + userAuth.role + ')');

// 2. Verify email login
const emailAuth = licenseService.authenticateMember('riyazu00@gmail.com', testPass);
if (!emailAuth || emailAuth.memberId !== 'master_89411f3884cc' || emailAuth.role !== 'MASTER') {
  console.error('❌ Email auth failed!');
  process.exit(1);
}
console.log('✓ Email auth: SUCCESS (' + emailAuth.memberId + ' / ' + emailAuth.role + ')');

// 3. Verify bad password fails
const badAuth = licenseService.authenticateMember('fefadmin1', 'WrongPassword123!');
if (badAuth !== null) {
  console.error('❌ Bad password was unexpectedly accepted!');
  process.exit(1);
}
console.log('✓ Bad password auth: REJECTED (Fail-closed verified)');

// 4. Verify case-insensitivity
const caseAuth = licenseService.authenticateMember('FEFADMIN1', testPass);
if (!caseAuth) {
  console.error('❌ Case-insensitive login failed!');
  process.exit(1);
}
console.log('✓ Case-insensitive username auth: SUCCESS');

console.log('ALL ENVIRONMENT-BACKED MASTER AUTH CHECKS PASSED.');

