# Flow 2 — Procurement Lifecycle
## G5 Evidence: End-to-End Business Flow

**Wave:** 3 (Purchasing)
**Flow:** Supplier → PO → GRN (quality check) → Stock increase → Vendor invoice → 3-way match → AP → Payment

---

## Pre-conditions

- At least one active supplier
- At least one product in the system
- Logged in as: Purchasing Manager or Procurement role

---

## Steps

### Step 1 — Create Purchase Order

```
POST /purchases/orders
{
  "supplierId": "<supplier-id>",
  "expectedDeliveryDate": "2026-05-15",
  "lines": [
    { "productVariantId": "<variant-id>", "quantity": 50, "unitCostIqd": 8000 }
  ]
}
```

**Expected:** 201 Created, status = `draft`

---

### Step 2 — Submit and Approve PO

```
POST /purchases/orders/{id}/submit
POST /purchases/orders/{id}/approve
```

**Expected:** status → `approved`

---

### Step 3 — Create GRN (Goods Receipt Note)

```
POST /purchases/grn
{
  "purchaseOrderId": "<po-id>",
  "lines": [
    { "poLineId": "<line-id>", "receivedQty": 50, "rejectedQty": 0 }
  ]
}
```

**Expected:** 201 Created

---

### Step 4 — Quality Hold (partial rejection scenario)

```
POST /purchases/grn
{
  "purchaseOrderId": "<po-id>",
  "lines": [
    { "poLineId": "<line-id>", "receivedQty": 45, "rejectedQty": 5,
      "rejectionReason": "damaged packaging" }
  ]
}
```

**Expected:** GRN created with `qualityHold = true` for rejected lines

---

### Step 5 — Post GRN → Stock Increase

```
POST /purchases/grn/{id}/post
```

**Expected:**
- `stock_ledger` row: quantity +45 (only accepted qty)
- `journal_entries`: DR Inventory, CR Goods Received Not Invoiced (GRNI)

---

### Step 6 — Create Vendor Invoice

```
POST /purchases/vendor-invoices
{
  "supplierId": "<supplier-id>",
  "purchaseOrderId": "<po-id>",
  "amountIqd": 360000,
  "lines": [
    { "grnLineId": "<grn-line-id>", "quantity": 45, "unitCostIqd": 8000 }
  ]
}
```

**Expected:** 201 Created

---

### Step 7 — 3-Way Match

```
POST /purchases/vendor-invoices/{id}/match
```

**Expected:**
- Match result: PO qty = GRN received qty = Invoice qty (within ±2% tolerance)
- If within tolerance: status → `matched`, AP entry created
- If outside tolerance: status → `hold`, requires manual review

**Evidence file:** `wave3/api-captures/3way-match.json`

---

### Step 8 — Record AP Payment

```
POST /purchases/payments
{
  "vendorInvoiceId": "<invoice-id>",
  "amountIqd": 360000,
  "paymentMethod": "bank_transfer"
}
```

**Expected:** JE: DR Accounts Payable, CR Bank Account

---

## Invariants to Verify

| Invariant | Check | Pass Condition |
|-----------|-------|----------------|
| F3: Stock only from GRN | Check `stock_ledger.ref_type` | = `grn` |
| F2: GRNI cleared on match | `journal_entries` for matched invoice | GRNI DR = 0 |
| F2: JE balanced | Sum all JE lines for this flow | debit = credit |
| 3-way tolerance | Invoice ±2% of PO price | Accepted or flagged correctly |

---

## Screenshots Required

- [ ] Purchase Order in `approved` status
- [ ] GRN with rejected lines visible
- [ ] Stock balance increased after GRN post
- [ ] 3-way match result (green match table)
- [ ] AP ledger entry
