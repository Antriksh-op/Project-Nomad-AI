// Nomad AI — Inference Module
// Manages llama.cpp subprocess for local AI inference with streaming

use anyhow::{Result, anyhow, Context};
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub file_path: String,
    pub size_gb: f64,
    pub context_length: u32,
    pub is_available: bool,
    pub requires_vram_mb: u64,
    pub requires_ram_gb: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct InferenceRequest {
    pub prompt: String,
    pub system_prompt: Option<String>,
    pub max_tokens: Option<u32>,
    pub temperature: Option<f32>,
    pub context_messages: Vec<ContextMessage>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ContextMessage {
    pub role: String,
    pub content: String,
}

/// State for a running inference process
pub struct InferenceProcess {
    pub child: Option<Child>,
    pub is_running: bool,
}

impl Default for InferenceProcess {
    fn default() -> Self {
        InferenceProcess {
            child: None,
            is_running: false,
        }
    }
}

impl InferenceProcess {
    pub fn stop(&mut self) {
        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
        }
        self.is_running = false;
    }
}

/// Get the path to the llama.cpp server executable
pub fn get_llama_server_path(install_dir: &str) -> PathBuf {
    PathBuf::from(install_dir)
        .join("runtime")
        .join("llama-server.exe")
}

/// Get the path to a model file
pub fn get_model_path(install_dir: &str, model_id: &str) -> PathBuf {
    PathBuf::from(install_dir)
        .join("models")
        .join(model_id)
        .join("model.gguf")
}

/// List available models by checking for model files
pub fn get_available_models(install_dir: &str) -> Vec<ModelInfo> {
    let mut models = vec![
        ModelInfo {
            id: "low-end".to_string(),
            name: "Nomad Compact".to_string(),
            description: "Optimized for lower-end hardware. Works on most computers with 4GB+ RAM and no dedicated GPU.".to_string(),
            file_path: get_model_path(install_dir, "low-end").to_string_lossy().to_string(),
            size_gb: 4.5,
            context_length: 4096,
            is_available: false,
            requires_vram_mb: 0,
            requires_ram_gb: 6.0,
        },
        ModelInfo {
            id: "high-end".to_string(),
            name: "Nomad Pro".to_string(),
            description: "Full-performance model for powerful computers. Requires 16GB+ RAM or dedicated GPU.".to_string(),
            file_path: get_model_path(install_dir, "high-end").to_string_lossy().to_string(),
            size_gb: 14.0,
            context_length: 8192,
            is_available: false,
            requires_vram_mb: 8192,
            requires_ram_gb: 16.0,
        },
    ];

    for model in &mut models {
        let path = PathBuf::from(&model.file_path);
        model.is_available = path.exists();

        // If model file doesn't exist, check for a demo/placeholder
        if !model.is_available {
            let placeholder = PathBuf::from(install_dir)
                .join("models")
                .join(&model.id)
                .join("model.gguf");
            model.is_available = placeholder.exists();
        }
    }

    models
}

/// Format a conversation into a chat template for the model
/// Uses ChatML format which is widely compatible
pub fn format_chat_prompt(
    system_prompt: &str,
    messages: &[ContextMessage],
    user_message: &str,
) -> String {
    let mut prompt = String::new();

    // System prompt
    prompt.push_str("<|im_start|>system\n");
    prompt.push_str(system_prompt);
    prompt.push_str("<|im_end|>\n");

    // History messages
    for msg in messages {
        match msg.role.as_str() {
            "user" => {
                prompt.push_str("<|im_start|>user\n");
                prompt.push_str(&msg.content);
                prompt.push_str("<|im_end|>\n");
            }
            "assistant" => {
                prompt.push_str("<|im_start|>assistant\n");
                prompt.push_str(&msg.content);
                prompt.push_str("<|im_end|>\n");
            }
            _ => {}
        }
    }

    // Current user message
    prompt.push_str("<|im_start|>user\n");
    prompt.push_str(user_message);
    prompt.push_str("<|im_end|>\n");
    prompt.push_str("<|im_start|>assistant\n");

    prompt
}

/// Build the llama-cli command for inference
pub fn build_inference_command(
    install_dir: &str,
    model_id: &str,
    prompt: &str,
    max_tokens: u32,
    temperature: f32,
    backend: &str,
) -> Result<Command> {
    // Try llama-cli first, then llama.cpp main
    let cli_path = PathBuf::from(install_dir)
        .join("runtime")
        .join("llama-cli.exe");

    if !cli_path.exists() {
        return Err(anyhow!(
            "llama-cli.exe not found at {:?}. Please ensure the runtime is installed.",
            cli_path
        ));
    }

    let model_path = get_model_path(install_dir, model_id);
    if !model_path.exists() {
        return Err(anyhow!(
            "Model file not found at {:?}. Please ensure the model is installed.",
            model_path
        ));
    }

    let mut cmd = Command::new(&cli_path);

    cmd.arg("-m").arg(&model_path)
        .arg("-p").arg(prompt)
        .arg("-n").arg(max_tokens.to_string())
        .arg("--temp").arg(temperature.to_string())
        .arg("--ctx-size").arg("4096")
        .arg("--repeat-penalty").arg("1.1")
        .arg("--log-disable")
        .arg("--no-display-prompt")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());

    // Backend-specific flags
    match backend {
        "cuda" => {
            cmd.arg("-ngl").arg("999"); // Offload all layers to GPU
        }
        "vulkan" => {
            cmd.arg("-ngl").arg("999");
        }
        _ => {
            // CPU mode — use number of threads
            let threads = std::thread::available_parallelism()
                .map(|n| n.get())
                .unwrap_or(4);
            cmd.arg("-t").arg(threads.to_string());
        }
    }

    Ok(cmd)
}

/// Simple synchronous inference for when streaming is not available
/// Returns the complete response as a string
pub fn run_inference_sync(
    install_dir: &str,
    model_id: &str,
    prompt: &str,
    max_tokens: u32,
    temperature: f32,
    backend: &str,
) -> Result<String> {
    let mut cmd = build_inference_command(
        install_dir,
        model_id,
        prompt,
        max_tokens,
        temperature,
        backend,
    )?;

    let output = cmd.output().context("Failed to execute llama-cli")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow!("Inference failed: {}", stderr));
    }

    let response = String::from_utf8_lossy(&output.stdout).to_string();
    // Clean up any stop tokens that might have leaked
    let cleaned = response
        .replace("<|im_end|>", "")
        .replace("<|im_start|>", "")
        .trim()
        .to_string();

    Ok(cleaned)
}

/// Default system prompt for Nomad AI
pub fn get_default_system_prompt() -> String {
    "You are Nomad AI, a helpful, accurate, and private AI assistant by AntVerse. \
     You run completely offline and locally on the user's device. \
     Be helpful, concise, and honest. \
     If you don't know something, say so rather than making things up. \
     You respect user privacy — no data ever leaves this device.".to_string()
}
