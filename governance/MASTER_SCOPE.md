# MASTER_SCOPE.md
## الرؤية العربية ERP — النطاق الكامل للمشروع
### الإصدار 1.0 · 2026-04-24

---

> **قاعدة هذا الملف:** ما هو مكتوب هنا هو الحقيقة الوحيدة لنطاق المشروع.
> أي طلب يخرج عن هذا النطاق يُناقَش ثم يُوثَّق في DECISIONS_LOG.md قبل التنفيذ.

---

## 1. الهدف الاستراتيجي

بناء **Operating System for Business** لشركة الرؤية العربية في العراق:

| الهدف | التفاصيل |
|---|---|
| النظام يفكر، الموظف ينقر | كل خبرة شفوية تتحول لقاعدة داخل النظام |
| صفر اشتراكات خارجية | كل شيء self-hosted على VPS مملوك |
| قابل للبيع تجارياً | ترخيص بـ RSA-2048 + hardware fingerprint |
| مقاوم لبيئة العراق | offline POS + UPS + dual ISP |

---

## 2. ما هو داخل النطاق (In Scope)

### الوحدات الـ 18

| # | الوحدة | الموجة |
|---|---|---|
| M01 | Core Engines (Auth + RBAC + Sequences + Audit + Posting + Policy + State Machine) | Wave 1 |
| M02 | Products & Variants (Templates + Variants + Barcodes + Units + Price Lists) | Wave 1 |
| M03 | Inventory (Stock Ledger + Warehouses + Transfers + Stocktaking + Reorder) | Wave 1 |
| M04 | POS (Offline + Shifts + Cash Drawers + Receipt Print) | Wave 2 |
| M05 | Sales (Orders + Invoices + Delivery + Returns + Quotations) | Wave 2 |
| M06 | Purchases (PO + GRN + 3-Way Match + Supplier Returns) | Wave 3 |
| M07 | Finance (GL + AR + AP + Bank Recon + Period Close + Multi-Currency) | Wave 4 |
| M08 | HR (Employees + Attendance + Payroll + Leaves + Grades) | Wave 5 |
| M09 | CRM (Leads + Pipeline + Follow-ups + Loyalty + Reps) | Wave 6 |
| M10 | Custom Orders (Job Orders + BOM + Production Stages + Cost Tracking) | Wave 5 |
| M11 | Reporting & BI (39+ reports + Dashboards + NL Queries) | Wave 4 |
| M12 | Licensing (License Server + Plans + Hardware Fingerprint + Updates) | Wave 6 |
| M13 | AI Tiered (Anomaly + OCR + Forecasting + Copilot + NLQ) | Wave 6 |
| M14 | Marketing (Campaigns + WhatsApp + Promotions + UTM + Loyalty) | Wave 5 |
| M15 | E-commerce (Storefront + Cart + Pre-booking + Inventory Sync) | Wave 3/6 |
| M16 | Delivery (Dispatch + GPS + COD + Confirmation) | Wave 2 |
| M17 | Fixed Assets (Asset Register + Depreciation + Disposal) | Wave 4 |
| M18 | Administration (Users + Settings + Documents + Tasks + Approvals Hub) | Wave 1 |

---

## 3. ما هو خارج النطاق (Out of Scope — v1.0)

```
❌ تطبيق iOS متجر  (App Store) — React Native فقط للموبايل الداخلي
❌ تكامل مع SAP أو Oracle
❌ وحدة التأمين الصحي
❌ محاسبة الزكاة التفصيلية (مُعلَّق للـ v1.1)
❌ نظام بوابة دفع دولية (Stripe, PayPal) — بوابات عراقية فقط
❌ BI متقدم (Tableau, PowerBI) — التقارير الداخلية تكفي
❌ نظام PBX / Call Center
❌ تكامل مع حكومة إلكترونية عراقية (لم تكتمل البنية التحتية)
```

---

## 4. الحدود التقنية المقفلة

| البند | القرار | لماذا مقفل |
|---|---|---|
| لا خادم محلي | VPS فقط + POS offline | تكلفة + صيانة (D05) |
| لا Microservices | Modular Monolith | حجم لا يستدعي التعقيد (D07) |
| لا GraphQL | REST فقط | بساطة + caching |
| لا WebSockets للأعمال | فقط للتنبيهات | لا حاجة لـ real-time bi-directional |
| لا MySQL / MongoDB | PostgreSQL فقط | ACID + RLS + pgvector (D01) |

---

## 5. قواعد إضافة ميزة جديدة

قبل إضافة أي ميزة جديدة يجب الإجابة على:
1. **ماذا تحل؟** — مشكلة تشغيلية حقيقية
2. **ما كلفتها؟** — وقت التطوير + تعقيد إضافي
3. **ما أثرها؟** — كيف تؤثر على الأداء والأمان
4. **هل أولويتها الآن؟** — هل تعطّل موجة جارية؟

إذا لم تُجب على الأسئلة الأربعة → لا تُضاف.
