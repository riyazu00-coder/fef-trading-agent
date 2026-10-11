#!/usr/bin/env node
/**
 * FEF CORTEX — PRODUCTION MASTER PROVISIONING UTILITY
 * 
 * Safely computes the cryptographic HMAC-SHA256 password hash for the Master Owner
 * and provides secure automated or manual Vercel production provisioning.
 *
 * SAFETY RULES:
 * - Plaintext password is NEVER printed, logged, or saved to disk.
 * - Password hash (FEF_MASTER_PASSWORD_HASH) is NEVER printed or logged.
 * - Password input is masked in interactive TTY sessions (displays asterisks or silent).
 * - Empty passwords are strictly rejected.
 * - Master password policy (minimum 12 chars, upper, lower, number, special) is enforced.
 * - Ctrl+C is handled cleanly with exit code 1.
 * - Uses exact HMAC-SHA256 derivation as FEF CORTEX authentication.
 * - Confirms with user before modifying any Vercel environment variables.
 * - When provisioning to Vercel, values are piped via stdin to prevent command-line exposure.
 */

const crypto = require('crypto');
const readline = require('readline');
const { spawnSync } = require('child_process');

const SALT = process.env.FEF_MEMBER_SALT || 'FEF_CORTEX_MEMBER_AUTH_SALT_V1';

const MASTER_PROFILE = {
  name: 'riyas',
  username: 'fefadmin1',
  email: 'riyazu00@gmail.com',
  memberId: 'master_89411f3884cc',
};

function hashPassword(password) {
  return crypto.createHmac('sha256', SALT).update(password).digest('hex');
}

function validateMasterPasswordPolicy(password) {
  if (!password || typeof password !== 'string') {
    return { valid: false, error: 'Password is required and cannot be empty.' };
  }
  if (password.length < 12) {
    return { valid: false, error: 'Master password must be at least 12 characters long.' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'Master password must contain at least 1 uppercase letter.' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: 'Master password must contain at least 1 lowercase letter.' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: 'Master password must contain at least 1 number.' };
  }
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password)) {
    return { valid: false, error: 'Master password must contain at least 1 special character.' };
  }
  return { valid: true };
}

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

async function askPlain(query) {
  process.stdout.write(query);
  const it = getLineIterator();
  const next = await it.next();
  return next.done ? null : next.value.trim();
}

