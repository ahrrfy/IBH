-- Data Migration Center: import sessions + per-row tracking
-- Adds two tables: import_sessions (parent) and import_rows (child).

CREATE TABLE "import_sessions" (
    "id"                  CHAR(26) NOT NULL DEFAULT gen_ulid(),
    "companyId"           CHAR(26) NOT NULL,
    "branchId"            CHAR(26),
    "entityType"          VARCHAR(50) NOT NULL,
    "status"              VARCHAR(30) NOT NULL DEFAULT 'uploading',
    "fileName"            VARCHAR(255) NOT NULL,
    "fileFormat"          VARCHAR(10) NOT NULL,
    "fileSizeBytes"       INTEGER NOT NULL,
    "sheetName"           VARCHAR(100),
    "totalRows"           INTEGER NOT NULL DEFAULT 0,
    "validRows"           INTEGER NOT NULL DEFAULT 0,
    "errorRows"           INTEGER NOT NULL DEFAULT 0,
    "skippedRows"         INTEGER NOT NULL DEFAULT 0,
    "importedRows"        INTEGER NOT NULL DEFAULT 0,
    "currentRow"          INTEGER NOT NULL DEFAULT 0,
    "fieldMapping"        JSONB,
    "options"             JSONB,
    "validationSummary"   JSONB,
    "batchTag"            VARCHAR(100),
    "errorReportUrl"      VARCHAR(500),
    "startedAt"           TIMESTAMP(3),
    "completedAt"         TIMESTAMP(3),
    "rolledBackAt"        TIMESTAMP(3),
    "rolledBackBy"        CHAR(26),
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL,
    "createdBy"           CHAR(26) NOT NULL,

    CONSTRAINT "import_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "import_sessions_companyId_status_idx"     ON "import_sessions"("companyId", "status");
CREATE INDEX "import_sessions_companyId_entityType_idx" ON "import_sessions"("companyId", "entityType");
CREATE INDEX "import_sessions_companyId_batchTag_idx"   ON "import_sessions"("companyId", "batchTag");

CREATE TABLE "import_rows" (
    "id"                CHAR(26) NOT NULL DEFAULT gen_ulid(),
    "sessionId"         CHAR(26) NOT NULL,
    "rowNumber"         INTEGER NOT NULL,
    "status"            VARCHAR(20) NOT NULL DEFAULT 'pending',
    "sourceData"        JSONB NOT NULL,
    "transformedData"   JSONB,
    "validationErrors"  JSONB,
    "warnings"          JSONB,
    "createdEntityId"   CHAR(26),
    "createdEntityType" VARCHAR(50),
    "duplicateOfId"     CHAR(26),
    "processedAt"       TIMESTAMP(3),

    CONSTRAINT "import_rows_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "import_rows_sessionId_status_idx"    ON "import_rows"("sessionId", "status");
CREATE INDEX "import_rows_sessionId_rowNumber_idx" ON "import_rows"("sessionId", "rowNumber");

ALTER TABLE "import_rows"
  ADD CONSTRAINT "import_rows_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "import_sessions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Row-Level Security (F1) — multi-tenant isolation
-- Same canonical pattern as I062 (rls_bypass_active() OR companyId match).
-- import_rows inherits via its session FK (no companyId column).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "import_sessions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "import_sessions";
CREATE POLICY tenant_isolation ON "import_sessions"
  USING      (rls_bypass_active() OR "companyId" = current_company_id())
  WITH CHECK (rls_bypass_active() OR "companyId" = current_company_id());

ALTER TABLE "import_rows" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "import_rows";
CREATE POLICY tenant_isolation ON "import_rows"
  USING (
    rls_bypass_active()
    OR EXISTS (
      SELECT 1 FROM "import_sessions" s
      WHERE s."id" = "import_rows"."sessionId"
        AND s."companyId" = current_company_id()
    )
  )
  WITH CHECK (
    rls_bypass_active()
    OR EXISTS (
      SELECT 1 FROM "import_sessions" s
      WHERE s."id" = "import_rows"."sessionId"
        AND s."companyId" = current_company_id()
    )
  );
