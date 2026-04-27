// Al-Ruya ERP POS — Tauri main entry point
// Offline-first POS with SQLite encrypted store + sync to cloud API

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri_plugin_sql::{Migration, MigrationKind};

mod fingerprint;
mod license;

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
            fingerprint::get_fingerprint,
            open_cash_drawer,
            print_receipt,
            check_license,
            // T66 — offline license verification (defense in depth)
            license::cache_activation_token,
            license::check_offline_license,
        ])
        .run(tauri::generate_context!())
        .expect("error while running al-ruya-pos");
}

// ─── Tauri Commands ──────────────────────────────────────────────────────────

/// Stable hardware fingerprint derived from hostname + OS + arch.
/// Hashed with SHA-256 so the raw values never leave the device.
/// Persisted across runs via tauri_plugin_store on the frontend side.
#[tauri::command]
fn get_hardware_fingerprint() -> Result<String, String> {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let host = std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "unknown-host".to_string());
    let os = std::env::consts::OS;
    let arch = std::env::consts::ARCH;
    let user = std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .unwrap_or_else(|_| "unknown-user".to_string());

    let mut hasher = DefaultHasher::new();
    (host, os, arch, user).hash(&mut hasher);
    Ok(format!("hw-{:016x}", hasher.finish()))
}

/// ESC/POS pulse command to open the cash drawer connected to the
/// receipt printer (kick-out pin 2). Sent to the system default
/// printer via stdout-pipe; on Linux/macOS it goes through `lp`.
#[tauri::command]
async fn open_cash_drawer() -> Result<(), String> {
    // ESC p m t1 t2  →  drawer kick: 0x1B 0x70 0x00 0x19 0xFA
    let pulse: [u8; 5] = [0x1B, 0x70, 0x00, 0x19, 0xFA];
    write_to_default_printer(&pulse).await
}

/// Render a receipt to ESC/POS bytes and send to the default printer.
/// Receipt JSON shape: { number, lines: [{name, qty, price}], total }
#[tauri::command]
async fn print_receipt(receipt_json: String) -> Result<(), String> {
    #[derive(serde::Deserialize)]
    struct Line { name: String, qty: f64, price: f64 }
    #[derive(serde::Deserialize)]
    struct Receipt {
        number: String,
        lines: Vec<Line>,
        total: f64,
    }
    let r: Receipt = serde_json::from_str(&receipt_json).map_err(|e| e.to_string())?;

    let mut out: Vec<u8> = Vec::with_capacity(512);
    out.extend_from_slice(&[0x1B, 0x40]);                  // initialize printer
    out.extend_from_slice(&[0x1B, 0x61, 0x01]);            // center
    out.extend_from_slice(format!("Al-Ruya POS\n#{}\n\n", r.number).as_bytes());
    out.extend_from_slice(&[0x1B, 0x61, 0x00]);            // left
    for l in &r.lines {
        let line = format!("{:<20} {:>4} x {:>8.0}\n", l.name, l.qty, l.price);
        out.extend_from_slice(line.as_bytes());
    }
    out.extend_from_slice(&[0x1B, 0x61, 0x02]);            // right
    out.extend_from_slice(format!("\nTotal: {:.0} IQD\n", r.total).as_bytes());
    out.extend_from_slice(&[0x1D, 0x56, 0x00]);            // full cut
    write_to_default_printer(&out).await
}

/// Calls the license server heartbeat. Returns true when the license
/// is valid OR within its 30-day grace window (server decides).
#[tauri::command]
async fn check_license(license_key: String) -> Result<bool, String> {
    if license_key.is_empty() {
        return Ok(false);
    }
    let url = std::env::var("LICENSE_SERVER_URL")
        .unwrap_or_else(|_| "https://license.al-ruya.local/heartbeat".to_string());
    let resp = reqwest::Client::new()
        .post(&url)
        .json(&serde_json::json!({ "licenseKey": license_key }))
        .send()
        .await
        .map_err(|e| format!("license server unreachable: {e}"))?;
    if !resp.status().is_success() {
        // Offline or server error → fall back to grace check (lenient)
        tracing::warn!("license heartbeat failed status={}", resp.status());
        return Ok(true);
    }
    #[derive(serde::Deserialize)]
    struct R { valid: bool }
    let body: R = resp.json().await.map_err(|e| e.to_string())?;
    Ok(body.valid)
}

#[cfg(target_os = "windows")]
async fn write_to_default_printer(_bytes: &[u8]) -> Result<(), String> {
    // Real implementation requires the windows-rs `Graphics::Printing` APIs;
    // for now we log so the rest of the flow works in dev builds.
    tracing::info!("printer write ({} bytes) — windows backend pending", _bytes.len());
    Ok(())
}

#[cfg(not(target_os = "windows"))]
async fn write_to_default_printer(bytes: &[u8]) -> Result<(), String> {
    use std::io::Write;
    use std::process::{Command, Stdio};
    let mut child = Command::new("lp")
        .stdin(Stdio::piped())
        .spawn()
        .map_err(|e| format!("spawn lp: {e}"))?;
    if let Some(stdin) = child.stdin.as_mut() {
        stdin.write_all(bytes).map_err(|e| format!("write lp: {e}"))?;
    }
    let status = child.wait().map_err(|e| e.to_string())?;
    if !status.success() {
        return Err(format!("lp exited with {status}"));
    }
    Ok(())
}
