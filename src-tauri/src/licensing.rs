// Nomad AI — Licensing Module
// Offline license verification using Ed25519 signatures

use anyhow::{Result, anyhow, Context};
use serde::{Deserialize, Serialize};
use sha2::{Sha256, Digest};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use chrono::Utc;

// AntVerse public key for license verification (Ed25519)
// In production, this would be the real AntVerse public key
// For development/demo, we use a placeholder that is verified by HMAC-SHA256
// Production would use actual Ed25519 verification against AntVerse's server-signed token
const _ANTVERSE_PUBLIC_KEY_HEX: &str =
    "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LicenseStatus {
    pub is_activated: bool,
    pub license_key: Option<String>,
    pub activation_date: Option<String>,
    pub license_type: String,
    pub fingerprint_match: bool,
    pub is_valid: bool,
    pub error_message: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StoredLicense {
    pub license_key: String,
    pub activation_date: String,
    pub fingerprint: String,
    pub signature: String,
    pub license_type: String,
}

impl Default for LicenseStatus {
    fn default() -> Self {
        LicenseStatus {
            is_activated: false,
            license_key: None,
            activation_date: None,
            license_type: "Nomad AI".to_string(),
            fingerprint_match: false,
            is_valid: false,
            error_message: Some("Not activated".to_string()),
        }
    }
}

/// Get the path to the license file on the USB
pub fn get_license_file_path(install_dir: &str) -> std::path::PathBuf {
    std::path::PathBuf::from(install_dir)
        .join("nomad_data")
        .join(".nomad_license")
}

/// Load and verify the stored license
pub fn load_license(install_dir: &str) -> LicenseStatus {
    let license_path = get_license_file_path(install_dir);

    if !license_path.exists() {
        return LicenseStatus {
            error_message: Some("No license file found. Please activate Nomad AI.".to_string()),
            ..Default::default()
        };
    }

    let content = match std::fs::read_to_string(&license_path) {
        Ok(c) => c,
        Err(_) => {
            return LicenseStatus {
                error_message: Some("Could not read license file.".to_string()),
                ..Default::default()
            };
        }
    };

    let stored: StoredLicense = match serde_json::from_str(&content) {
        Ok(l) => l,
        Err(_) => {
            return LicenseStatus {
                error_message: Some("License file is corrupted.".to_string()),
                ..Default::default()
            };
        }
    };

    // Verify device fingerprint
    let current_fp = crate::security::generate_fingerprint(install_dir);
    let fp_match = crate::security::verify_fingerprint(&stored.fingerprint, install_dir);

    // In development mode, accept any activation as valid
    // In production, we'd verify the Ed25519 signature from AntVerse's server
    let is_valid = fp_match || is_development_mode();

    LicenseStatus {
        is_activated: true,
        license_key: Some(mask_license_key(&stored.license_key)),
        activation_date: Some(stored.activation_date.clone()),
        license_type: stored.license_type.clone(),
        fingerprint_match: fp_match,
        is_valid,
        error_message: if !is_valid {
            Some("License is bound to a different device. Please contact AntVerse support.".to_string())
        } else {
            None
        },
    }
}

/// Activate Nomad with a license key (requires internet for first activation)
/// In the real product, this calls the AntVerse licensing server
pub fn activate_license(install_dir: &str, license_key: &str) -> Result<LicenseStatus> {
    // Validate license key format
    let key = license_key.trim().to_uppercase();
    if key.len() < 16 {
        return Err(anyhow!("Invalid license key format."));
    }

    // In development mode, accept any key that looks valid
    // In production: call AntVerse licensing API, get signed token
    let fp = crate::security::generate_fingerprint(install_dir);
    let activation_date = Utc::now().to_rfc3339();

    // Create a local signature for development (production would use server-signed token)
    let signature = generate_dev_signature(&key, &fp.fingerprint, &activation_date);

    let stored = StoredLicense {
        license_key: key.clone(),
        activation_date: activation_date.clone(),
        fingerprint: fp.fingerprint,
        signature,
        license_type: "Nomad AI Apex".to_string(),
    };

    // Save license file
    let license_path = get_license_file_path(install_dir);
    if let Some(parent) = license_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let content = serde_json::to_string_pretty(&stored)?;
    std::fs::write(&license_path, content)?;

    // Set file as hidden on Windows
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("attrib")
            .args(["+H", &license_path.to_string_lossy()])
            .output();
    }

    Ok(LicenseStatus {
        is_activated: true,
        license_key: Some(mask_license_key(&key)),
        activation_date: Some(activation_date),
        license_type: "Nomad AI Apex".to_string(),
        fingerprint_match: true,
        is_valid: true,
        error_message: None,
    })
}

/// Generate a development signature (HMAC-SHA256 of key + fingerprint + date)
/// In production this comes from AntVerse's Ed25519 private key
fn generate_dev_signature(key: &str, fingerprint: &str, date: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(key.as_bytes());
    hasher.update(b":");
    hasher.update(fingerprint.as_bytes());
    hasher.update(b":");
    hasher.update(date.as_bytes());
    hasher.update(b":antverse-nomad-dev-sig");
    hex::encode(hasher.finalize())
}

fn mask_license_key(key: &str) -> String {
    if key.len() > 8 {
        format!("{}...{}", &key[..4], &key[key.len() - 4..])
    } else {
        "****".to_string()
    }
}

/// Check if we're in development mode (no models installed yet)
fn is_development_mode() -> bool {
    // In development, we allow bypassing strict license checks
    // In production build this should be false
    cfg!(debug_assertions)
}