async function askHidden(query) {
  if (!process.stdin.isTTY) {
    // Non-interactive fallback (e.g. piped input in automated tests)
    return askPlain(query);
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
        case '\u0004': // EOF
          stdin.removeListener('data', onData);
          if (stdin.setRawMode) stdin.setRawMode(false);
          stdout.write('\n');
          resolve(password);
          break;
        case '\u0003': // Ctrl+C
          if (stdin.setRawMode) stdin.setRawMode(false);
          stdout.write('\n[Cancelled]\n');
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
          if (!char[0] || char[0] < 32) break;
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

function setVercelEnvVar(name, value, isSensitive = false) {
  process.stdout.write(`  Configuring ${name} on Vercel (production)... `);
  const args = ['vercel', 'env', 'add', name, 'production', '--force', '-y'];
  if (isSensitive) {
    args.push('--sensitive');
  } else {
    args.push('--no-sensitive');
  }

  const result = spawnSync('npx', args, {
    input: Buffer.from(value),
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  if (result.status === 0) {
    console.log('✓ OK');
    return true;
  } else {
    console.log('❌ FAILED');
    const err = (result.stderr || result.stdout || '').trim();
    if (err) {
      console.error(`    Details: ${err.split('\n')[0]}`);
    }
    return false;
  }
}

async function main() {
  console.log('===============================================================');
  console.log(' FEF CORTEX — MASTER PRODUCTION CREDENTIAL PROVISIONING        ');
  console.log('===============================================================');
  console.log('');
  console.log('Configuring Production Master Account:');
  console.log(`  Display Name : ${MASTER_PROFILE.name}`);
  console.log(`  Username     : ${MASTER_PROFILE.username}`);
  console.log(`  Email        : ${MASTER_PROFILE.email}`);
  console.log(`  Member ID    : ${MASTER_PROFILE.memberId}`);
  console.log('');

  let password = '';
  while (!password) {
    console.log('Master Password Requirements:');
    console.log(' - Minimum 12 characters');
    console.log(' - At least 1 uppercase letter');
    console.log(' - At least 1 lowercase letter');
    console.log(' - At least 1 number');
    console.log(' - At least 1 special character');
    console.log('');

    const p1 = await askHidden('Master Password: ');
    if (p1 === null) {
      console.log('\n[Input stream closed]');
      process.exit(1);
    }
    if (!p1) {
      console.log('❌ Error: Password cannot be empty.\n');
      if (!process.stdin.isTTY) process.exit(1);
      continue;
    }

    const check = validateMasterPasswordPolicy(p1);
    if (!check.valid) {
      console.log(`❌ Error: ${check.error}\n`);
      if (!process.stdin.isTTY) process.exit(1);
      continue;
    }

    const p2 = await askHidden('Confirm Master Password: ');
    if (p2 === null) {
      console.log('\n[Input stream closed]');
      process.exit(1);
    }
    if (p1 !== p2) {
      console.log('❌ Error: Passwords do not match. Please try again.\n');
      if (!process.stdin.isTTY) process.exit(1);
      continue;
    }

    password = p1;
  }

  const passwordHash = hashPassword(password);

  console.log('');
  console.log('---------------------------------------------------------------');
  console.log('✓ Cryptographic HMAC-SHA256 Hash Generated Successfully');
  console.log('✓ Master Password Verification Complete');
  console.log('---------------------------------------------------------------');
  console.log('');
  console.log('Target Environment Variables for Vercel Production:');
  console.log('  • FEF_MASTER_USERNAME       = fefadmin1');
  console.log('  • FEF_MASTER_EMAIL          = riyazu00@gmail.com');
  console.log('  • FEF_MASTER_NAME           = riyas');
  console.log('  • FEF_MASTER_ID             = master_89411f3884cc');
  console.log('  • FEF_MASTER_PASSWORD_HASH  = [HMAC-SHA256 Secret - Protected]');
  console.log('  • FEF_MEMBER_SALT           = [HMAC-SHA256 Salt - Protected]');
  console.log('');

  const answer = await askPlain('Proceed with production Master provisioning to Vercel? [y/N]: ');
  console.log('');

  if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
    console.log('Applying environment variables to Vercel production...');
    const okUsername = setVercelEnvVar('FEF_MASTER_USERNAME', MASTER_PROFILE.username, false);
    const okEmail = setVercelEnvVar('FEF_MASTER_EMAIL', MASTER_PROFILE.email, false);
    const okName = setVercelEnvVar('FEF_MASTER_NAME', MASTER_PROFILE.name, false);
    const okId = setVercelEnvVar('FEF_MASTER_ID', MASTER_PROFILE.memberId, false);
    const okHash = setVercelEnvVar('FEF_MASTER_PASSWORD_HASH', passwordHash, true);
    const okSalt = setVercelEnvVar('FEF_MEMBER_SALT', SALT, true);

    console.log('');
    if (okUsername && okEmail && okName && okId && okHash && okSalt) {
      console.log('===============================================================');
      console.log('✓ PRODUCTION MASTER ACCOUNT SUCCESSFULLY PROVISIONED ON VERCEL ');
      console.log('===============================================================');
      console.log('Note: Redeploy your Vercel project or trigger a new build for');
      console.log('the new environment variables to take effect in production.');
    } else {
      console.log('⚠️ Some variables failed to apply automatically.');
      console.log('Please ensure you are authenticated to Vercel CLI (`npx vercel login`).');
    }
  } else {
    console.log('Production provisioning skipped by user.');
    console.log('Hash generated and verified without modifying Vercel.');
  }

  console.log('');
  console.log('===============================================================');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal error:', err.message || err);
    process.exit(1);
  });
}

module.exports = {
  hashPassword,
  validateMasterPasswordPolicy,
  askHidden,
  askPlain,
  MASTER_PROFILE,
};
