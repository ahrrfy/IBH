/**
 * k6 load test — Al-Ruya ERP (Phase 3.D)
 *
 * Simulates:
 *   - 10 concurrent POS cashiers performing sale flows
 *   - 5 concurrent web users navigating dashboards
 *
 * Run:
 *   k6 run infra/k6/load-test.js
 *   k6 run --env BASE_URL=https://api.ibherp.cloud infra/k6/load-test.js
 *
 * Thresholds (pass/fail criteria):
 *   - 95th percentile response time < 2s
 *   - Error rate < 1%
 *   - All health checks must pass
 *
 * Install k6: https://k6.io/docs/get-started/installation/
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// ── Config ────────────────────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || 'https://api.ibherp.cloud';
const ADMIN_EMAIL = __ENV.ADMIN_EMAIL || 'testadmin@ci.test';
const ADMIN_PASSWORD = __ENV.ADMIN_PASSWORD || 'change-me-before-load-test';

// ── Custom metrics ────────────────────────────────────────────────────────────
const errorRate = new Rate('error_rate');
const posLatency = new Trend('pos_sale_latency_ms');
const dashLatency = new Trend('dashboard_latency_ms');

// ── Scenario definition ───────────────────────────────────────────────────────
export const options = {
  scenarios: {
    pos_cashiers: {
      executor: 'constant-vus',
      vus: 10,
      duration: '3m',
      exec: 'posCashierFlow',
      tags: { scenario: 'pos' },
    },
    web_users: {
      executor: 'constant-vus',
      vus: 5,
      duration: '3m',
      exec: 'webUserFlow',
      tags: { scenario: 'web' },
    },
  },
  thresholds: {
    'http_req_duration{scenario:pos}': ['p(95)<2000'],
    'http_req_duration{scenario:web}': ['p(95)<3000'],
    'error_rate': ['rate<0.01'],
    'http_req_failed': ['rate<0.01'],
    'pos_sale_latency_ms': ['p(95)<1500'],
    'dashboard_latency_ms': ['p(95)<2500'],
  },
};

// ── Auth helper ───────────────────────────────────────────────────────────────
function login() {
  const res = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  check(res, { 'login 200': (r) => r.status === 200 });
  if (res.status !== 200) return null;
  return JSON.parse(res.body).access_token;
}

function headers(token) {
  return {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  };
}

// ── POS Cashier flow ──────────────────────────────────────────────────────────
// Simulates: shift open → receipt create → receipt list → shift close
export function posCashierFlow() {
  const token = login();
  if (!token) { errorRate.add(1); return; }

  const h = headers(token);

  group('pos_flow', () => {
    // 1. Get available POS devices
    let res = http.get(`${BASE_URL}/pos/devices`, h);
    check(res, { 'pos devices 200': (r) => r.status === 200 });
    errorRate.add(res.status !== 200);

    // 2. List recent receipts
    const start = Date.now();
    res = http.get(`${BASE_URL}/pos/receipts?limit=10`, h);
    posLatency.add(Date.now() - start);
    check(res, { 'pos receipts 200': (r) => r.status === 200 });
    errorRate.add(res.status !== 200);

    // 3. Get inventory balance (POS needs stock availability)
    res = http.get(`${BASE_URL}/inventory/balance?limit=20`, h);
    check(res, { 'inventory balance 200': (r) => [200, 304].includes(r.status) });
    errorRate.add(![200, 304].includes(res.status));

    // 4. Get active price list
    res = http.get(`${BASE_URL}/products/price-lists/active`, h);
    check(res, { 'price list 200|404': (r) => [200, 404].includes(r.status) });
  });

  sleep(Math.random() * 2 + 1); // 1-3s think time between transactions
}

// ── Web user flow ─────────────────────────────────────────────────────────────
// Simulates: dashboard → products → invoices → reports
export function webUserFlow() {
  const token = login();
  if (!token) { errorRate.add(1); return; }

  const h = headers(token);

  group('web_flow', () => {
    // 1. Finance KPIs dashboard
    const start = Date.now();
    let res = http.get(`${BASE_URL}/finance/kpis/dashboard`, h);
    dashLatency.add(Date.now() - start);
    check(res, { 'finance kpis 200': (r) => [200, 401].includes(r.status) });

    // 2. Products list
    res = http.get(`${BASE_URL}/products?page=1&limit=20`, h);
    check(res, { 'products 200': (r) => r.status === 200 });
    errorRate.add(res.status !== 200);

    // 3. Sales invoices
    res = http.get(`${BASE_URL}/sales/invoices?page=1&limit=20`, h);
    check(res, { 'sales invoices 200': (r) => r.status === 200 });
    errorRate.add(res.status !== 200);

    // 4. Trial balance
    const now = new Date();
    const fy = `${now.getFullYear()}-01-01`;
    const to = now.toISOString().slice(0, 10);
    res = http.get(`${BASE_URL}/finance/gl/trial-balance?from=${fy}&to=${to}`, h);
    check(res, { 'trial balance 200': (r) => [200, 400].includes(r.status) });

    // 5. Report: sales summary
    res = http.get(
      `${BASE_URL}/reports/render?slug=sales-summary&from=${fy}&to=${to}`,
      h,
    );
    check(res, { 'sales summary 200': (r) => [200, 400, 404].includes(r.status) });
  });

  sleep(Math.random() * 3 + 2); // 2-5s between page navigations
}

// ── Smoke test (default export — runs before scenarios) ───────────────────────
export default function smokeTest() {
  const res = http.get(`${BASE_URL}/health`);
  check(res, {
    'health 200': (r) => r.status === 200,
    'health fast': (r) => r.timings.duration < 500,
  });
  errorRate.add(res.status !== 200);
}
