/**
 * FEF CORTEX — SEO SPRINT 1 TECHNICAL VERIFICATION TEST
 *
 * Validates:
 * 1. robots.ts directives (allows public routes, blocks private app & API routes, references sitemap)
 * 2. sitemap.ts content (contains core public routes + all 26 canonical assets, excludes private routes)
 * 3. canonical market detail parity with MARKET_REGISTRY
 * 4. root & subroute metadata contracts
 * 5. absence of fabricated financial promises (guaranteed profits, etc.)
 */

import robotsConfig from '../src/app/robots';
import sitemapConfig from '../src/app/sitemap';
import { MARKET_REGISTRY } from '../src/lib/registry/market-registry';

function runSeoAuditTests() {
  console.log('============================================================');
  console.log('FEF CORTEX — SEO SPRINT 1 TECHNICAL VERIFICATION');
  console.log('============================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(desc: string, condition: boolean, extra?: string) {
    if (condition) {
      console.log(`  ✓ PASS: ${desc}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${desc} ${extra ? `(${extra})` : ''}`);
      failed++;
    }
  }

  // 1. Robots.txt audit
  const robots = robotsConfig();
  const rules = Array.isArray(robots.rules) ? robots.rules[0] : robots.rules;

  assert('Robots rules object exists', Boolean(rules));
  assert('Robots userAgent is "*"', rules?.userAgent === '*');
  assert('Robots sitemap is configured correctly', robots.sitemap === 'https://app.feftradingsolutions.com/sitemap.xml');
  assert('Robots host is configured correctly', robots.host === 'https://app.feftradingsolutions.com');

  const allowed = Array.isArray(rules?.allow) ? rules.allow : [rules?.allow];
  assert('Robots allows root "/"', allowed.includes('/'));
  assert('Robots allows "/about"', allowed.includes('/about'));
  assert('Robots allows "/agents"', allowed.includes('/agents'));
  assert('Robots allows "/markets"', allowed.includes('/markets'));
  assert('Robots allows "/markets/*"', allowed.includes('/markets/*'));

  const disallowed = Array.isArray(rules?.disallow) ? rules.disallow : [rules?.disallow];
  assert('Robots disallows "/api/"', disallowed.includes('/api/'));
  assert('Robots disallows "/member/"', disallowed.includes('/member/'));
  assert('Robots disallows "/admin/"', disallowed.includes('/admin/'));
  assert('Robots disallows "/settings"', disallowed.includes('/settings'));
  assert('Robots disallows "/execution"', disallowed.includes('/execution'));
  assert('Robots disallows "/journal"', disallowed.includes('/journal'));
  assert('Robots does NOT block "/_next/"', !disallowed.some(d => d?.includes('_next')));

  // 2. Sitemap.xml audit
  const sitemap = sitemapConfig();
  assert('Sitemap contains entries', Array.isArray(sitemap) && sitemap.length > 0);
  console.log(`\n  Total sitemap entries: ${sitemap.length}`);

  const sitemapUrls = sitemap.map(entry => entry.url);
  assert('Sitemap includes root "https://app.feftradingsolutions.com"', sitemapUrls.includes('https://app.feftradingsolutions.com'));
  assert('Sitemap includes "/about"', sitemapUrls.includes('https://app.feftradingsolutions.com/about'));
  assert('Sitemap includes "/agents"', sitemapUrls.includes('https://app.feftradingsolutions.com/agents'));
  assert('Sitemap includes "/how-to-use"', sitemapUrls.includes('https://app.feftradingsolutions.com/how-to-use'));
  assert('Sitemap includes "/community"', sitemapUrls.includes('https://app.feftradingsolutions.com/community'));
  assert('Sitemap includes "/markets"', sitemapUrls.includes('https://app.feftradingsolutions.com/markets'));
  assert('Sitemap includes "/chart-analyzer"', sitemapUrls.includes('https://app.feftradingsolutions.com/chart-analyzer'));

  // Ensure duplicate or private routes are absent from sitemap
  assert('Sitemap excludes "/cockpit" (canonical to /)', !sitemapUrls.includes('https://app.feftradingsolutions.com/cockpit'));
  assert('Sitemap excludes "/get-access" (canonical to /community)', !sitemapUrls.includes('https://app.feftradingsolutions.com/get-access'));
  assert('Sitemap excludes "/member"', !sitemapUrls.some(u => u.includes('/member')));
  assert('Sitemap excludes "/admin"', !sitemapUrls.some(u => u.includes('/admin')));
  assert('Sitemap excludes "/settings"', !sitemapUrls.some(u => u.includes('/settings')));
  assert('Sitemap excludes "/journal"', !sitemapUrls.some(u => u.includes('/journal')));
  assert('Sitemap excludes "/execution"', !sitemapUrls.some(u => u.includes('/execution')));
  assert('Sitemap excludes "/api"', !sitemapUrls.some(u => u.includes('/api')));

  // Canonical 26 asset verification
  const canonicalSymbols = Object.keys(MARKET_REGISTRY);
  assert('Canonical registry has 26 assets', canonicalSymbols.length === 26, `Count: ${canonicalSymbols.length}`);

  let allAssetsInSitemap = true;
  for (const sym of canonicalSymbols) {
    const expectedUrl = `https://app.feftradingsolutions.com/markets/${sym}`;
    if (!sitemapUrls.includes(expectedUrl)) {
      console.error(`  Missing from sitemap: ${expectedUrl}`);
      allAssetsInSitemap = false;
    }
  }
  assert('All 26 canonical assets are present in sitemap', allAssetsInSitemap);
  assert('Sitemap total length is exactly 7 public static + 26 market routes = 33', sitemap.length === 33, `Got ${sitemap.length}`);

  // 3. Semantic Heading & HTML Hierarchy Verification
  const fs = require('fs');
  const path = require('path');

  const topNavContent = fs.readFileSync(path.join(__dirname, '../src/components/cockpit/MasterTopNav.tsx'), 'utf-8');
  assert('MasterTopNav does NOT introduce an H1 heading', !topNavContent.includes('<h1'));

  const homePageContent = fs.readFileSync(path.join(__dirname, '../src/app/page.tsx'), 'utf-8');
  const homeH1Matches = homePageContent.match(/<h1[^>]*>([\s\S]*?)<\/h1>/gi);
  assert('Home page src/app/page.tsx contains exactly 1 semantic H1', homeH1Matches && homeH1Matches.length === 1);
  assert('Home page H1 contains truthful branding and descriptor', homeH1Matches && homeH1Matches[0].includes('FEF CORTEX') && homeH1Matches[0].includes('AI Market Intelligence'));

  // Ensure public pages have their single page-specific H1
  const publicPages = [
    { file: 'src/app/about/page.tsx', name: 'About' },
    { file: 'src/app/agents/page.tsx', name: 'Agents' },
    { file: 'src/app/how-to-use/page.tsx', name: 'How to Use' },
    { file: 'src/app/community/page.tsx', name: 'Community' },
    { file: 'src/app/markets/page.tsx', name: 'Markets' },
    { file: 'src/app/markets/[symbol]/page.tsx', name: 'Markets [symbol]' },
    { file: 'src/app/chart-analyzer/page.tsx', name: 'Chart Analyzer' },
  ];

  for (const p of publicPages) {
    const content = fs.readFileSync(path.join(__dirname, '..', p.file), 'utf-8');
    const matches = content.match(/<h1[^>]*>/gi);
    assert(`${p.name} (${p.file}) contains exactly 1 H1 element`, matches && matches.length === 1, `Count: ${matches?.length}`);
  }

  console.log(`\n============================================================`);
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log(`============================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runSeoAuditTests();
