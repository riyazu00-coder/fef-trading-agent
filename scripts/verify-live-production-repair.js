const https = require('https');
const crypto = require('crypto');
const getMasterToken = require('./get-master-token.js');

async function testUrl(url, options = {}) {
  return new Promise((resolve) => {
    const req = https.request(url, options, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          buffer: Buffer.concat(chunks)
        });
      });
    });
    req.on('error', err => resolve({ error: err.message }));
    req.end();
  });
}

async function runLiveVerification() {
  console.log('===============================================================');
  console.log('FEF CORTEX — LIVE PRODUCTION DEPLOYMENT ACCEPTANCE VERIFICATION');
  console.log('Target: https://app.feftradingsolutions.com');
  console.log('===============================================================\n');

  // 1. Check anonymous download rejection
  const unauth = await testUrl('https://app.feftradingsolutions.com/api/downloads/connector');
  console.log('1. Unauthenticated download gate:');
  console.log(`   HTTP Status: ${unauth.statusCode} (Expected: 401)`);
  console.log(`   Content-Type: ${unauth.headers['content-type']}`);
  const unauthJson = JSON.parse(unauth.buffer.toString('utf8'));
  console.log(`   Error code: ${unauthJson.error}`);
  console.log(`   Result: ${unauth.statusCode === 401 && unauthJson.error === 'MEMBER_AUTH_REQUIRED' ? 'PASS' : 'FAIL'}`);

  // 2. Check forged token rejection
  const forged = await testUrl('https://app.feftradingsolutions.com/api/downloads/connector', {
    headers: { 'Authorization': 'Bearer forged_token_invalid_12345' }
  });
  console.log('\n2. Forged token download gate:');
  console.log(`   HTTP Status: ${forged.statusCode} (Expected: 401)`);
  const forgedJson = JSON.parse(forged.buffer.toString('utf8'));
  console.log(`   Error code: ${forgedJson.error}`);
  console.log(`   Result: ${forged.statusCode === 401 && forgedJson.error === 'INVALID_SESSION' ? 'PASS' : 'FAIL'}`);

  // 3. Check static anonymous download (must not exist)
  const staticCheck = await testUrl('https://app.feftradingsolutions.com/downloads/FEF_HTTP_Bridge.ex5');
  console.log('\n3. Static public download exposure check:');
  console.log(`   HTTP Status: ${staticCheck.statusCode} (Expected: 404)`);
  console.log(`   Result: ${staticCheck.statusCode === 404 ? 'PASS (Protected - Not exposed statically)' : 'FAIL'}`);

  // 4. Authenticated Master download
  const sessionToken = getMasterToken();
  const auth = await testUrl('https://app.feftradingsolutions.com/api/downloads/connector', {
    headers: {
      'Cookie': `fef_member_session=${sessionToken}`,
      'Authorization': `Bearer ${sessionToken}`
    }
  });

  console.log('\n4. Authenticated Master download:');
  console.log(`   HTTP Status: ${auth.statusCode} (Expected: 200)`);
  console.log(`   Content-Type: ${auth.headers['content-type']} (Expected: application/octet-stream)`);
  console.log(`   Content-Disposition: ${auth.headers['content-disposition']}`);
  console.log(`   X-FEF-Binary-Version: ${auth.headers['x-fef-binary-version']}`);
  console.log(`   X-FEF-SHA256: ${auth.headers['x-fef-sha256']}`);
  console.log(`   Byte size: ${auth.buffer.length} bytes (Expected: 101348)`);

  const sha256 = crypto.createHash('sha256').update(auth.buffer).digest('hex');
  console.log(`   Calculated SHA256: ${sha256}`);
  console.log(`   SHA256 Match: ${sha256 === '194d577313291a5dad2945888f1e24b7b8dd94104c9da88b79df9db5ecaf55f5' ? 'PASS' : 'FAIL'}`);

  const magic = auth.buffer.slice(0, 4).toString('hex');
  console.log(`   Magic Header: ${magic} (Expected: 45583502 -> EX5\\x02)`);
  console.log(`   Magic Match: ${magic === '45583502' ? 'PASS' : 'FAIL'}`);

  console.log('\n===============================================================');
  const allPassed = unauth.statusCode === 401 &&
    forged.statusCode === 401 &&
    staticCheck.statusCode === 404 &&
    auth.statusCode === 200 &&
    auth.buffer.length === 101348 &&
    sha256 === '194d577313291a5dad2945888f1e24b7b8dd94104c9da88b79df9db5ecaf55f5' &&
    magic === '45583502';

  console.log(`LIVE ACCEPTANCE: ${allPassed ? '100% ALL GATES PASSED' : 'VERIFICATION FAILED'}`);
  console.log('===============================================================');
}

runLiveVerification().catch(console.error);

