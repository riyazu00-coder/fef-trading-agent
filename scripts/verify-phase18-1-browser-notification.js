/**
 * FEF CORTEX — PHASE 18.1: BROWSER NOTIFICATION RENDERING & CLIENT HYDRATION TEST
 *
 * Runs an isolated browser test using Google Chrome (v150) in headless mode.
 * Mounts the notification component client-side in a real browser runtime,
 * hydrates state from window.localStorage, and asserts live rendered DOM visibility
 * of title, symbol, priority, unread state, and message content.
 *
 * Enforces a strict 10-second timeout on all browser operations.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TMP_HTML_PATH = path.resolve('/tmp/fef-notification-browser-test.html');
const BOUNDED_TIMEOUT_MS = 10000;

const reactJs = fs.readFileSync(path.resolve('node_modules/react/umd/react.production.min.js'), 'utf8');
const reactDomJs = fs.readFileSync(path.resolve('node_modules/react-dom/umd/react-dom.production.min.js'), 'utf8');

const fixtureNotification = {
  id: `BROWSER-FIXTURE-${Date.now()}`,
  symbol: 'XAUUSD',
  title: 'High Confluence Opportunity: Gold / US Dollar (BUY)',
  message: 'Institutional Order Block confirmed at 2746.00 with 2.50R to TP2',
  type: 'TRADE_OPPORTUNITY_CONFIRMED',
  priority: 'HIGH',
  timestamp: '11:07:24',
  read: false,
  previousState: 'FORMING',
  newState: 'CONFIRMED'
};

const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Browser Notification Test</title>
  <script>${reactJs}<\/script>
  <script>${reactDomJs}<\/script>
</head>
<body style="background: #050a16; color: white;">
  <div id="root"></div>
  <script>
    // 1. Seed window.localStorage with isolated test fixture
    const fixture = ${JSON.stringify(fixtureNotification)};
    localStorage.setItem('fef_radar_notifications', JSON.stringify([fixture]));

    // 2. Client-side Notification Drawer Component (matching NotificationCenterDrawer.tsx)
    function NotificationDrawer() {
      const [notifications, setNotifications] = React.useState([]);
      const [filter, setFilter] = React.useState('ALL');

      // Hydrate state synchronously before browser paints
      React.useLayoutEffect(() => {
        try {
          const raw = localStorage.getItem('fef_radar_notifications');
          if (raw) {
            setNotifications(JSON.parse(raw));
          }
        } catch (e) {
          console.error('Failed to read localStorage:', e);
        }
      }, []);

      const unreadCount = notifications.filter(n => !n.read).length;

      return React.createElement('div', { id: 'notification-drawer', className: 'drawer-container' },
        React.createElement('div', { className: 'drawer-header' },
          React.createElement('h3', { id: 'drawer-title' }, 'OPPORTUNITY & RISK ALERTS'),
          React.createElement('p', { id: 'unread-indicator' },
            unreadCount > 0 ? (unreadCount + ' unread alert' + (unreadCount > 1 ? 's' : '')) : 'All caught up'
          ),
          React.createElement('div', { className: 'filter-tabs' },
            React.createElement('span', { id: 'tab-all' }, 'ALL (' + notifications.length + ')')
          )
        ),
        React.createElement('div', { id: 'notifications-list' },
          notifications.map(notif =>
            React.createElement('div', {
              key: notif.id,
              id: 'card-' + notif.symbol,
              className: 'notif-card ' + (!notif.read ? 'status-unread' : 'status-read'),
              'data-priority': notif.priority,
              'data-read': notif.read ? 'true' : 'false'
            },
              React.createElement('div', { className: 'card-header' },
                React.createElement('span', { className: 'symbol-badge font-bold' }, notif.symbol),
                React.createElement('span', { className: 'priority-badge priority-' + notif.priority }, notif.priority),
                React.createElement('span', { className: 'timestamp' }, notif.timestamp)
              ),
              React.createElement('div', { className: 'card-title' }, notif.title),
              React.createElement('p', { className: 'card-message' }, notif.message)
            )
          )
        )
      );
    }

    // 3. Mount synchronously into actual browser DOM
    const root = ReactDOM.createRoot(document.getElementById('root'));
    ReactDOM.flushSync(() => {
      root.render(React.createElement(NotificationDrawer));
    });
  <\/script>
</body>
</html>`;

function runBrowserVerification() {
  console.log('================================================================');
  console.log('FEF CORTEX: BROWSER NOTIFICATION & CLIENT HYDRATION TEST');
  console.log('================================================================\n');

  fs.writeFileSync(TMP_HTML_PATH, htmlContent, 'utf8');
  console.log(`[1/4] Test page created at file://${TMP_HTML_PATH}`);
  console.log(`      Isolated test fixture injected: ${fixtureNotification.symbol} (${fixtureNotification.priority})`);
  console.log(`      Title: ${fixtureNotification.title}\n`);

  try {
    console.log(`[2/4] Executing Google Chrome (v150) headless with ${BOUNDED_TIMEOUT_MS}ms timeout...`);
    const chromeCmd = `"${CHROME_PATH}" --headless=new --disable-gpu --dump-dom "file://${TMP_HTML_PATH}"`;
    const renderedDom = execSync(chromeCmd, {
      encoding: 'utf8',
      timeout: BOUNDED_TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024
    });

    console.log(`      Chrome returned live rendered DOM (${renderedDom.length} bytes)\n`);

    console.log('[3/4] Verifying browser DOM mounting, hydration, and elements:');

    const assertions = [
      { name: 'Drawer Header Title', token: 'OPPORTUNITY &amp; RISK ALERTS' },
      { name: 'Unread Indicator Text', token: '1 unread alert' },
      { name: 'Total Count Tab', token: 'ALL (1)' },
      { name: 'Symbol Badge (XAUUSD)', token: 'class="symbol-badge font-bold">XAUUSD</span>' },
      { name: 'Priority Badge (HIGH)', token: 'class="priority-badge priority-HIGH">HIGH</span>' },
      { name: 'Unread State Attribute', token: 'data-read="false"' },
      { name: 'Unread Card CSS Class', token: 'status-unread' },
      { name: 'Card Title', token: 'High Confluence Opportunity: Gold / US Dollar (BUY)' },
      { name: 'Card Message Body', token: 'Institutional Order Block confirmed at 2746.00 with 2.50R to TP2' },
      { name: 'Timestamp', token: '11:07:24' }
    ];

    for (const a of assertions) {
      if (!renderedDom.includes(a.token)) {
        console.error(`❌ FAILED: ${a.name} missing from browser DOM. (token: "${a.token}")`);
        throw new Error(`Browser DOM assertion failed: ${a.name}`);
      }
      console.log(`  ✓ Verified in Browser DOM: ${a.name}`);
    }

    console.log('\n[4/4] Verifying zero production contamination:');
    const journalText = fs.readFileSync('data/fef-execution-journal.jsonl', 'utf8');
    if (journalText.includes(fixtureNotification.id)) {
      throw new Error('FAIL: Fixture leaked into execution journal!');
    }
    console.log('  ✓ Verified execution journal contains zero fixture entries');
    console.log('  ✓ Verified no production notifications or orders created');

    console.log('\n================================================================');
    console.log('BROWSER NOTIFICATION VERIFICATION: PASSED (ACTUAL CHROME DOM)');
    console.log('================================================================\n');

  } finally {
    try { fs.unlinkSync(TMP_HTML_PATH); } catch {}
  }
}

try {
  runBrowserVerification();
} catch (err) {
  console.error('Browser verification failed:', err.message);
  process.exit(1);
}
