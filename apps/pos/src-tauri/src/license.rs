// T66 — POS offline license verification module.
//
// Defense-in-depth third layer (after API global LicenseGuard and Web
// middleware). The POS is allowed to operate offline for up to
// `OFFLINE_GRACE_DAYS` past the activation token's `validUntil` claim,
// after which it is hard-blocked until it can reach the API and obtain
// a fresh signed token.
//
// Design:
//   1. The API mints an RS256-signed activation token (T64) shaped
//      `header.payload.signature` (compact JWS), where:
//        - header   = {"alg":"RS256","typ":"LIC"}
//        - payload  = LicensePayload (typ:"activation", validUntil, fphash, ...)
//        - signature = RSA-PKCS1v15-SHA256 over `header.payload`
//   2. POS calls /licensing/activation/activate online, receives the
//      token, and persists it via `cache_token` to the Tauri appdata
//      directory.
//   3. On each launch (and periodically), POS calls `verify_cached_token`.
//      Verification is 100% offline: the public key is bundled at compile
//      time via the `LICENSE_PUBLIC_KEY_PEM` env var.
//   4. If valid → status `active`. If past `validUntil` but within the
//      grace window → `grace`. Otherwise → `expired_offline` (hard block).
//
// This file MUST NOT call the network. The (existing) `check_license`
// command in main.rs handles online heartbeats; this module is the
// offline backstop.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use rsa::{pkcs1v15::VerifyingKey, pkcs8::DecodePublicKey, RsaPublicKey};
use rsa::signature::Verifier;
use rsa::sha2::Sha256;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

/// How many days past `validUntil` the POS continues to operate while
/// offline. After this window expires, POS is hard-blocked until it
/// reaches the API and obtains a fresh activation token.
const OFFLINE_GRACE_DAYS: i64 = 7;

/// Bundled RSA-2048 public key PEM. Provided at compile time via the
/// `LICENSE_PUBLIC_KEY_PEM` build-time env var. If not set (e.g. local
/// dev), the dev fallback below is used so `cargo check` still builds.
/// Production builds MUST set the env var or verification is meaningless.
const PUBLIC_KEY_PEM: &str = match option_env!("LICENSE_PUBLIC_KEY_PEM") {
    Some(p) => p,
    None => DEV_PLACEHOLDER_KEY,
};

/// 1024-bit dev placeholder so the binary still builds when no real key
/// has been baked in. Verification with this key WILL fail for any
/// production-issued license — that is the intended behavior.
const DEV_PLACEHOLDER_KEY: &str = "-----BEGIN PUBLIC KEY-----\n\
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0PLACEHOLDERPLACEHOLDER\n\
PLACEHOLDERPLACEHOLDERPLACEHOLDERPLACEHOLDERPLACEHOLDERPLACEHOLDER\n\
PLACEHOLDERPLACEHOLDERPLACEHOLDERPLACEHOLDERPLACEHOLDERPLACEHOLDER\n\
PLACEHOLDERPLACEHOLDERPLACEHOLDERPLACEHOLDERPLACEHOLDERPLACEHOLDER\n\
PLACEHOLDERPLACEHOLDERPLACEHOLDERPLACEHOLDERPLACEHOLDERPLACEHOLDER\n\
PLACEHOLDERPLACEHOLDERPLACEHOLDERPLACEHOLDERPLACEHOLDERPLACEHOLDER\n\
PLACEHOLDERPLACEHOLDERPLACEHOLDERPLACEHOLDERPLACEHOLDERPLACEHOLDER\n\
-----END PUBLIC KEY-----\n";

/// Status returned to the JS layer on every license check.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LicenseStatus {
    /// `active` | `grace` | `expired_offline` | `missing` | `invalid`
    pub status: String,
    /// True when POS is allowed to keep running.
    pub allowed: bool,
    /// ISO timestamp of token expiry (validUntil claim), or null.
    pub expires_at: Option<String>,
    /// Days remaining until token expiry. Negative when past expiry.
    pub days_remaining: Option<i64>,
    /// Days remaining within the offline grace window. Hard zero when
    /// past grace; null when not in grace yet.
    pub offline_grace_days_remaining: Option<i64>,
    /// SHA-256 fingerprint hash baked into the token (`fphash` claim).
    /// JS layer can compare against the live device fingerprint.
    pub fingerprint_hash: Option<String>,
    /// Plan code from the token, surfaced for the UI.
    pub plan_code: Option<String>,
    /// Optional human-readable reason (e.g. "signature_invalid").
    pub reason: Option<String>,
}

impl LicenseStatus {
    fn missing() -> Self {
        Self {
            status: "missing".into(),
            allowed: false,
            expires_at: None,
            days_remaining: None,
            offline_grace_days_remaining: None,
            fingerprint_hash: None,
            plan_code: None,
            reason: Some("no_cached_token".into()),
        }
    }

    fn invalid(reason: impl Into<String>) -> Self {
        Self {
            status: "invalid".into(),
            allowed: false,
            expires_at: None,
            days_remaining: None,
            offline_grace_days_remaining: None,
            fingerprint_hash: None,
            plan_code: None,
            reason: Some(reason.into()),
        }
    }
}

