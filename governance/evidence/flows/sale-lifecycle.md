# Flow 1 — Sale Lifecycle
## G5 Evidence: End-to-End Business Flow

**Wave:** 2 (Daily Operations)
**Flow:** Customer → Quote → Invoice → Stock decrease → COGS JE → AR → Payment → AR cleared

---

## Pre-conditions

- At least one product with stock > 0 in the main warehouse
- One active customer (any type)
- An active price list
- Logged in as: Branch Manager or Sales role

---

## Steps

### Step 1 — Create Quotation

```
POST /sales/quotations
{
  "customerId": "<customer-id>",
  "lines": [
    { "productVariantId": "<variant-id>", "quantity": 2, "unitPriceIqd": 15000 }
  ]
}
```

**Expected:** 201 Created, status = `draft`

**Evidence file:** `wave2/api-captures/quotation-create.json`

---

### Step 2 — Submit Quotation → Sales Order

```
POST /sales/quotations/{id}/submit
```

**Expected:** 200, status = `submitted`

**Inventory check:** No stock change yet (quotation is not a stock document)

---

### Step 3 — Convert to Sales Order

```
POST /sales/quotations/{id}/convert-to-order
```

**Expected:** 201, creates a `SalesOrder` linked to quotation

---

### Step 4 — Create Sales Invoice from Order

```
POST /sales/invoices
{
  "salesOrderId": "<order-id>",
  "customerId": "<customer-id>",
  "lines": [ ... ]
}
```

**Expected:** 201 Created

---

### Step 5 — Post Invoice (Accounting + Stock)

```
POST /sales/invoices/{id}/post
```

**Expected:**
- Invoice status → `posted`
- `stock_ledger` row inserted: quantity negative (stock out)
- `journal_entries` row created with:
  - DR Accounts Receivable (asset)
  - CR Revenue (income)
  - DR COGS (expense)
  - CR Inventory (asset)

**Verification query:**
```sql
SELECT * FROM stock_ledger WHERE ref_type='sales_invoice' AND ref_id='<invoice-id>';
SELECT * FROM journal_entries WHERE ref_type='sales_invoice' AND ref_id='<invoice-id>';
```

**Evidence file:** `wave2/api-captures/invoice-post.json`

---

### Step 6 — Record Payment Receipt (AR Clearance)

```
POST /finance/payment-receipts
{
  "customerId": "<customer-id>",
  "invoiceId": "<invoice-id>",
  "amountIqd": 30000,
  "paymentMethod": "cash"
}
```

**Expected:**
- Receipt created
- AR balance reduced
- JE: DR Cash, CR Accounts Receivable

**Evidence file:** `wave2/api-captures/payment-receipt.json`

---

### Step 7 — Verify AR Cleared

```
GET /customers/{id}
```

**Expected:** `creditBalanceIqd` updated or `arBalance` = 0

---

## Invariants to Verify

| Invariant | Check | Pass Condition |
|-----------|-------|----------------|
| F2: JE balanced | `SELECT SUM(debit_iqd) - SUM(credit_iqd) FROM je_lines WHERE je_id=...` | = 0 |
| F3: Stock append-only | Try `UPDATE stock_ledger SET quantity=0 WHERE ...` | Should raise exception trigger |
| F3: Negative stock blocked | Create invoice for qty > stock | Should return 422 |
| F1: Branch isolation | Log in as different branch user | Should not see this invoice |

---

## Screenshots Required

- [ ] Quotation form filled in (before submit)
- [ ] Sales invoice posted (status badge visible)
- [ ] Stock ledger row (inventory history)
- [ ] Journal entry viewer (DR/CR columns balanced)
- [ ] Customer AR balance = 0 (after payment)
