import http from 'http';
import { createSessionToken } from '../src/lib/licensing/member-session-token';
import { licenseStore } from '../src/lib/licensing/license-store';
import crypto from 'crypto';

const EXPECTED_SIZE = 99806;
const EXPECTED_SHA256 = '104b63a6989b032aa48ac2e79932693a9bd0ba43c0f022354ee4ea9c82d938fc';

function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks),
        });
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function runTests() {
  console.log('===============================================================');
  console.log(' FEF CORTEX — END-TO-END CONNECTOR & ACCESS SUITE             ');
  console.log('===============================================================');

  // Test A: Anonymous /api/downloads/connector -> 401
  const anonRes = await makeRequest({
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/downloads/connector',
    method: 'GET',
  });
  if (anonRes.statusCode !== 401) {
    console.error(`❌ Test A Failed: Anon status ${anonRes.statusCode} != 401`);
    process.exit(1);
  }
  console.log('✓ [Test A] Anonymous request rejected with 401 Unauthorized (Pass)');

  // Test B: Legacy public static /downloads/FEF_HTTP_Bridge.ex5 -> 404
  const legacyRes = await makeRequest({
    hostname: '127.0.0.1',
    port: 3000,
    path: '/downloads/FEF_HTTP_Bridge.ex5',
    method: 'GET',
  });
  if (legacyRes.statusCode !== 404) {
    console.error(`❌ Test B Failed: Legacy status ${legacyRes.statusCode} != 404`);
    process.exit(1);
  }
  console.log('✓ [Test B] Legacy public static file returns 404 Not Found (Pass)');

  // Setup disposable Member
  licenseStore.deleteMember('mem_e2e_test_user');
  licenseStore.deleteMember('master_e2e_root');

  const memberToken = createSessionToken('mem_e2e_test_user', 'e2e_member@test.com', 'MEMBER');
  licenseStore.createMember({
    memberId: 'mem_e2e_test_user',
    email: 'e2e_member@test.com',
    name: 'E2E Test Member',
    username: 'e2emember',
    role: 'MEMBER',
    status: 'ACTIVE',
    passwordHash: 'dummy_hash',
    mustChangePassword: false,
    assignedLicenseId: null,
    createdAt: Date.now(),
    lastLoginAt: Date.now(),
  });

  // Test C: Authenticated Member download -> 200, 99806 bytes, exact SHA256
  const memberRes = await makeRequest({
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/downloads/connector',
    method: 'GET',
    headers: {
      Cookie: `fef_member_session=${memberToken}`,
    },
  });

  if (memberRes.statusCode !== 200) {
    console.error(`❌ Test C Failed: Member status ${memberRes.statusCode} != 200`);
    process.exit(1);
  }
  const memberBuf = memberRes.body;
  if (memberBuf.length !== EXPECTED_SIZE) {
    console.error(`❌ Test C Failed: Size ${memberBuf.length} != ${EXPECTED_SIZE}`);
    process.exit(1);
  }
  const memberHash = crypto.createHash('sha256').update(memberBuf).digest('hex');
  if (memberHash !== EXPECTED_SHA256) {
    console.error(`❌ Test C Failed: Hash ${memberHash} != ${EXPECTED_SHA256}`);
    process.exit(1);
  }
  console.log(`✓ [Test C] Member download: 200 OK, ${memberBuf.length} bytes, SHA-256 match (Pass)`);
  console.log(`  Headers: Content-Type=${memberRes.headers['content-type']}, Content-Disposition=${memberRes.headers['content-disposition']}, Cache-Control=${memberRes.headers['cache-control']}`);

  // Setup disposable Master
  const masterToken = createSessionToken('master_e2e_root', 'master_e2e@test.com', 'MASTER');
  licenseStore.createMember({
    memberId: 'master_e2e_root',
    email: 'master_e2e@test.com',
    name: 'E2E Master',
    username: 'e2emaster',
    role: 'MASTER',
    status: 'ACTIVE',
    passwordHash: 'dummy_hash',
    mustChangePassword: false,
    assignedLicenseId: null,
    createdAt: Date.now(),
    lastLoginAt: Date.now(),
  });

  // Test D: Authenticated Master download -> 200, 99806 bytes, exact SHA256
  const masterRes = await makeRequest({
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/downloads/connector',
    method: 'GET',
    headers: {
      Cookie: `fef_member_session=${masterToken}`,
    },
  });

  if (masterRes.statusCode !== 200) {
    console.error(`❌ Test D Failed: Master status ${masterRes.statusCode} != 200`);
    process.exit(1);
  }
  const masterBuf = masterRes.body;
  if (masterBuf.length !== EXPECTED_SIZE) {
    console.error(`❌ Test D Failed: Master size ${masterBuf.length} != ${EXPECTED_SIZE}`);
    process.exit(1);
  }
  const masterHash = crypto.createHash('sha256').update(masterBuf).digest('hex');
  if (masterHash !== EXPECTED_SHA256) {
    console.error(`❌ Test D Failed: Master hash mismatch`);
    process.exit(1);
  }
  console.log(`✓ [Test D] Master download: 200 OK, ${masterBuf.length} bytes, SHA-256 match (Pass)`);

  // Test E: Suspended Member -> 403
  licenseStore.updateMemberStatus('mem_e2e_test_user', 'SUSPENDED');
  const suspendedRes = await makeRequest({
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/downloads/connector',
    method: 'GET',
    headers: {
      Cookie: `fef_member_session=${memberToken}`,
    },
  });
  if (suspendedRes.statusCode !== 403) {
    console.error(`❌ Test E Failed: Suspended member status ${suspendedRes.statusCode} != 403`);
    process.exit(1);
  }
  console.log('✓ [Test E] Suspended member rejected with 403 Forbidden (Pass)');

  // Test F: MQ5 exposure check
  const mq5Res = await makeRequest({
    hostname: '127.0.0.1',
    port: 3000,
    path: '/downloads/FEF_HTTP_Bridge.mq5',
    method: 'GET',
  });
  if (mq5Res.statusCode !== 404) {
    console.error(`❌ Test F Failed: MQ5 file returned status ${mq5Res.statusCode}`);
    process.exit(1);
  }
  console.log('✓ [Test F] Source .mq5 file returns 404 Not Found (Pass)');

  // Clean up disposable accounts
  licenseStore.deleteMember('mem_e2e_test_user');
  licenseStore.deleteMember('master_e2e_root');

  console.log('===============================================================');
  console.log(' ALL END-TO-END CONNECTOR TESTS PASSED SUCCESSFULLY!          ');
  console.log('===============================================================');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
