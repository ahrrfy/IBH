// Al-Ruya ERP POS — Tauri main entry point
// Offline-first POS with SQLite encrypted store + sync to cloud API

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri_plugin_sql::{Migration, MigrationKind};

fn main() {
    let migrations = vec![
        // Wave 1 — Offline schema for POS SQLite
        Migration {
            version: 1,
            description: "offline pos schema v1",
            sql: r#"
                -- Pending receipts awaiting sync to cloud
                CREATE TABLE IF NOT EXISTS pending_receipts (
                    id TEXT PRIMARY KEY,                -- ULID (client-generated)
                    client_ulid TEXT UNIQUE NOT NULL,
                    shift_id TEXT NOT NULL,
                    receipt_json TEXT NOT NULL,         -- full receipt payload
                    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                    sync_attempts INTEGER NOT NULL DEFAULT 0,
                    last_sync_error TEXT,
                    synced_at TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_pending_receipts_shift ON pending_receipts(shift_id);
                CREATE INDEX IF NOT EXISTS idx_pending_receipts_unsynced ON pending_receipts(synced_at) WHERE synced_at IS NULL;

                -- Cached product catalog (last 5,000 active variants)
                CREATE TABLE IF NOT EXISTS product_cache (
                    variant_id TEXT PRIMARY KEY,
                    sku TEXT NOT NULL,
                    name_ar TEXT NOT NULL,
                    barcode TEXT,
                    price_iqd REAL NOT NULL,
                    qty_available REAL NOT NULL,
                    cached_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
                );
                CREATE INDEX IF NOT EXISTS idx_product_cache_barcode ON product_cache(barcode);
                CREATE INDEX IF NOT EXISTS idx_product_cache_name ON product_cache(name_ar);

                -- Current shift state (one row)
                CREATE TABLE IF NOT EXISTS current_shift (
                    id TEXT PRIMARY KEY,
                    shift_number TEXT NOT NULL,
                    cashier_id TEXT NOT NULL,
                    pos_device_id TEXT NOT NULL,
                    opened_at TEXT NOT NULL,
                    opening_cash_iqd REAL NOT NULL
                );

                -- Sync log
                CREATE TABLE IF NOT EXISTS sync_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    event_type TEXT NOT NULL,
                    status TEXT NOT NULL,
                    details TEXT,
                    at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
                );
            "#,
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:pos.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            get_hardware_fingerprint,
            open_cash_drawer,
            print_receipt,
            check_license,
        ])
        .run(tauri::generate_context!())
        .expect("error while running al-ruya-pos");
}

// ─── Tauri Commands ──────────────────────────────────────────────────────────

#[tauri::command]
fn get_hardware_fingerprint() -> Result<String, String> {
    // TODO: real fingerprint from CPU + MAC + disk UUID
    Ok(format!("hw-{}", ulid::Ulid::new()))
}

#[tauri::command]
async fn open_cash_drawer() -> Result<(), String> {
    // TODO: send ESC/POS command to printer to pop drawer
    // Common: 0x1B 0x70 0x00 0x19 0xFA
    tracing::info!("cash drawer open command issued");
    Ok(())
}

#[tauri::command]
async fn print_receipt(receipt_json: String) -> Result<(), String> {
    // TODO: render receipt via ESC/POS and send to default printer
    tracing::info!("print_receipt called ({} bytes)", receipt_json.len());
    Ok(())
}

#[tauri::command]
async fn check_license(license_key: String) -> Result<bool, String> {
    // TODO: call license server heartbeat
    Ok(!license_key.is_empty())
}
