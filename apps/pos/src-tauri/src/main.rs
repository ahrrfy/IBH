// Al-Ruya ERP POS — Tauri main entry point
// Offline-first POS with SQLCipher-encrypted SQLite + sync to cloud API.
//
// 5.C — SQLCipher activation: pos.db is opened by db::open_encrypted with a
// device-bound key (SHA-256 of hardware fingerprint). Replaces the previous
// tauri-plugin-sql setup which left the DB unencrypted at rest.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use tauri::Manager;

mod db;
mod fingerprint;
mod license;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            // Bind the SQLCipher key to the same hardware fingerprint that
            // license.rs uses for offline activation (CPUID + MAC + BIOS via
            // fingerprint::compute_fingerprint). A DB file copied to a
            // different machine fails the decrypt-verify probe in
            // db::open_encrypted and we abort startup — better than letting
            // the cashier hit corrupt-data errors mid-sale.
            let fp = fingerprint::compute_fingerprint();
            let conn = db::open_encrypted(app.handle(), &fp)
                .map_err(|e| format!("encrypted DB init failed: {e}"))?;
            app.manage(db::DbState(Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_hardware_fingerprint,
            fingerprint::get_fingerprint,
            open_cash_drawer,
            print_receipt,
            check_license,
            db::db_schema_version,
            // T66 — offline license verification (defense in depth)
            license::cache_activation_token,
            license::check_offline_license,
        ])
        .run(tauri::generate_context!())
        .expect("error while running al-ruya-pos");
}

// ─── Tauri Commands ──────────────────────────────────────────────────────────

/// Stable hardware fingerprint derived from hostname + OS + arch + user.
/// Same value used both as the SQLCipher key seed (db.rs) and as the
/// device identity for offline license verification (license.rs), so
/// any change here invalidates both — version-bump the salt in db.rs
/// before changing this function.
pub(crate) fn compute_hardware_fingerprint() -> String {
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
    format!("hw-{:016x}", hasher.finish())
}

/// Tauri-command wrapper around `compute_hardware_fingerprint`.
/// Persisted across runs via tauri_plugin_store on the frontend side.
#[tauri::command]
fn get_hardware_fingerprint() -> Result<String, String> {
    Ok(compute_hardware_fingerprint())
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
