const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SCREENSHOT_DIR = '/Users/mac/.gemini/antigravity/brain/fa54ad24-3b14-4fde-a263-ed5c6dfd2025/screenshots';

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const targets = [
  { name: 'cockpit', url: 'http://127.0.0.1:3055/cockpit', shot: 'localhost-cockpit.png', domFile: '/tmp/cockpit-dom.html' },
  { name: 'markets', url: 'http://127.0.0.1:3055/markets', shot: 'localhost-markets.png', domFile: '/tmp/markets-dom.html' },
  { name: 'settings', url: 'http://127.0.0.1:3055/settings', shot: 'localhost-settings.png', domFile: '/tmp/settings-dom.html' },
  { name: 'agents', url: 'http://127.0.0.1:3055/agents', shot: 'localhost-agents.png', domFile: '/tmp/agents-dom.html' }
];

console.log('================================================================');
console.log('FEF CORTEX: REAL LOCALHOST BROWSER VERIFICATION (PORT 3055)');
console.log('================================================================\n');

for (const target of targets) {
  const shotPath = path.join(SCREENSHOT_DIR, target.shot);
  console.log(`[Testing ${target.name.toUpperCase()}] URL: ${target.url}`);

  try {
    // 1. Dump DOM
    const dumpCmd = `"${CHROME_PATH}" --headless=new --disable-gpu --virtual-time-budget=5000 --dump-dom "${target.url}" > "${target.domFile}" 2>/dev/null`;
    execSync(dumpCmd, { timeout: 15000 });
    const dom = fs.readFileSync(target.domFile, 'utf8');
    console.log(`  ✓ DOM rendered: ${dom.length} bytes`);

    // Verify key elements
    if (dom.includes('FEF') || dom.includes('CORTEX') || dom.includes('Trading')) {
      console.log(`  ✓ Branding verified in DOM`);
    } else {
      console.error(`  ❌ Branding missing from DOM`);
    }

    // 2. Capture Screenshot
    const shotCmd = `"${CHROME_PATH}" --headless=new --disable-gpu --window-size=1440,900 --virtual-time-budget=5000 --screenshot="${shotPath}" "${target.url}" 2>/dev/null`;
    execSync(shotCmd, { timeout: 15000 });
    if (fs.existsSync(shotPath)) {
      const stats = fs.statSync(shotPath);
      console.log(`  ✓ Screenshot captured: ${target.shot} (${stats.size} bytes)`);
    } else {
      console.error(`  ❌ Screenshot failed to write: ${shotPath}`);
    }
  } catch (err) {
    console.error(`  ❌ Error verifying ${target.name}:`, err.message);
  }
  console.log('');
}

console.log('================================================================');
console.log('LOCALHOST BROWSER VERIFICATION COMPLETE');
console.log('================================================================');
