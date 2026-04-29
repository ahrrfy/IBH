# All Waves — API Endpoint Health (2026-04-29)

VPS: https://ibherp.cloud · Auth: System Owner Bearer token
Captured after I058 enum fix + INTEGRATION_ENCRYPTION_KEY set on VPS.

## Endpoint health snapshot

| Endpoint | Status | Wave |
|----------|--------|------|
| GET /api/v1/auth/me | ✅ 200 | Wave 1 |
| GET /api/v1/users | ✅ 200 | Wave 1 |
| GET /api/v1/products | ✅ 200 | Wave 1 |
| GET /api/v1/customers | ✅ 200 | Wave 1 |
| GET /api/v1/warehouses | ⚠️ 404 | Wave 1 |
| GET /api/v1/sales-invoices | ✅ 200 | Wave 2 |
| GET /api/v1/delivery | ✅ 200 | Wave 2 |
| GET /api/v1/quotations | ✅ 200 | Wave 2 |
| GET /api/v1/pos/receipts | ✅ 200 | Wave 2 |
| GET /api/v1/purchases/orders | ✅ 200 | Wave 3 |
| GET /api/v1/purchases/grn | ✅ 200 | Wave 3 |
| GET /api/v1/purchases/vendor-invoices | ⚠️ 404 | Wave 3 |
| GET /api/v1/suppliers | ⚠️ 404 | Wave 3 |
| GET /api/v1/finance/gl/trial-balance | ✅ 200 | Wave 4 |
| GET /api/v1/finance/period-close | ⚠️ 404 | Wave 4 |
| GET /api/v1/finance/depreciation | ⚠️ 404 | Wave 4 |
| GET /api/v1/hr/employees | ✅ 200 | Wave 5 |
| GET /api/v1/hr/payroll | ⚠️ 404 | Wave 5 |
| GET /api/v1/hr/recruitment | ⚠️ 404 | Wave 5 |
| GET /api/v1/crm/leads | ✅ 200 | Wave 6 |
| GET /api/v1/licensing/me/features | ✅ 200 | Wave 6 |
| GET /api/v1/autopilot/exceptions | ⚠️ 404 | Wave 6 |
| GET /api/v1/admin/integrations/whatsapp | ✅ 200 | Wave 6 |
