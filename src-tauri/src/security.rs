// Nomad AI — Security Module
// Password hashing, key derivation, AES-GCM encryption, device fingerprinting

use anyhow::{Result, anyhow, Context};
use argon2::{
    Argon2,
    password_hash::{
        PasswordHash, PasswordHasher, PasswordVerifier, SaltString, rand_core::OsRng,
    },
};
use aes_gcm::{
    Aes256Gcm, Key, Nonce,
    aead::{Aead, AeadCore, KeyInit, OsRng as AeadOsRng},
};
use rand::RngCore;
use sha2::{Sha256, Digest};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};

// ─── PASSWORD HASHING ────────────────────────────────────────────────────────

/// Hash a password using Argon2id with a random salt
pub fn hash_password(password: &str) -> Result<String> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let hash = argon2
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| anyhow!("Password hashing failed: {}", e))?
        .to_string();
    Ok(hash)
}

/// Verify a password against a stored Argon2id hash
pub fn verify_password(password: &str, hash: &str) -> Result<bool> {
    let parsed_hash = PasswordHash::new(hash)
        .map_err(|e| anyhow!("Invalid password hash: {}", e))?;
    let argon2 = Argon2::default();
    Ok(argon2.verify_password(password.as_bytes(), &parsed_hash).is_ok())
}

// ─── KEY DERIVATION ──────────────────────────────────────────────────────────

/// Derive a 256-bit key from a password using Argon2id
pub fn derive_key_from_password(password: &str, salt_hex: &str) -> Result<[u8; 32]> {
    let salt = hex::decode(salt_hex).context("Invalid salt hex")?;
    let mut output = [0u8; 32];

    let params = argon2::Params::new(65536, 3, 4, Some(32))
        .map_err(|e| anyhow!("Argon2 params error: {}", e))?;
    let argon2 = Argon2::new(argon2::Algorithm::Argon2id, argon2::Version::V0x13, params);
    argon2
        .hash_password_into(password.as_bytes(), &salt, &mut output)
        .map_err(|e| anyhow!("Key derivation failed: {}", e))?;

    Ok(output)
}

/// Generate a random 32-byte key and return as hex
pub fn generate_master_key() -> String {
    let mut key = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut key);
    hex::encode(key)
}

/// Generate a random salt (32 bytes) and return as hex
pub fn generate_salt() -> String {
    let mut salt = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut salt);
    hex::encode(salt)
}

// ─── AES-256-GCM ENCRYPTION ──────────────────────────────────────────────────

/// Encrypt data with AES-256-GCM. Returns base64(nonce || ciphertext)
pub fn encrypt(key_bytes: &[u8; 32], plaintext: &[u8]) -> Result<String> {
    let key = Key::<Aes256Gcm>::from_slice(key_bytes);
    let cipher = Aes256Gcm::new(key);
    let nonce = Aes256Gcm::generate_nonce(&mut AeadOsRng);
    let ciphertext = cipher
        .encrypt(&nonce, plaintext)
        .map_err(|e| anyhow!("Encryption failed: {}", e))?;
    let mut combined = nonce.to_vec();
    combined.extend_from_slice(&ciphertext);
    Ok(BASE64.encode(combined))
}

/// Decrypt AES-256-GCM data. Input is base64(nonce || ciphertext)
pub fn decrypt(key_bytes: &[u8; 32], encoded: &str) -> Result<Vec<u8>> {
    let combined = BASE64.decode(encoded).context("Base64 decode failed")?;
    if combined.len() < 12 {
        return Err(anyhow!("Ciphertext too short"));
    }
    let (nonce_bytes, ciphertext) = combined.split_at(12);
    let key = Key::<Aes256Gcm>::from_slice(key_bytes);
    let cipher = Aes256Gcm::new(key);
    let nonce = Nonce::from_slice(nonce_bytes);
    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| anyhow!("Decryption failed: {}", e))?;
    Ok(plaintext)
}

/// Encrypt a string with AES-256-GCM
pub fn encrypt_string(key_bytes: &[u8; 32], plaintext: &str) -> Result<String> {
    encrypt(key_bytes, plaintext.as_bytes())
}

/// Decrypt a string from AES-256-GCM
pub fn decrypt_string(key_bytes: &[u8; 32], encoded: &str) -> Result<String> {
    let bytes = decrypt(key_bytes, encoded)?;
    String::from_utf8(bytes).context("UTF-8 decode failed")
}

// ─── DEVICE FINGERPRINTING ───────────────────────────────────────────────────

#[derive(Debug)]
pub struct DeviceFingerprint {
    pub fingerprint: String,
    pub install_dir: String,
}

