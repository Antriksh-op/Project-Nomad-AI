// Nomad AI — Hardware Detection Module
// Detects CPU, RAM, GPU, VRAM to recommend optimal AI model

use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HardwareInfo {
    pub cpu_name: String,
    pub cpu_cores: u32,
    pub cpu_threads: u32,
    pub cpu_arch: String,
    pub ram_gb: f64,
    pub gpu_name: String,
    pub gpu_vendor: String,
    pub vram_mb: u64,
    pub has_dedicated_gpu: bool,
    pub cuda_capable: bool,
    pub vulkan_capable: bool,
    pub recommended_model: String,
    pub recommended_backend: String,
    pub os_version: String,
}

impl Default for HardwareInfo {
    fn default() -> Self {
        HardwareInfo {
            cpu_name: "Unknown CPU".to_string(),
            cpu_cores: 4,
            cpu_threads: 8,
            cpu_arch: "x86_64".to_string(),
            ram_gb: 8.0,
            gpu_name: "Unknown".to_string(),
            gpu_vendor: "Unknown".to_string(),
            vram_mb: 0,
            has_dedicated_gpu: false,
            cuda_capable: false,
            vulkan_capable: false,
            recommended_model: "low-end".to_string(),
            recommended_backend: "cpu".to_string(),
            os_version: "Windows".to_string(),
        }
    }
}

pub fn detect_hardware() -> HardwareInfo {
    let mut info = HardwareInfo::default();

    #[cfg(target_os = "windows")]
    {
        detect_windows_hardware(&mut info);
    }

    // Determine recommendations
    info.recommended_model = recommend_model(&info);
    info.recommended_backend = recommend_backend(&info);

    info
}

#[cfg(target_os = "windows")]
fn detect_windows_hardware(info: &mut HardwareInfo) {
    // CPU info via WMIC
    if let Some(cpu_name) = wmic_query("cpu", "Name") {
        info.cpu_name = cpu_name.trim().to_string();
    }
    if let Some(cores) = wmic_query("cpu", "NumberOfCores") {
        info.cpu_cores = cores.trim().parse().unwrap_or(4);
    }
    if let Some(threads) = wmic_query("cpu", "NumberOfLogicalProcessors") {
        info.cpu_threads = threads.trim().parse().unwrap_or(8);
    }

    // RAM info
    if let Some(ram_kb) = wmic_query("ComputerSystem", "TotalPhysicalMemory") {
        if let Ok(bytes) = ram_kb.trim().parse::<u64>() {
            info.ram_gb = bytes as f64 / (1024.0 * 1024.0 * 1024.0);
        }
    }

    // GPU info
    if let Some(gpu_name) = wmic_query("path win32_VideoController", "Name") {
        let gpu = gpu_name.trim().to_string();
        info.gpu_name = gpu.clone();

        // Detect NVIDIA
        if gpu.to_lowercase().contains("nvidia") || gpu.to_lowercase().contains("geforce")
            || gpu.to_lowercase().contains("quadro") || gpu.to_lowercase().contains("rtx")
            || gpu.to_lowercase().contains("gtx")
        {
            info.gpu_vendor = "NVIDIA".to_string();
            info.has_dedicated_gpu = true;
            info.cuda_capable = true;
        } else if gpu.to_lowercase().contains("amd") || gpu.to_lowercase().contains("radeon")
            || gpu.to_lowercase().contains("rx ")
        {
            info.gpu_vendor = "AMD".to_string();
            info.has_dedicated_gpu = true;
            info.vulkan_capable = true;
        } else if gpu.to_lowercase().contains("intel") {
            info.gpu_vendor = "Intel".to_string();
            info.has_dedicated_gpu = false;
            // Intel Arc GPUs have more VRAM
            if gpu.to_lowercase().contains("arc") {
                info.has_dedicated_gpu = true;
            }
        }
    }

    // VRAM
    if let Some(vram) = wmic_query("path win32_VideoController", "AdapterRAM") {
        if let Ok(bytes) = vram.trim().parse::<u64>() {
            info.vram_mb = bytes / (1024 * 1024);
        }
    }

    // OS version
    if let Some(os) = wmic_query("os", "Caption") {
        info.os_version = os.trim().to_string();
    }

    // CPU architecture
    info.cpu_arch = std::env::consts::ARCH.to_string();
}

fn wmic_query(class: &str, property: &str) -> Option<String> {
    let output = Command::new("wmic")
        .args([class, "get", property, "/value"])
        .output()
        .ok()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        let prefix = format!("{}=", property);
        if line.starts_with(&prefix) || line.starts_with(&prefix.to_uppercase()) {
            let val = line[prefix.len()..].trim().to_string();
            if !val.is_empty() {
                return Some(val);
            }
        }
    }
    None
}

fn recommend_model(info: &HardwareInfo) -> String {
    // High-end: 16+ GB RAM, dedicated GPU with 8+ GB VRAM
    if info.ram_gb >= 16.0 && info.has_dedicated_gpu && info.vram_mb >= 8192 {
        return "high-end".to_string();
    }
    // Medium-high: 16+ GB RAM, decent GPU
    if info.ram_gb >= 16.0 && info.has_dedicated_gpu && info.vram_mb >= 4096 {
        return "high-end".to_string();
    }
    // Medium: 16+ GB RAM, integrated graphics
    if info.ram_gb >= 16.0 {
        return "high-end".to_string();
    }
    // Default: low-end for anything < 16 GB RAM
    "low-end".to_string()
}

fn recommend_backend(info: &HardwareInfo) -> String {
    if info.cuda_capable && info.vram_mb >= 4096 {
        return "cuda".to_string();
    }
    if info.vulkan_capable && info.vram_mb >= 4096 {
        return "vulkan".to_string();
    }
    "cpu".to_string()
}
