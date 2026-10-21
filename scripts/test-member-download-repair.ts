/**
 * FEF CORTEX — MEMBERS AREA MT5 BRIDGE DOWNLOAD REPAIR VERIFICATION SUITE
 *
 * Verifies:
 * 1. Unauthenticated download requests fail closed with 401 MEMBER_AUTH_REQUIRED.
 * 2. Invalid or expired session tokens fail closed with 401 INVALID_SESSION.
 * 3. Suspended accounts fail closed with 403 MEMBER_NOT_AUTHORIZED.
 * 4. Authenticated Master sessions successfully download exact 101,348 byte EX5 binary.
 * 5. Authenticated Member sessions successfully download exact 101,348 byte EX5 binary.
 * 6. Binary contains valid MQL5 EX5 magic header (45 58 35).
 * 7. Correct streaming headers (Content-Disposition, Content-Type, Content-Length, Version, SHA-256).
 * 8. Zero raw <a download> traps remain in member portal or setup page.
 * 9. Setup guide specifies MODE_READ_ONLY as canonical default.
 * 10. Troubleshooting guide for Error 4014 and 5203 is present.
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { GET } from '../src/app/api/downloads/connector/route';
import { createSessionToken } from '../src/lib/licensing/member-session-token';
import { licenseStore } from '../src/lib/licensing/license-store';
import { CONNECTOR_RELEASE_MANIFEST, validateConnectorBinary } from '../src/lib/downloads/connector-manifest';

let passed = 0;
let failed = 0;

function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    const res = fn();
    if (res instanceof Promise) {
      return res.then(
        () => {
          console.log(`  ✓ ${name}`);
          passed++;
        },
        (err) => {
          console.error(`  ✗ ${name}`);
          console.error(`    ${err.message}`);
          failed++;
        }
      );
    } else {
      console.log(`  ✓ ${name}`);
      passed++;
    }
  } catch (err: any) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

async function runAllTests() {
  console.log('\n============================================================');
  console.log('FEF CORTEX — MEMBERS AREA DOWNLOAD REPAIR VERIFICATION SUITE');
  console.log('============================================================\n');

  // 1. Unauthenticated request -> 401
  await runTest('rejects unauthenticated requests with 401 MEMBER_AUTH_REQUIRED', async () => {
    const req = new NextRequest('http://localhost:3000/api/downloads/connector', {
      method: 'GET',
    });
    const res = await GET(req);
    assert.strictEqual(res.status, 401);
    const json = await res.json();
    assert.strictEqual(json.error, 'MEMBER_AUTH_REQUIRED');
  });

  // 2. Tampered / invalid token -> 401
  await runTest('rejects forged/tampered session tokens with 401 INVALID_SESSION', async () => {
    const req = new NextRequest('http://localhost:3000/api/downloads/connector', {
      method: 'GET',
      headers: {
        authorization: 'Bearer bad_forged_token_abc123',
      },
    });
    const res = await GET(req);
    assert.strictEqual(res.status, 401);
    const json = await res.json();
    assert.strictEqual(json.error, 'INVALID_SESSION');
  });

  // 3. Suspended account -> 403
  await runTest('rejects suspended accounts with 403 MEMBER_NOT_AUTHORIZED', async () => {
    // Create temporary suspended test member
    const suspendedId = `test_suspended_${Date.now()}`;
    const token = createSessionToken(suspendedId, 'suspended@example.com', 'MEMBER');

    licenseStore.createMember({
      memberId: suspendedId,
      email: 'suspended@example.com',
      username: `susp_${Date.now()}`,
      passwordHash: 'fakehash',
      name: 'Suspended Member',
      role: 'MEMBER',
      status: 'SUSPENDED',
      mustChangePassword: false,
      assignedLicenseId: null,
      createdAt: Date.now(),
    });

    try {
      const req = new NextRequest('http://localhost:3000/api/downloads/connector', {
        method: 'GET',
        headers: {
          'x-session-token': token,
        },
      });
      const res = await GET(req);
      assert.strictEqual(res.status, 403);
      const json = await res.json();
      assert.strictEqual(json.error, 'MEMBER_NOT_AUTHORIZED');
    } finally {
      licenseStore.deleteMember(suspendedId);
    }
  });

  // 3b. Missing member record (signed token but no member in authoritative store) -> 403 (fail closed)
  await runTest('rejects absent member records (fail-closed) with 403 MEMBER_NOT_AUTHORIZED', async () => {
    const ghostMemberId = `ghost_member_${Date.now()}`;
    // Valid cryptographic signature, but member does not exist in registry
    const token = createSessionToken(ghostMemberId, 'ghost@example.com', 'MEMBER');

    const req = new NextRequest('http://localhost:3000/api/downloads/connector', {
      method: 'GET',
      headers: {
        'x-session-token': token,
      },
    });
    const res = await GET(req);
    assert.strictEqual(res.status, 403);
    const json = await res.json();
    assert.strictEqual(json.error, 'MEMBER_NOT_AUTHORIZED');
  });

  // 4. Authenticated Master request -> 200 with exact binary
  await runTest('allows authenticated Master session to download canonical binary', async () => {
    const masterToken = createSessionToken('master_644b1816f76f', 'riyazu00@gmail.com', 'MASTER');
    const req = new NextRequest('http://localhost:3000/api/downloads/connector', {
      method: 'GET',
      headers: {
        cookie: `fef_session=${masterToken}`,
      },
    });

    const res = await GET(req);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('content-type'), 'application/octet-stream');
    assert.strictEqual(
      res.headers.get('content-disposition'),
      `attachment; filename="${CONNECTOR_RELEASE_MANIFEST.filename}"`
    );
    assert.strictEqual(
      res.headers.get('content-length'),
      CONNECTOR_RELEASE_MANIFEST.expectedSize.toString()
    );
    assert.strictEqual(res.headers.get('x-fef-binary-version'), '1.22');
    assert.strictEqual(
      res.headers.get('x-fef-sha256'),
      CONNECTOR_RELEASE_MANIFEST.expectedSha256
    );

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    assert.strictEqual(buffer.length, 101348, 'Must be exact 101,348 bytes');

    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    assert.strictEqual(sha256, CONNECTOR_RELEASE_MANIFEST.expectedSha256);

    // Verify EX5 magic header
    assert.strictEqual(buffer[0], 0x45); // 'E'
    assert.strictEqual(buffer[1], 0x58); // 'X'
    assert.strictEqual(buffer[2], 0x35); // '5'
  });

  // 5. Authenticated Member request -> 200 with exact binary
  await runTest('allows authenticated Member session to download canonical binary', async () => {
    const memberId = `test_member_${Date.now()}`;
    const memberToken = createSessionToken(memberId, 'trader@example.com', 'MEMBER');

    licenseStore.createMember({
      memberId,
      email: 'trader@example.com',
      username: `trader_${Date.now()}`,
      passwordHash: 'dummyhash',
      name: 'Active Trader',
      role: 'MEMBER',
      status: 'ACTIVE',
      mustChangePassword: false,
      assignedLicenseId: null,
      createdAt: Date.now(),
    });

    try {
      const req = new NextRequest('http://localhost:3000/api/downloads/connector', {
        method: 'GET',
        headers: {
          cookie: `fef_member_session=${memberToken}`,
        },
      });

      const res = await GET(req);
      assert.strictEqual(res.status, 200);
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      assert.strictEqual(buffer.length, 101348);
      const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
      assert.strictEqual(sha256, CONNECTOR_RELEASE_MANIFEST.expectedSha256);
    } finally {
      licenseStore.deleteMember(memberId);
    }
  });

  // 6. Binary validation fallback path verification
  runTest('validateConnectorBinary finds binary in candidate paths', () => {
    const result = validateConnectorBinary();
    assert.strictEqual(result.valid, true);
    assert(result.filePath?.includes('FEF_HTTP_Bridge.ex5'));
    assert.strictEqual(result.size, 101348);
  });

  // 7. Verify zero raw <a download> traps remain in Member Portal
  runTest('Member Portal (src/app/member/page.tsx) uses ConnectorDownloadButton without raw anchor traps', () => {
    const content = fs.readFileSync(path.resolve(process.cwd(), 'src/app/member/page.tsx'), 'utf8');
    assert(content.includes('ConnectorDownloadButton'), 'Must import and use ConnectorDownloadButton');
    assert(
      !content.includes('href="/api/downloads/connector"'),
      'Must NOT contain raw href="/api/downloads/connector" anchors'
    );
  });

  // 8. Verify zero raw <a download> traps remain in Setup Page
  runTest('Setup Page (src/app/member/setup/page.tsx) uses ConnectorDownloadButton without raw anchor traps', () => {
    const content = fs.readFileSync(path.resolve(process.cwd(), 'src/app/member/setup/page.tsx'), 'utf8');
    assert(content.includes('ConnectorDownloadButton'), 'Must import and use ConnectorDownloadButton');
    assert(
      !content.includes('href="/api/downloads/connector"'),
      'Must NOT contain raw href="/api/downloads/connector" anchors'
    );
  });

  // 9. Verify Step 4 specifies MODE_READ_ONLY as canonical default
  runTest('Setup Page Step 4 documents MODE_READ_ONLY as canonical default', () => {
    const content = fs.readFileSync(path.resolve(process.cwd(), 'src/app/member/setup/page.tsx'), 'utf8');
    assert(content.includes('MODE_READ_ONLY'), 'Step 4 must specify MODE_READ_ONLY');
    assert(content.includes('InpOperatingMode:'), 'Must document InpOperatingMode parameter');
  });

  // 10. Verify troubleshooting guidance for Error 4014 and 5203
  runTest('Setup Page provides troubleshooting guidance for Error 4014 and Error 5203', () => {
    const content = fs.readFileSync(path.resolve(process.cwd(), 'src/app/member/setup/page.tsx'), 'utf8');
    assert(content.includes('4014'), 'Must document Error 4014');
    assert(content.includes('5203'), 'Must document Error 5203');
    assert(content.includes('Navigator'), 'Must document Navigator refresh step');
    assert(content.includes('Experts'), 'Must document Experts tab confirmation');
  });

  console.log('\n------------------------------------------------------------');
  console.log(`TEST RESULTS: ${passed} Passed, ${failed} Failed`);
  console.log('------------------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});