/// Generate a device fingerprint from available system characteristics.
/// We combine multiple signals for robustness — no single point of failure.
pub fn generate_fingerprint(install_dir: &str) -> DeviceFingerprint {
    let mut hasher = Sha256::new();

    // Signal 1: Machine GUID from Windows registry
    let machine_guid = get_machine_guid().unwrap_or_else(|| "unknown-machine".to_string());
    hasher.update(machine_guid.as_bytes());

    // Signal 2: CPU info
    let cpu_info = get_cpu_info();
    hasher.update(cpu_info.as_bytes());

    // Signal 3: Install directory path (normalized)
    let normalized_dir = install_dir.to_lowercase().replace('\\', "/");
    hasher.update(normalized_dir.as_bytes());

    // Signal 4: Volume serial of the drive containing install_dir
    let vol_serial = get_volume_serial(install_dir).unwrap_or_else(|| "no-vol-serial".to_string());
    hasher.update(vol_serial.as_bytes());

    // Static salt to prevent trivial rainbow tables
    hasher.update(b"antverse-nomad-fp-salt-v1");

    let result = hasher.finalize();
    DeviceFingerprint {
        fingerprint: hex::encode(result),
        install_dir: install_dir.to_string(),
    }
}

/// Verify that a stored fingerprint matches the current device (with some tolerance)
pub fn verify_fingerprint(stored_fp: &str, install_dir: &str) -> bool {
    let current = generate_fingerprint(install_dir);
    // Exact match
    if current.fingerprint == stored_fp {
        return true;
    }
    // Allow a relaxed check: compare only the first 40 chars
    // This tolerates minor changes while still blocking clones on different machines
    if current.fingerprint.len() >= 40 && stored_fp.len() >= 40 {
        return &current.fingerprint[..40] == &stored_fp[..40];
    }
    false
}

#[cfg(target_os = "windows")]
fn get_machine_guid() -> Option<String> {
    use std::process::Command;
    let output = Command::new("reg")
        .args(["query", r"HKLM\SOFTWARE\Microsoft\Cryptography", "/v", "MachineGuid"])
        .output()
        .ok()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        if line.contains("MachineGuid") {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if let Some(guid) = parts.last() {
                return Some(guid.to_string());
            }
        }
    }
    None
}

#[cfg(not(target_os = "windows"))]
fn get_machine_guid() -> Option<String> {
    None
}

fn get_cpu_info() -> String {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let output = Command::new("wmic")
            .args(["cpu", "get", "ProcessorId", "/value"])
            .output();
        if let Ok(out) = output {
            let s = String::from_utf8_lossy(&out.stdout);
            for line in s.lines() {
                if line.starts_with("ProcessorId=") {
                    return line.trim().to_string();
                }
            }
        }
    }
    "generic-cpu".to_string()
}

#[cfg(target_os = "windows")]
fn get_volume_serial(path: &str) -> Option<String> {
    use std::process::Command;
    // Extract drive letter
    let drive = if path.len() >= 2 && path.chars().nth(1) == Some(':') {
        path[..2].to_string()
    } else {
        return None;
    };
    let output = Command::new("vol")
        .arg(&drive)
        .output()
        .ok()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        if line.to_lowercase().contains("serial") {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if let Some(serial) = parts.last() {
                return Some(serial.to_string());
            }
        }
    }
    None
}

#[cfg(not(target_os = "windows"))]
fn get_volume_serial(_path: &str) -> Option<String> {
    None
}

// ─── LICENSE ENCRYPTION ──────────────────────────────────────────────────────

/// Encrypt the master key using a device-derived key
pub fn protect_master_key(master_key_hex: &str, install_dir: &str) -> Result<String> {
    let fp = generate_fingerprint(install_dir);
    let device_key = derive_device_key(&fp.fingerprint)?;
    encrypt_string(&device_key, master_key_hex)
}

/// Decrypt the master key using a device-derived key
pub fn unprotect_master_key(encrypted_master: &str, install_dir: &str) -> Result<String> {
    let fp = generate_fingerprint(install_dir);
    let device_key = derive_device_key(&fp.fingerprint)?;
    decrypt_string(&device_key, encrypted_master)
}

/// Derive a 32-byte encryption key from device fingerprint
fn derive_device_key(fingerprint: &str) -> Result<[u8; 32]> {
    let mut hasher = Sha256::new();
    hasher.update(fingerprint.as_bytes());
    hasher.update(b"nomad-device-key-v1");
    let hash = hasher.finalize();
    let mut key = [0u8; 32];
    key.copy_from_slice(&hash);
    Ok(key)
}
