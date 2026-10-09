import assert from 'assert';
import { CORTEX_WHATSAPP_CONFIG, SUPPORT_CONFIG } from '../src/lib/config/support-config';

console.log('--- Testing WhatsApp & Support Configuration Truthfulness ---');

// 1. Verify required message text
const REQUIRED_MESSAGE = 
  'Hello FEF Trading Solutions,\nI would like to get access to FEF CORTEX and the official MT5 EA.\nPlease help me with onboarding and setup.';

assert.strictEqual(
  CORTEX_WHATSAPP_CONFIG.prefilledMessage.trim(),
  REQUIRED_MESSAGE.trim(),
  'Prefilled WhatsApp message must exactly match specified requirement'
);

// 2. Check configuration state properties
assert.ok(typeof CORTEX_WHATSAPP_CONFIG.isConfigured === 'boolean', 'isConfigured must be boolean');
assert.ok(typeof CORTEX_WHATSAPP_CONFIG.phoneNumber === 'string', 'phoneNumber must be string');
assert.ok(typeof CORTEX_WHATSAPP_CONFIG.getWhatsAppUrl === 'function', 'getWhatsAppUrl must be a function');

// 3. Invariant: No fake 1-800 or placeholder numbers
assert.ok(!CORTEX_WHATSAPP_CONFIG.phoneNumber.includes('1800'), 'Phone number must not contain placeholder 1800');
assert.ok(!CORTEX_WHATSAPP_CONFIG.phoneNumber.includes('333-8723'), 'Phone number must not contain placeholder 333-8723');

// 4. Invariant: No unverified 24/7 or SLA claims in SUPPORT_CONFIG
assert.ok(!SUPPORT_CONFIG.deskStatus.includes('24/7'), 'deskStatus must not claim 24/7');
assert.ok(!SUPPORT_CONFIG.supportMessage.includes('24/7'), 'supportMessage must not claim 24/7');

for (const channel of SUPPORT_CONFIG.channels) {
  assert.ok(channel.status !== ('ACTIVE_24_7' as any), `Channel ${channel.id} must not have status ACTIVE_24_7`);
  assert.ok(!channel.statusLabel.includes('24/7'), `Channel ${channel.id} statusLabel must not claim 24/7`);
  assert.ok(!channel.description.includes('SLA'), `Channel ${channel.id} must not advertise unverified SLA`);
  assert.ok(!channel.description.includes('< 15 minute'), `Channel ${channel.id} must not advertise 15 minute response times`);
  assert.ok(!channel.description.includes('seat licenses'), `Channel ${channel.id} must not claim seat licenses`);
  assert.ok(!channel.description.includes('API key provisioning'), `Channel ${channel.id} must not claim API key provisioning`);
  if (channel.destination) {
    assert.ok(!channel.destination.includes('18003338723'), `Channel ${channel.id} destination must not contain placeholder number`);
  }
}

console.log('✅ Task 1 Test Passed: Support & WhatsApp config is truthful and clean.');
