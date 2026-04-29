# Flow 3 — Payroll Lifecycle
## G5 Evidence: End-to-End Business Flow

**Wave:** 5 (HR)
**Flow:** Employee → Attendance → Payroll run → Iraqi tax calc → JE (salary/tax/net) → Payment → Audit log

---

## Pre-conditions

- At least one active employee with `baseSalaryIqd` set
- One complete attendance month (or seed data via uat-seed.ts)
- HR Manager role
- CoA has: Salaries Expense, Tax Payable, Social Security Payable, Net Salaries Payable accounts

---

## Steps

### Step 1 — Verify Employee Record

```
GET /hr/employees/{id}
```

**Expected fields:**
- `baseSalaryIqd` — gross salary
- `socialSecurityEnrolled: true`
- `status: "active"`
- `hireDate` — for gratuity calculation

---

### Step 2 — Check Attendance Summary

```
GET /hr/attendance?employeeId={id}&month=2026-04
```

**Expected:** working days count, overtime hours, leave days taken

---

### Step 3 — Create Payroll Run

```
POST /hr/payroll/runs
{
  "month": "2026-04",
  "employeeIds": ["<employee-id>"]
}
```

**Expected:** 201 Created, status = `draft`

---

### Step 4 — Review Payroll Calculation

```
GET /hr/payroll/runs/{id}/lines
```

**Expected line structure:**
```json
{
  "employeeId": "...",
  "grossSalaryIqd": 500000,
  "overtimeIqd": 25000,
  "incomeTaxIqd": 12500,       ← Iraqi progressive tax (F2 validation)
  "socialSecurityIqd": 25250,  ← 5.05% of gross
  "netSalaryIqd": 487250
}
```

**Iraqi Tax Brackets (verify against official rates):**
| Annual Income (IQD) | Rate |
|---------------------|------|
| 0 – 1,200,000       | 3%   |
| 1,200,001 – 2,400,000 | 5% |
| 2,400,001 – 3,600,000 | 10% |
| 3,600,001+          | 15%  |

---

### Step 5 — Approve Payroll Run

```
POST /hr/payroll/runs/{id}/approve
```

**Expected:** status → `approved`

---

### Step 6 — Post Payroll (Journal Entry)

```
POST /hr/payroll/runs/{id}/post
```

**Expected JE lines:**
- DR Salaries Expense (gross + OT)
- CR Income Tax Payable
- CR Social Security Payable
- CR Net Salaries Payable (= amount to transfer to employees)

**JE balance check:**
```sql
SELECT SUM(debit_iqd) - SUM(credit_iqd) AS imbalance
FROM je_lines
WHERE je_id IN (
  SELECT id FROM journal_entries WHERE ref_type='payroll_run' AND ref_id='<run-id>'
);
```
**Expected:** `imbalance = 0`

**Evidence file:** `wave5/api-captures/payroll-post.json`

---

### Step 7 — Export CBS (Central Bank Settlement)

```
GET /hr/payroll/runs/{id}/export/cbs
```

**Expected:** CSV/Excel with employee IBAN, amount, reference

---

### Step 8 — Verify Audit Log

```
GET /audit/logs?ref_type=payroll_run&ref_id={run-id}
```

**Expected:** Full trail with actor, timestamp, before/after state

---

## Invariants to Verify

| Invariant | Check | Pass Condition |
|-----------|-------|----------------|
| F2: Payroll JE balanced | Sum je_lines for this run | = 0 |
| F2: Append-only | Try UPDATE journal_entries | Should fail (trigger) |
| Iraqi tax correct | Test salary 1,500,000/year | Tax = 3% on 1.2M + 5% on 0.3M = 51,000 |
| Social security 5.05% | base × 0.0505 | Match computed value |
| Gratuity (after 1yr) | Employee with >1yr service | gratuityIqd > 0 |

---

## Screenshots Required

- [ ] Employee record with salary details
- [ ] Attendance summary for payroll month
- [ ] Payroll run draft with calculation breakdown
- [ ] JE viewer — balanced salary entry
- [ ] CBS export file download
