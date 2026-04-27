-- T68 — Plan Upgrade/Downgrade with Proration
--
-- Additive enum extension. The new value `prorated_charge` is written by
-- PlanChangeService alongside the `upgraded`/`downgraded` event so a future
-- billing module (T70) can pick up the net IQD delta without re-deriving
-- the math. Idempotent — `IF NOT EXISTS` guards re-runs against the same
-- database (e.g. shadow / reset).

ALTER TYPE "LicenseEventType" ADD VALUE IF NOT EXISTS 'prorated_charge';