/// Subset of the LicensePayload claims the offline verifier cares
/// about. Extra fields in the token are ignored (forward compatible).
#[derive(Debug, Deserialize)]
struct TokenPayload {
    #[serde(rename = "validUntil")]
    valid_until: String, // ISO-8601
    #[serde(rename = "validFrom")]
    #[serde(default)]
    valid_from: Option<String>,
    #[serde(default)]
    typ: Option<String>,
    #[serde(default)]
    fphash: Option<String>,
    #[serde(default, rename = "planCode")]
    plan_code: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TokenHeader {
    alg: String,
    typ: String,
}

/// Resolve the on-disk path used to cache the activation token. Stored
/// inside the user's local appdata directory so it is per-user and not
/// readable by other accounts on the machine. Falls back to the binary's
/// own dir on pathologically weird systems where appdata is unavailable.
fn cache_path() -> PathBuf {
    let base = dirs::data_local_dir()
        .or_else(dirs::config_local_dir)
        .unwrap_or_else(|| PathBuf::from("."));
    let dir = base.join("al-ruya-erp").join("pos");
    let _ = fs::create_dir_all(&dir);
    dir.join("activation.token")
}

/// Persist a freshly minted activation token. Overwrites any prior
/// token. Caller is responsible for verifying the token first.
pub fn cache_token(token: &str) -> Result<(), String> {
    let path = cache_path();
    fs::write(&path, token).map_err(|e| format!("cache_write_failed: {e}"))?;
    Ok(())
}

/// Read the cached token from disk. Returns Ok(None) if absent.
pub fn read_cached_token() -> Result<Option<String>, String> {
    let path = cache_path();
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("cache_read_failed: {e}"))?;
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    Ok(Some(trimmed.to_string()))
}

/// Verify the cached activation token entirely offline. Returns a
/// `LicenseStatus` describing the result; never panics, never throws.
pub fn verify_cached_token() -> LicenseStatus {
    let token = match read_cached_token() {
        Ok(Some(t)) => t,
        Ok(None) => return LicenseStatus::missing(),
        Err(e) => return LicenseStatus::invalid(e),
    };

    verify_token(&token)
}

/// Verify a token string. Pure function — no I/O.
pub fn verify_token(token: &str) -> LicenseStatus {
    // 1. Split the compact JWS.
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 {
        return LicenseStatus::invalid("token_format");
    }
    let (header_b64, payload_b64, sig_b64) = (parts[0], parts[1], parts[2]);

    // 2. Decode and validate header.
    let header_bytes = match URL_SAFE_NO_PAD.decode(header_b64) {
        Ok(b) => b,
        Err(_) => return LicenseStatus::invalid("header_b64"),
    };
    let header: TokenHeader = match serde_json::from_slice(&header_bytes) {
        Ok(h) => h,
        Err(_) => return LicenseStatus::invalid("header_json"),
    };
    if header.alg != "RS256" || header.typ != "LIC" {
        return LicenseStatus::invalid("header_alg");
    }

    // 3. Verify signature against the bundled public key.
    let signing_input = format!("{header_b64}.{payload_b64}");
    let signature_bytes = match URL_SAFE_NO_PAD.decode(sig_b64) {
        Ok(b) => b,
        Err(_) => return LicenseStatus::invalid("sig_b64"),
    };
    let public_key = match RsaPublicKey::from_public_key_pem(PUBLIC_KEY_PEM) {
        Ok(k) => k,
        Err(_) => return LicenseStatus::invalid("public_key_load"),
    };
    let verifier: VerifyingKey<Sha256> = VerifyingKey::new(public_key);
    let signature = match rsa::pkcs1v15::Signature::try_from(signature_bytes.as_slice()) {
        Ok(s) => s,
        Err(_) => return LicenseStatus::invalid("sig_format"),
    };
    if verifier.verify(signing_input.as_bytes(), &signature).is_err() {
        return LicenseStatus::invalid("signature_invalid");
    }

    // 4. Parse payload claims.
    let payload_bytes = match URL_SAFE_NO_PAD.decode(payload_b64) {
        Ok(b) => b,
        Err(_) => return LicenseStatus::invalid("payload_b64"),
    };
    let payload: TokenPayload = match serde_json::from_slice(&payload_bytes) {
        Ok(p) => p,
        Err(_) => return LicenseStatus::invalid("payload_json"),
    };

    // 5. Time-window evaluation.
    let now = chrono::Utc::now();
    let valid_until = match chrono::DateTime::parse_from_rfc3339(&payload.valid_until) {
        Ok(dt) => dt.with_timezone(&chrono::Utc),
        Err(_) => return LicenseStatus::invalid("validUntil_format"),
    };
    if let Some(vf) = payload.valid_from.as_deref() {
        if let Ok(vfdt) = chrono::DateTime::parse_from_rfc3339(vf) {
            if now < vfdt.with_timezone(&chrono::Utc) {
                return LicenseStatus::invalid("not_yet_valid");
            }
        }
    }

    let days_remaining = (valid_until - now).num_days();
    let grace_deadline = valid_until + chrono::Duration::days(OFFLINE_GRACE_DAYS);

    let (status, allowed, grace_days) = if now <= valid_until {
        ("active".to_string(), true, None)
    } else if now <= grace_deadline {
        let g = (grace_deadline - now).num_days();
        ("grace".to_string(), true, Some(g))
    } else {
        ("expired_offline".to_string(), false, Some(0))
    };

    LicenseStatus {
        status,
        allowed,
        expires_at: Some(payload.valid_until),
        days_remaining: Some(days_remaining),
        offline_grace_days_remaining: grace_days,
        fingerprint_hash: payload.fphash,
        plan_code: payload.plan_code,
        reason: if payload.typ.as_deref() != Some("activation") {
            Some("non_activation_token".into())
        } else {
            None
        },
    }
}

// ─── Tauri Commands ──────────────────────────────────────────────────────────

/// Cache an activation token. JS layer calls this immediately after a
/// successful /licensing/activation/activate (or /renew) round-trip.
#[tauri::command]
pub fn cache_activation_token(token: String) -> Result<(), String> {
    cache_token(&token)
}

/// Verify the cached activation token offline. Called on POS startup
/// (and periodically thereafter) to decide whether to allow operation.
#[tauri::command]
pub fn check_offline_license() -> LicenseStatus {
    verify_cached_token()
}
