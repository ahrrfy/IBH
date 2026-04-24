-- ─────────────────────────────────────────────────────────────────────────────
-- PostgreSQL initialization script — runs once on first container start
-- Creates extensions needed by the ERP
-- ─────────────────────────────────────────────────────────────────────────────

-- UUID + crypto functions (used by gen_ulid())
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Trigram search for Arabic product names
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Vector search for AI embeddings (Phase 10)
CREATE EXTENSION IF NOT EXISTS vector;

-- Unaccent for search normalization
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Create shadow DB for Prisma migrations
-- (only needed if DIRECT_DATABASE_URL points to it)
-- CREATE DATABASE alruya_erp_shadow OWNER erp_app;

-- Performance: ensure proper locale for Arabic collation
-- ALTER DATABASE alruya_erp SET lc_collate TO 'ar_IQ.UTF-8';

GRANT ALL PRIVILEGES ON DATABASE alruya_erp TO erp_app;
