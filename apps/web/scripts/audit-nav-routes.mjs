#!/usr/bin/env node
/**
 * audit-nav-routes — verifies every sidebar entry resolves to an existing
 * Next.js app route under apps/web/src/app/(app)/**.
 *
 * Run: node apps/web/scripts/audit-nav-routes.mjs
 *
 * Exits non-zero if any of:
 *   - MODULE_HREFS[m] doesn't have a matching page.tsx
 *   - any MODULE_SECTIONS[m].href doesn't have a matching page.tsx
 *
 * Why a script (not a Jest test): the web app has no test runner wired and
 * adding one is out of scope. This script is fast (<1s) and importable from
 * CI in a single line.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const WEB_ROOT = resolve(__dirname, '..');
const APP_DIR = join(WEB_ROOT, 'src', 'app', '(app)');
const PERMISSIONS_FILE = join(WEB_ROOT, 'src', 'lib', 'permissions.ts');

/** Walk app dir collecting route paths derived from page.tsx locations. */
function collectRoutes(dir, prefix = '') {
  const out = new Set();
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      // Skip Next.js route groups: (group)
      const next = entry.startsWith('(') && entry.endsWith(')')
        ? prefix
        : prefix + '/' + entry;
      for (const r of collectRoutes(full, next)) out.add(r);
    } else if (entry === 'page.tsx' || entry === 'page.ts') {
      out.add(prefix || '/');
    }
  }
  return out;
}

/**
 * Match an href against the discovered route set, accounting for dynamic
 * segments. e.g. /sales/invoices/[id] matches an href of /sales/invoices/123.
 */
function matchesRoute(routes, href) {
  if (routes.has(href)) return true;
  // Check whether any dynamic-segment route matches
  for (const r of routes) {
    if (!r.includes('[')) continue;
    const rParts = r.split('/').filter(Boolean);
    const hParts = href.split('/').filter(Boolean);
    if (rParts.length !== hParts.length) continue;
    let ok = true;
    for (let i = 0; i < rParts.length; i++) {
      if (rParts[i].startsWith('[')) continue; // dynamic segment matches anything
      if (rParts[i] !== hParts[i]) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}

function extractStringHrefs(source) {
  // Pull every "href: '/...'" literal from the file. Good enough for an
  // audit since both MODULE_HREFS and MODULE_SECTIONS use literal strings.
  const found = new Set();
  const re = /href:\s*['"`](\/[^'"`]+)['"`]/g;
  let m;
  while ((m = re.exec(source))) found.add(m[1]);
  // MODULE_HREFS shape: 'sales: \'/sales/invoices\','
  const re2 = /['"`](\/[a-z][a-z0-9/_-]*)['"`]/gi;
  while ((m = re2.exec(source))) {
    if (m[1].startsWith('/')) found.add(m[1]);
  }
  return found;
}

function main() {
  if (!existsSync(APP_DIR)) {
    console.error(`✗ App dir not found: ${APP_DIR}`);
    process.exit(2);
  }
  if (!existsSync(PERMISSIONS_FILE)) {
    console.error(`✗ Permissions file not found: ${PERMISSIONS_FILE}`);
    process.exit(2);
  }
  const routes = collectRoutes(APP_DIR);
  const source = readFileSync(PERMISSIONS_FILE, 'utf8');
  const hrefs = extractStringHrefs(source);

  // Filter out anything not under our (app) tree
  const candidates = [...hrefs].filter((h) =>
    [
      '/dashboard', '/sales', '/pos', '/inventory', '/purchases',
      '/finance', '/assets', '/hr', '/job-orders', '/crm',
      '/marketing', '/reports', '/settings', '/delivery',
      '/notifications', '/profile',
    ].some((root) => h === root || h.startsWith(root + '/')),
  );

  const broken = [];
  for (const href of candidates) {
    if (!matchesRoute(routes, href)) broken.push(href);
  }

  console.log(`Discovered ${routes.size} route(s) under (app)/`);
  console.log(`Checked ${candidates.length} sidebar/permissions href(s)`);

  if (broken.length) {
    console.error('\n✗ Broken sidebar entries (no matching page.tsx):');
    for (const h of broken) console.error('   - ' + h);
    process.exit(1);
  }
  console.log('✓ All sidebar entries resolve to existing routes.');
}

main();
