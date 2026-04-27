// Hardware fingerprint module for Tauri POS / Desktop apps.
//
// Builds a stable SHA-256 fingerprint from:
//   - CPU brand string
//   - Total physical memory (rounded to GiB)
//   - First disk name / mount point
//   - OS name + OS version
//
// The fingerprint is stable across reboots but changes when hardware
// changes substantially (different CPU, RAM size, primary disk). This
// is what binds a license to a specific machine (F6 — License Philosophy).

use sha2::{Digest, Sha256};
use sysinfo::{Disks, System};

/// Compute the hex-encoded SHA-256 hardware fingerprint for this device.
/// The output is exactly 64 lowercase hex characters.
pub fn compute_fingerprint() -> String {
    let mut sys = System::new();
    sys.refresh_cpu_all();
    sys.refresh_memory();

    // CPU brand (fall back to "unknown-cpu" if unavailable).
    let cpu_brand = sys
        .cpus()
        .first()
        .map(|c| c.brand().trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "unknown-cpu".to_string());

    // Total physical memory rounded to GiB so small differences (caches,
    // reserved BIOS regions) don't invalidate the fingerprint.
    let total_mem_bytes = sys.total_memory(); // bytes in sysinfo 0.30+
    let total_mem_gib = (total_mem_bytes as f64 / (1024.0 * 1024.0 * 1024.0)).round() as u64;

    // Primary disk identifier: name + mount point of the first listed disk.
    let disks = Disks::new_with_refreshed_list();
    let disk_id = disks
        .list()
        .first()
        .map(|d| {
            format!(
                "{}|{}",
                d.name().to_string_lossy(),
                d.mount_point().to_string_lossy()
            )
        })
        .unwrap_or_else(|| "unknown-disk".to_string());

    // OS name + version.
    let os_name = System::name().unwrap_or_else(|| "unknown-os".to_string());
    let os_version = System::os_version().unwrap_or_else(|| "unknown-ver".to_string());

    let raw = format!(
        "cpu={cpu_brand}|mem_gib={total_mem_gib}|disk={disk_id}|os={os_name} {os_version}"
    );

    let mut hasher = Sha256::new();
    hasher.update(raw.as_bytes());
    let digest = hasher.finalize();
    hex_encode(&digest)
}

/// Tauri command exposed to the frontend. Returns the 64-char SHA-256
/// fingerprint hex string. Never returns an error — falls back to
/// "unknown-*" tokens internally so the frontend always has something
/// to send to the licensing API.
#[tauri::command]
pub fn get_fingerprint() -> String {
    compute_fingerprint()
}

fn hex_encode(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        out.push(HEX[(b >> 4) as usize] as char);
        out.push(HEX[(b & 0x0f) as usize] as char);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fingerprint_is_64_hex_chars() {
        let fp = compute_fingerprint();
        assert_eq!(fp.len(), 64, "expected 64-char SHA-256 hex");
        assert!(
            fp.chars().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()),
            "fingerprint must be lowercase hex"
        );
    }

    #[test]
    fn fingerprint_is_stable_within_run() {
        let a = compute_fingerprint();
        let b = compute_fingerprint();
        assert_eq!(a, b, "fingerprint must be deterministic for same hardware");
    }
}
