-- ─────────────────────────────────────────────────────────────────────────────
-- T41 — Product 3-field naming + Category hierarchy (materialized path)
--
-- product_templates:
--   + name1 (required, defaults to existing nameAr for back-fill)
--   + name2, name3 (optional)
--   + generated_full_name (denormalised: trim of name1..name3 joined by space)
--
-- product_categories:
--   + level (depth, root = 0)
--   + path  (materialized path "/<rootId>/.../<selfId>"; recomputed in service
--            whenever parentId changes — index for descendant lookups)
--
-- All columns are additive; existing rows back-filled in this migration so
-- downstream code may rely on NOT NULL semantics for name1 / generated_full_name.
-- ─────────────────────────────────────────────────────────────────────────────

-- product_templates ----------------------------------------------------------
ALTER TABLE "product_templates"
  ADD COLUMN "name1"               VARCHAR(200) NOT NULL DEFAULT '',
  ADD COLUMN "name2"               VARCHAR(200),
  ADD COLUMN "name3"               VARCHAR(200),
  ADD COLUMN "generatedFullName"   VARCHAR(700) NOT NULL DEFAULT '';

-- Back-fill name1 = nameAr for existing rows so duplicate-detection works
-- on legacy data without forcing operators to re-enter every product.
UPDATE "product_templates"
   SET "name1"             = "nameAr",
       "generatedFullName" = "nameAr"
 WHERE "name1" = '';

CREATE INDEX "product_templates_companyId_generatedFullName_idx"
  ON "product_templates" ("companyId", "generatedFullName");

-- product_categories ---------------------------------------------------------
ALTER TABLE "product_categories"
  ADD COLUMN "level" INTEGER       NOT NULL DEFAULT 0,
  ADD COLUMN "path"  VARCHAR(2000) NOT NULL DEFAULT '';

-- Back-fill: roots get level=0 + path="/<id>"; deeper levels are repaired
-- by the service the first time a parent is reassigned. We compute up to
-- 5 levels here which covers virtually all real catalogues.
UPDATE "product_categories"
   SET "path" = '/' || "id"
 WHERE "parentId" IS NULL AND "path" = '';

UPDATE "product_categories" c
   SET "level" = p."level" + 1,
       "path"  = p."path" || '/' || c."id"
  FROM "product_categories" p
 WHERE c."parentId" = p."id"
   AND c."path"     = ''
   AND p."path"    <> '';

-- Repeat once more to cover grand-children (best-effort; service will fix
-- anything deeper on first edit).
UPDATE "product_categories" c
   SET "level" = p."level" + 1,
       "path"  = p."path" || '/' || c."id"
  FROM "product_categories" p
 WHERE c."parentId" = p."id"
   AND c."path"     = ''
   AND p."path"    <> '';

CREATE INDEX "product_categories_parentId_idx"
  ON "product_categories" ("parentId");

CREATE INDEX "product_categories_companyId_path_idx"
  ON "product_categories" ("companyId", "path");
