const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const getMasterToken = require('./get-master-token.js');

async function testProduction() {
  console.log('--- Testing Production Endpoint (Unauthenticated) ---');
  
  const unauthResult = await new Promise((resolve) => {
    https.get('https://app.feftradingsolutions.com/api/downloads/connector', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    }).on('error', (err) => resolve({ error: err.message }));
  });

  console.log('Unauthenticated status:', unauthResult.statusCode);
  console.log('Content-Type:', unauthResult.headers?.['content-type']);
  console.log('Body preview:', unauthResult.body?.slice(0, 300));

  console.log('\n--- Testing Production Endpoint (Authenticated Session) ---');
  // Use the session token from local registry or environment
  const sessionToken = process.env.FEF_SESSION_TOKEN || require('./get-master-token.js')();
  
  if (!sessionToken) {
    console.log('No session token available for authenticated test.');
    return;
  }

  const authResult = await new Promise((resolve) => {
    const req = https.request('https://app.feftradingsolutions.com/api/downloads/connector', {
      method: 'GET',
      headers: {
        'Cookie': `fef_session=${sessionToken}; fef_member_session=${sessionToken}`,
        'Authorization': `Bearer ${sessionToken}`
      }
    }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          size: buffer.length,
          sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
          headerPreview: buffer.slice(0, 16).toString('hex'),
          bodyPreview: buffer.length < 500 ? buffer.toString('utf8') : null
        });
      });
    });
    req.on('error', (err) => resolve({ error: err.message }));
    req.end();
  });

  console.log('Authenticated status:', authResult.statusCode);
  console.log('Content-Type:', authResult.headers?.['content-type']);
  console.log('Content-Disposition:', authResult.headers?.['content-disposition']);
  console.log('X-FEF-Binary-Version:', authResult.headers?.['x-fef-binary-version']);
  console.log('X-FEF-SHA256:', authResult.headers?.['x-fef-sha256']);
  console.log('Received byte size:', authResult.size);
  console.log('Calculated SHA256:', authResult.sha256);
  if (authResult.bodyPreview) {
    console.log('Body (if text/error):', authResult.bodyPreview);
  }
}

testProduction().catch(console.error);
