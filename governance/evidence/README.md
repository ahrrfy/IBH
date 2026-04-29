# G5 Evidence — Al-Ruya ERP

**Collected:** 2026-04-29T20:44:22
**Target:** https://ibherp.cloud/api/v1

## Structure

```
governance/evidence/
├── wave1/api-captures/*.json    ← Foundation
├── wave2/api-captures/*.json    ← Daily Ops
├── wave3/api-captures/*.json    ← Purchasing
├── wave4/api-captures/*.json    ← Finance
├── wave5/api-captures/*.json    ← HR
├── wave6/api-captures/*.json    ← CRM + Licensing
├── flows/                       ← End-to-end flow docs
│   ├── sale-lifecycle.md
│   ├── procurement-lifecycle.md
│   ├── payroll-lifecycle.md
│   └── license-lifecycle.md
└── README.md                    ← this file
```

## Re-run

```bash
BASE_URL=https://api.ibherp.cloud \
ADMIN_EMAIL=testadmin@ci.test \
ADMIN_PASSWORD=<password> \
bash scripts/collect-evidence.sh
```

## Wave coverage

| Wave | Status | Files |
|------|--------|-------|
| 1 Foundation     | 14 captures |
| 2 Daily Ops      | 15 captures |
| 3 Purchasing     | 5 captures |
| 4 Finance        | 14 captures |
| 5 HR             | 13 captures |
| 6 CRM/Licensing  | 17 captures |

**Screenshots:** Must be captured manually — open each module in the browser and save
PNGs to `governance/evidence/wave{N}/screenshots/*.png`.
