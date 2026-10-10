#!/usr/bin/env node
/**
 * FEF CORTEX — MASTER OWNER ACCOUNT BOOTSTRAP CLI
 * 
 * Interactive script to create the authoritative MASTER / OWNER account.
 * Run via: npm run cortex:master:create
 */

require('sucrase/register');
const readline = require('readline');
const { licenseService } = require('../src/lib/licensing/license-service');
const { licenseStore } = require('../src/lib/licensing/license-store');

let lineIterator = null;
function getLineIterator() {
  if (!lineIterator) {
    const rl = readline.createInterface({
      input: process.stdin,
      crlfDelay: Infinity,
    });
    lineIterator = rl[Symbol.asyncIterator]();
  }
  return lineIterator;
}

async function askQuestion(query) {
  process.stdout.write(query);
  const it = getLineIterator();
  const next = await it.next();
  return next.done ? '' : next.value.trim();
}

async function askHidden(query) {
  if (!process.stdin.isTTY) {
    return askQuestion(query);
  }

  return new Promise((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    stdout.write(query);

    let password = '';
    const onData = (char) => {
      const str = char.toString('utf8');
      switch (str) {
        case '\n':
        case '\r':
        case '\u0004':
          stdin.removeListener('data', onData);
          if (stdin.setRawMode) stdin.setRawMode(false);
          stdout.write('\n');
          resolve(password);
          break;
        case '\u0003': // Ctrl+C
          process.exit(1);
          break;
        case '\u0008':
        case '\x7f': // Backspace
          if (password.length > 0) {
            password = password.slice(0, -1);
            stdout.write('\b \b');
          }
          break;
        default:
          password += str;
          stdout.write('*');
          break;
      }
    };

    if (stdin.setRawMode) stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

async function main() {
  console.log('\n===============================================================');
  console.log('       FEF CORTEX — MASTER OWNER ACCOUNT BOOTSTRAP            ');
  console.log('===============================================================\n');

  // 1. Duplicate Master check
  const existingMaster = licenseService.getMasterAccount();
  if (existingMaster) {
    console.error('❌ ERROR: An active MASTER account already exists.');
    console.error(`   Identifier: ${existingMaster.username || existingMaster.email}`);
    console.error(`   Member ID : ${existingMaster.memberId}`);
    console.error('\n   To update your password or credentials, run:');
    console.error('   npm run cortex:master:reset-password\n');
    process.exit(1);
  }

  // 2. Interactive Input
  const nameInput = await askQuestion('Master Display Name [Master Owner]: ');
  const name = nameInput || 'Master Owner';

  let username = '';
  while (!username) {
    const input = await askQuestion('Master Username (e.g. riaz01, fefadmin1): ');
    const check = licenseService.validateUsernameFormat(input);
    if (!check.valid) {
      console.log(`❌ ${check.error}`);
      continue;
    }
    const cleanUser = input.trim().toLowerCase();
    if (licenseStore.getMemberByUsername(cleanUser)) {
      console.log(`❌ Username '${cleanUser}' is already registered.`);
      continue;
    }
    username = cleanUser;
  }

  let email = '';
  while (!email) {
    const input = await askQuestion('Master Email Address: ');
    const cleanEmail = input.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      console.log('❌ Please enter a valid email address.');
      continue;
    }
    if (licenseStore.getMemberByEmail(cleanEmail)) {
      console.log(`❌ Email '${cleanEmail}' is already registered.`);
      continue;
    }
    email = cleanEmail;
  }

  let password = '';
  while (!password) {
    console.log('\nPassword Requirements:');
    console.log(' - Minimum 12 characters');
    console.log(' - At least 1 uppercase letter');
    console.log(' - At least 1 lowercase letter');
    console.log(' - At least 1 number');
    console.log(' - At least 1 special character\n');

    const p1 = await askHidden('Enter Master Password: ');
    const check = licenseService.validateMasterPasswordPolicy(p1);
    if (!check.valid) {
      console.log(`❌ ${check.error}\n`);
      continue;
    }

    const p2 = await askHidden('Confirm Master Password: ');
    if (p1 !== p2) {
      console.log('❌ Passwords do not match. Please try again.\n');
      continue;
    }

    password = p1;
  }

  // 3. Create Master Account
  const result = licenseService.createMasterAccount({
    name,
    username,
    email,
    password,
  });

  if (!result.success || !result.member) {
    console.error(`\n❌ Failed to create Master account: ${result.error || 'Unknown error'}\n`);
    process.exit(1);
  }

  const member = result.member;

  console.log('\n===============================================================');
  console.log('       ✅ MASTER OWNER ACCOUNT CREATED SUCCESSFULLY          ');
  console.log('===============================================================');
  console.log(`  Display Name: ${member.name}`);
  console.log(`  Username    : ${member.username}`);
  console.log(`  Email       : ${member.email}`);
  console.log(`  Role        : ${member.role}`);
  console.log(`  Member ID   : ${member.memberId}`);
  console.log('  Status      : ACTIVE');
  console.log('  Security    : Encrypted HMAC-SHA256 (Plaintext never stored)');
  console.log('  Entitlements: Full access (Dashboard, Cockpit, TradingView,');
  console.log('                Execution, Settings, Admin Members)');
  console.log('                Community License & Device Slot 1/1 EXEMPT');
  console.log('===============================================================');
  console.log('\nYou can now log in via Web UI using either:');
  console.log(`  1. Username: ${member.username}`);
  console.log(`  2. Email   : ${member.email}`);
  console.log('===============================================================\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ Fatal error:', err.message || err);
  process.exit(1);
});

