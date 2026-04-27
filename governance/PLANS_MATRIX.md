# PLANS MATRIX — Subscription Plans Feature Matrix

**Source of truth:** `apps/api/prisma/seed/plans.seed.ts`
**Task:** T60 — Subscription Plans Definition
**Depends on:** T58 (License Schema)

> Plan codes here are **stable contracts** — never rename a code that has shipped to production. Feature gates in the API key off these strings via `Plan.featureSnapshot` and `PlanFeature.featureCode`.

## 1. Plan tiers · مستويات الباقات

| Code | Name | Audience | Public |
|---|---|---|---|
| `starter` | Starter | متاجر صغيرة · فرع واحد · Small single-branch shops | ✅ |
| `professional` | Professional | شركات متوسطة · 3 فروع · Mid-size multi-branch businesses | ✅ |
| `enterprise` | Enterprise | شركات كبيرة · فروع غير محدودة · Large unlimited-branch enterprises | ✅ |
| `bundle` | Bundle (Custom) | باقة مخصصة · Custom feature picking + custom pricing | ❌ (sales-only) |

## 2. Limits + Pricing · الحدود والأسعار

| Limit / Price | `starter` | `professional` | `enterprise` | `bundle` |
|---|---:|---:|---:|---:|
| Max users · حد المستخدمين | 5 | 25 | ∞ | ∞ (custom) |
| Max branches · حد الفروع | 1 | 3 | ∞ | ∞ (custom) |
| Max companies · حد الشركات | 1 | 1 | 1 | 1 (custom) |
| Monthly price (IQD) · الشهري | 150,000 | 400,000 | 1,000,000 | Custom |
| Annual price (IQD) · السنوي | 1,650,000 | 4,400,000 | 11,000,000 | Custom |
| Currency · العملة | IQD | IQD | IQD | IQD |

> Annual = monthly × 11 (one month free on annual billing).
> Enterprise pricing is the **floor** — bundle plans may exceed it for high-touch deployments.

## 3. Feature Matrix · مصفوفة الميزات

| Feature Code | Description (AR / EN) | `starter` | `professional` | `enterprise` | `bundle` |
|---|---|:---:|:---:|:---:|:---:|
| `sales` | المبيعات · Sales orders, quotations, invoicing | ✅ | ✅ | ✅ | ◯ |
| `pos` | نقاط البيع · POS (offline-capable) | ✅ | ✅ | ✅ | ◯ |
| `inventory.basic` | مخزون أساسي · Basic inventory (warehouses, stock ledger) | ✅ | ✅ | ✅ | ◯ |
| `reports.basic` | تقارير أساسية · Standard sales/stock reports | ✅ | ✅ | ✅ | ◯ |
| `hr.core` | موارد بشرية · HR core (employees, attendance, leave) | ❌ | ✅ | ✅ | ◯ |
| `hr.payroll` | الرواتب · Payroll, pay grades, promotions | ❌ | ✅ | ✅ | ◯ |
| `finance.gl` | الأستاذ العام · General Ledger + journal entries | ❌ | ✅ | ✅ | ◯ |
| `finance.ar_ap` | الذمم · Accounts Receivable + Payable | ❌ | ✅ | ✅ | ◯ |
| `delivery` | التوصيل · Delivery management + drivers | ❌ | ✅ | ✅ | ◯ |
| `purchases` | المشتريات · Purchase orders + 3-way match | ❌ | ✅ | ✅ | ◯ |
| `crm` | إدارة العلاقات · CRM (leads, campaigns) | ❌ | ✅ | ✅ | ◯ |
| `inventory.smart` | مخزون ذكي · Smart inventory (reorder, ABC, batch) | ❌ | ✅ | ✅ | ◯ |
| `manufacturing` | التصنيع · Manufacturing / production orders | ❌ | ❌ | ✅ | ◯ |
| `ecommerce` | التجارة الإلكترونية · Storefront + omnichannel sync | ❌ | ❌ | ✅ | ◯ |
| `omnichannel` | متعدد القنوات · Unified inventory across channels | ❌ | ❌ | ✅ | ◯ |
| `ai.tier3` | ذكاء قاعدي · Rule-based AI (Tier 3) | ❌ | ❌ | ✅ | ◯ |
| `ai.tier2` | تعلم آلي خفيف · Lightweight ML (Tier 2 — anomaly, forecast) | ❌ | ❌ | ✅ | ◯ |
| `ai.tier1` | LLM متقدم · LLM-backed assist (Tier 1 — Qwen 7B on demand) | ❌ | ❌ | ✅ | ◯ |
| `reports.advanced` | تقارير متقدمة · Advanced reporting + financial analytics | ❌ | ❌ | ✅ | ◯ |
| `finance.fixed_assets` | الأصول الثابتة · Fixed assets + depreciation | ❌ | ❌ | ✅ | ◯ |
| `finance.budget` | الموازنات · Budgeting + variance | ❌ | ❌ | ✅ | ◯ |

**Legend:** ✅ included by default · ❌ not available · ◯ pickable (Bundle activates per-customer via `SubscriptionFeature` overrides)

## 4. Inclusion rule · قاعدة الاحتواء

```
Starter  ⊂  Professional  ⊂  Enterprise
```

Every feature in the lower tier is also in the higher tier — upgrades never lose capability. The `bundle` plan starts empty and is composed à la carte by Sales via the `subscription_features` override table.

## 5. How features are enforced · آلية التطبيق

1. `Plan.featureSnapshot` is a denormalized JSON map of `{ featureCode: true }` cached on the plan row for fast read.
2. `PlanFeature` rows are the relational source of truth (matched by `(planId, featureCode)`).
3. `Subscription.effectiveFeatures` is computed at provisioning time = `featureSnapshot` ∪ active `SubscriptionFeature` overrides.
4. Feature gates in the API check `effectiveFeatures[featureCode] === true` before serving the resource.

## 6. Maintenance · الصيانة

- To add a feature: add the code to `FEATURE_CODES` in `plans.seed.ts`, add it to the appropriate tier's feature list, then re-run `pnpm prisma db seed`.
- To rename a feature: **don't.** Add a new code, migrate the old one out via `SubscriptionFeature` overrides, and soft-disable the old one. Renames break license keys signed against the old code.
- To change pricing: edit `monthlyPriceIqd` in `PLANS` and re-run the seed (annual auto-recomputes as `monthly × 11`).

---

**Last updated:** 2026-04-27 (T60 initial)
