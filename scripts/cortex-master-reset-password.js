#!/usr/bin/env node
/**
 * FEF CORTEX — MASTER OWNER PASSWORD RESET CLI
 * 
 * Interactive script to reset the password for the authoritative MASTER account.
 * Run via: npm run cortex:master:reset-password
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
  console.log('       FEF CORTEX — MASTER OWNER PASSWORD RESET               ');
  console.log('===============================================================\n');

  // 1. Verify an active Master exists
  const master = licenseService.getMasterAccount();
  if (!master) {
    console.error('❌ ERROR: No active MASTER account exists.');
    console.error('   Please create a Master account first:');
    console.error('   npm run cortex:master:create\n');
    process.exit(1);
  }

  console.log(`Found active Master account:`);
  console.log(`  Display Name: ${master.name}`);
  console.log(`  Username    : ${master.username || '(not set)'}`);
  console.log(`  Email       : ${master.email}`);
  console.log(`  Member ID   : ${master.memberId}\n`);

  // 2. Confirm identifier
  const identifierInput = await askQuestion('Confirm Master Username or Email to proceed: ');
  const cleanId = identifierInput.trim().toLowerCase();

  const isMatch = (master.username && master.username.toLowerCase() === cleanId) ||
                  (master.email && master.email.toLowerCase() === cleanId);

  if (!isMatch) {
    console.error('\n❌ ERROR: Identifier did not match the active Master account. Reset aborted.\n');
    process.exit(1);
  }

  // 3. New password input with strict validation
  let newPassword = '';
  while (!newPassword) {
    console.log('\nNew Password Requirements:');
    console.log(' - Minimum 12 characters');
    console.log(' - At least 1 uppercase letter');
    console.log(' - At least 1 lowercase letter');
    console.log(' - At least 1 number');
    console.log(' - At least 1 special character\n');

    const p1 = await askHidden('Enter New Master Password: ');
    const check = licenseService.validateMasterPasswordPolicy(p1);
    if (!check.valid) {
      console.log(`❌ ${check.error}\n`);
      continue;
    }

    const p2 = await askHidden('Confirm New Master Password: ');
    if (p1 !== p2) {
      console.log('❌ Passwords do not match. Please try again.\n');
      continue;
    }

    newPassword = p1;
  }

  // 4. Perform password update
  const res = licenseService.resetMasterPassword(newPassword);
  if (!res.success) {
    console.error(`\n❌ Failed to reset Master password: ${res.error}\n`);
    process.exit(1);
  }

  console.log('\n===============================================================');
  console.log('       ✅ MASTER PASSWORD RESET SUCCESSFULLY                  ');
  console.log('===============================================================');
  console.log(`  Master Username : ${master.username}`);
  console.log(`  Master Email    : ${master.email}`);
  console.log('  Status          : UPDATED');
  console.log('  Security        : Re-encrypted with HMAC-SHA256');
  console.log('===============================================================');
  console.log('\nYou can now log in using the new password.\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ Fatal error:', err.message || err);
  process.exit(1);
});

