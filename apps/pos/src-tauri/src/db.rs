// Encrypted offline SQLite for the POS — F6 (licensing) + ARCHITECTURE
// requirement that POS data at rest be SQLCipher-encrypted.
//
// Key derivation
//   key_hex = SHA-256(hardware_fingerprint || APP_SALT) → 64 hex chars
//   PRAGMA key = "x'<key_hex>'"          (rusqlite's raw-key form)
// The fingerprint is the same one license.rs uses for offline activation
// (host + user + os + arch — see fingerprint.rs). Tying the DB key to
// the device means a stolen DB file is useless on any other machine.

use rusqlite::{params, Connection};
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

// Versioned salt — bumping invalidates every existing DB on next launch
// (acceptable: pos.db is a write-through cache, not source of truth).
const APP_SALT: &str = "al-ruya-pos-sqlcipher-v1";

/// Resolves to <app_data_dir>/pos.db. Created lazily on first open.
fn db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("resolve app_data_dir: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("mkdir {dir:?}: {e}"))?;
    Ok(dir.join("pos.db"))
}

/// SHA-256 over the device fingerprint + salt, returned as 64 lowercase
/// hex chars. SQLCipher accepts this as a raw 256-bit key when wrapped
/// in `x'...'` and skips its internal PBKDF2 derivation step.
fn derive_db_key(fingerprint: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(fingerprint.as_bytes());
    hasher.update(APP_SALT.as_bytes());
    let digest = hasher.finalize();
    digest.iter().map(|b| format!("{b:02x}")).collect()
}

/// Opens (or creates) the encrypted pos.db. Must run PRAGMA key as the
/// very first statement; any other query first writes the unencrypted
/// SQLite header and SQLCipher will then refuse the key.
pub fn open_encrypted(app: &AppHandle, fingerprint: &str) -> Result<Connection, String> {
    let path = db_path(app)?;
    let conn = Connection::open(&path).map_err(|e| format!("open {path:?}: {e}"))?;

    let key_hex = derive_db_key(fingerprint);
    conn.execute_batch(&format!("PRAGMA key = \"x'{key_hex}'\";"))
        .map_err(|e| format!("PRAGMA key: {e}"))?;

    // Force SQLCipher to actually attempt decryption now — if the key is
    // wrong (DB file from a different device) this errors out instead of
    // silently corrupting on the first real query.
    conn.query_row("SELECT count(*) FROM sqlite_master", [], |_| Ok(()))
        .map_err(|e| format!("decrypt verify failed (wrong key or corrupt DB): {e}"))?;

    // Standard durability/concurrency tuning for a single-process POS.
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous  = NORMAL;
         PRAGMA foreign_keys = ON;",
    )
    .map_err(|e| format!("pragma tuning: {e}"))?;

    run_migrations(&conn)?;
    Ok(conn)
}

/// Lightweight migration runner — keeps schema in lock-step with
/// what tauri-plugin-sql ran before the SQLCipher swap. New migrations
/// append to MIGRATIONS; previous versions are never edited.
fn run_migrations(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            version     INTEGER PRIMARY KEY,
            description TEXT    NOT NULL,
            applied_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        );",
    )
    .map_err(|e| format!("create schema_migrations: {e}"))?;

    let current: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
            [],
            |r| r.get(0),
        )
        .map_err(|e| format!("read schema version: {e}"))?;

    for (version, description, sql) in MIGRATIONS {
        if (*version as i64) <= current {
            continue;
        }
        conn.execute_batch(sql)
            .map_err(|e| format!("migration v{version} failed: {e}"))?;
        conn.execute(
            "INSERT INTO schema_migrations (version, description) VALUES (?1, ?2)",
            params![version, description],
        )
        .map_err(|e| format!("record migration v{version}: {e}"))?;
    }
    Ok(())
}

// (version, description, sql) — append-only.
const MIGRATIONS: &[(u32, &str, &str)] = &[(
    1,
    "offline pos schema v1",
    r#"
    -- Pending receipts awaiting sync to cloud
    CREATE TABLE IF NOT EXISTS pending_receipts (
        id              TEXT    PRIMARY KEY,
        client_ulid     TEXT    UNIQUE NOT NULL,
        shift_id        TEXT    NOT NULL,
        receipt_json    TEXT    NOT NULL,
        created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        sync_attempts   INTEGER NOT NULL DEFAULT 0,
        last_sync_error TEXT,
        synced_at       TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_pending_receipts_shift    ON pending_receipts(shift_id);
    CREATE INDEX IF NOT EXISTS idx_pending_receipts_unsynced ON pending_receipts(synced_at) WHERE synced_at IS NULL;

    -- Cached product catalog (last 5,000 active variants)
    CREATE TABLE IF NOT EXISTS product_cache (
        variant_id    TEXT PRIMARY KEY,
        sku           TEXT NOT NULL,
        name_ar       TEXT NOT NULL,
        barcode       TEXT,
        price_iqd     REAL NOT NULL,
        qty_available REAL NOT NULL,
        cached_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_product_cache_barcode ON product_cache(barcode);
    CREATE INDEX IF NOT EXISTS idx_product_cache_name    ON product_cache(name_ar);

    -- Current shift state (one row)
    CREATE TABLE IF NOT EXISTS current_shift (
        id              TEXT PRIMARY KEY,
        shift_number    TEXT NOT NULL,
        cashier_id      TEXT NOT NULL,
        pos_device_id   TEXT NOT NULL,
        opened_at       TEXT NOT NULL,
        opening_cash_iqd REAL NOT NULL
    );

    -- Sync log
    CREATE TABLE IF NOT EXISTS sync_log (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type  TEXT NOT NULL,
        status      TEXT NOT NULL,
        details     TEXT,
        at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    "#,
)];

// ─── Tauri state + commands ──────────────────────────────────────────

pub struct DbState(pub Mutex<Connection>);

/// Returns the schema version after running migrations — useful for the
/// frontend to confirm the encrypted DB is actually open & decrypted.
#[tauri::command]
pub fn db_schema_version(state: State<'_, DbState>) -> Result<i64, String> {
    let conn = state.0.lock().map_err(|e| format!("lock: {e}"))?;
    conn.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
        [],
        |r| r.get(0),
    )
    .map_err(|e| format!("read schema version: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn key_derivation_is_deterministic() {
        let a = derive_db_key("hw-1234567890abcdef");
        let b = derive_db_key("hw-1234567890abcdef");
        assert_eq!(a, b);
        assert_eq!(a.len(), 64); // SHA-256 hex
    }

    #[test]
    fn key_derivation_differs_per_fingerprint() {
        let a = derive_db_key("hw-aaaa");
        let b = derive_db_key("hw-bbbb");
        assert_ne!(a, b);
    }
}
