-- ─────────────────────────────────────────────────────────────────────────────
-- Fix gen_ulid() — SUBSTR(text, bigint, integer) doesn't exist on every
-- Postgres 16 build (notably postgres:16-alpine, which CI uses). The
-- production image pgvector/pgvector:pg16 happens to accept the implicit
-- cast, masking the bug for ~6 weeks.
--
-- Root cause: bit-shifting a BIGINT (now_ms) returns BIGINT. Adding 1 keeps
-- it BIGINT. SUBSTR's second arg is INTEGER. We just cast the offset.
--
-- Idempotent (CREATE OR REPLACE), safe to apply to existing databases.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION gen_ulid() RETURNS TEXT AS $$
DECLARE
  encoding   TEXT := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  output     TEXT := '';
  now_ms     BIGINT;
  rand_bytes BYTEA;
  i          INT;
BEGIN
  -- 10 timestamp characters
  now_ms := EXTRACT(EPOCH FROM clock_timestamp()) * 1000;
  FOR i IN REVERSE 9..0 LOOP
    output := output || SUBSTR(encoding, ((now_ms >> (i * 5) & 31) + 1)::int, 1);
  END LOOP;

  -- 16 random characters
  rand_bytes := gen_random_bytes(10);
  FOR i IN 0..9 LOOP
    output := output || SUBSTR(encoding, ((GET_BYTE(rand_bytes, i) >> 3 & 31) + 1)::int, 1);
    IF i < 9 THEN
      output := output || SUBSTR(encoding, (((GET_BYTE(rand_bytes, i) & 7) << 2 | GET_BYTE(rand_bytes, i+1) >> 6) & 31 + 1)::int, 1);
    END IF;
  END LOOP;

  RETURN SUBSTR(output, 1, 26);
END;
$$ LANGUAGE plpgsql VOLATILE;
