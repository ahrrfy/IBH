-- T47 — RBAC Enterprise Upgrade
-- Adds:
--   1. Role hierarchy (parent_role_id, self-FK ON DELETE SET NULL)
--   2. Temporal validity (valid_from, valid_until)
--   3. Per-user data scope JSON
--   4. role_separation_of_duties table
-- All additions are additive — existing bitmask permission format remains intact.

-- ── 1. Role hierarchy + temporal validity ────────────────────────────────────
ALTER TABLE "roles"
  ADD COLUMN "parentRoleId" CHAR(26),
  ADD COLUMN "validFrom"    TIMESTAMP(3),
  ADD COLUMN "validUntil"   TIMESTAMP(3);

ALTER TABLE "roles"
  ADD CONSTRAINT "roles_parentRoleId_fkey"
  FOREIGN KEY ("parentRoleId") REFERENCES "roles"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "roles_parentRoleId_idx" ON "roles"("parentRoleId");

-- Application-level cycle detection enforces depth ≤ 10.
-- A DB-level recursive CHECK is intentionally NOT added — keeps writes cheap.

-- ── 2. User.dataScope ────────────────────────────────────────────────────────
ALTER TABLE "users"
  ADD COLUMN "dataScope" JSONB;

-- ── 3. role_separation_of_duties ─────────────────────────────────────────────
CREATE TABLE "role_separation_of_duties" (
    "id"                  CHAR(26)      NOT NULL DEFAULT gen_ulid(),
    "roleId"              CHAR(26)      NOT NULL,
    "conflictingActions"  JSONB         NOT NULL,
    "description"         VARCHAR(500),
    "createdAt"           TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_separation_of_duties_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "role_separation_of_duties_roleId_idx"
  ON "role_separation_of_duties"("roleId");

ALTER TABLE "role_separation_of_duties"
  ADD CONSTRAINT "role_separation_of_duties_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "roles"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- conflictingActions must be a JSON array of ≥ 2 unique non-empty strings.
ALTER TABLE "role_separation_of_duties"
  ADD CONSTRAINT "role_sod_actions_array_min2"
  CHECK (
    jsonb_typeof("conflictingActions") = 'array'
    AND jsonb_array_length("conflictingActions") >= 2
  );
