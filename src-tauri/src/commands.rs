// Nomad AI — Tauri Command Handlers
// All frontend-callable commands are defined here

use crate::{APP_STATE, database, security, hardware, inference, licensing};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use std::sync::Mutex;
use std::thread;

// ─── STATE ──────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppStateDto {
    pub is_unlocked: bool,
    pub has_password: bool,
    pub current_model: String,
    pub install_dir: String,
    pub is_activated: bool,
}

#[tauri::command]
pub async fn get_app_state() -> Result<AppStateDto, String> {
    let state = APP_STATE.get()
        .ok_or("App state not initialized")?
        .lock()
        .map_err(|e| e.to_string())?;

    let license = licensing::load_license(&state.install_dir);

    Ok(AppStateDto {
        is_unlocked: state.is_unlocked,
        has_password: state.has_password,
        current_model: state.current_model.clone(),
        install_dir: state.install_dir.clone(),
        is_activated: license.is_valid || license.is_activated,
    })
}

#[tauri::command]
pub async fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
pub async fn safe_exit(app: AppHandle) {
    // Graceful shutdown: in a real app, we'd stop inference, flush DB, etc.
    log::info!("Safe exit requested");
    app.exit(0);
}

// ─── SECURITY / AUTH ────────────────────────────────────────────────────────

#[tauri::command]
pub async fn unlock_app(password: String) -> Result<bool, String> {
    let (db_path, install_dir) = {
        let state = APP_STATE.get()
            .ok_or("State not initialized")?
            .lock()
            .map_err(|e| e.to_string())?;
        (state.db_path.clone(), state.install_dir.clone())
    };

    let record = database::get_security_record(&db_path)
        .map_err(|e| e.to_string())?;

    if !record.has_password {
        // No password set — auto-unlock
        if let Ok(mut state) = APP_STATE.get().unwrap().lock() {
            state.is_unlocked = true;
        }
        return Ok(true);
    }

    let hash = record.password_hash.ok_or("No password hash found")?;
    let is_valid = security::verify_password(&password, &hash)
        .map_err(|e| e.to_string())?;

    if is_valid {
        if let Ok(mut state) = APP_STATE.get().unwrap().lock() {
            state.is_unlocked = true;
        }
    }

    Ok(is_valid)
}

#[tauri::command]
pub async fn set_password(password: String) -> Result<(), String> {
    let db_path = {
        let state = APP_STATE.get().ok_or("State not initialized")?.lock().map_err(|e| e.to_string())?;
        state.db_path.clone()
    };

    let hash = security::hash_password(&password).map_err(|e| e.to_string())?;
    let salt = security::generate_salt();

    database::set_security_record(&db_path, true, Some(&hash), Some(&salt), None)
        .map_err(|e| e.to_string())?;

    if let Ok(mut state) = APP_STATE.get().unwrap().lock() {
        state.has_password = true;
        state.is_unlocked = true;
    }

    Ok(())
}

#[tauri::command]
pub async fn change_password(old_password: String, new_password: String) -> Result<(), String> {
    let db_path = {
        let state = APP_STATE.get().ok_or("State not initialized")?.lock().map_err(|e| e.to_string())?;
        state.db_path.clone()
    };

    let record = database::get_security_record(&db_path).map_err(|e| e.to_string())?;
    if let Some(hash) = &record.password_hash {
        let is_valid = security::verify_password(&old_password, hash).map_err(|e| e.to_string())?;
        if !is_valid {
            return Err("Current password is incorrect".to_string());
        }
    }

    let new_hash = security::hash_password(&new_password).map_err(|e| e.to_string())?;
    database::set_security_record(&db_path, true, Some(&new_hash), record.salt.as_deref(), None)
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn disable_password(password: String) -> Result<(), String> {
    let db_path = {
        let state = APP_STATE.get().ok_or("State not initialized")?.lock().map_err(|e| e.to_string())?;
        state.db_path.clone()
    };

    let record = database::get_security_record(&db_path).map_err(|e| e.to_string())?;
    if let Some(hash) = &record.password_hash {
        let is_valid = security::verify_password(&password, hash).map_err(|e| e.to_string())?;
        if !is_valid {
            return Err("Password is incorrect".to_string());
        }
    }

    database::set_security_record(&db_path, false, None, None, None)
        .map_err(|e| e.to_string())?;

    if let Ok(mut state) = APP_STATE.get().unwrap().lock() {
        state.has_password = false;
        state.is_unlocked = true;
    }

    Ok(())
}

// ─── CHAT COMMANDS ──────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_chats() -> Result<Vec<database::Chat>, String> {
    let db_path = get_db_path()?;
    database::get_all_chats(&db_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_chat(title: String) -> Result<database::Chat, String> {
    let db_path = get_db_path()?;
    database::create_chat(&db_path, &title).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_chat(chat_id: String) -> Result<(), String> {
    let db_path = get_db_path()?;
    database::delete_chat(&db_path, &chat_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn rename_chat(chat_id: String, new_title: String) -> Result<(), String> {
    let db_path = get_db_path()?;
    database::rename_chat(&db_path, &chat_id, &new_title).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_messages(chat_id: String) -> Result<Vec<database::Message>, String> {
    let db_path = get_db_path()?;
    database::get_messages(&db_path, &chat_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn search_chats(query: String) -> Result<Vec<database::Chat>, String> {
    let db_path = get_db_path()?;
    database::search_chats(&db_path, &query).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_chat(chat_id: String, format: String) -> Result<String, String> {
    let db_path = get_db_path()?;
    let (chat, messages) = database::get_export_data(&db_path, &chat_id)
        .map_err(|e| e.to_string())?;

    match format.as_str() {
        "txt" => {
            let mut output = format!("Chat: {}\nDate: {}\n\n", chat.title, chat.created_at);
            for msg in &messages {
                let role = if msg.role == "user" { "You" } else { "Nomad AI" };
                output.push_str(&format!("[{}] {}: {}\n\n", msg.created_at, role, msg.content));
            }
            Ok(output)
        }
        "md" | "markdown" => {
            let mut output = format!("# {}\n\n*Exported: {}*\n\n---\n\n", chat.title, chat.created_at);
            for msg in &messages {
                let role = if msg.role == "user" { "**You**" } else { "**Nomad AI**" };
                output.push_str(&format!("{}\n\n{}\n\n---\n\n", role, msg.content));
            }
            Ok(output)
        }
        "json" => {
            serde_json::to_string_pretty(&serde_json::json!({
                "chat": chat,
                "messages": messages,
                "exported_at": chrono::Utc::now().to_rfc3339(),
                "app": "Nomad AI by AntVerse"
            })).map_err(|e| e.to_string())
        }
        _ => Err(format!("Unknown export format: {}", format)),
    }
}

// ─── INFERENCE COMMANDS ──────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone)]
pub struct InferenceChunk {
    pub token: String,
    pub done: bool,
    pub message_id: String,
}

#[tauri::command]
pub async fn send_message_cmd(
    app: AppHandle,
    chat_id: String,
    content: String,
    file_context: Option<String>,
) -> Result<database::Message, String> {
    let (db_path, install_dir, model, backend) = {
        let state = APP_STATE.get().ok_or("State not initialized")?.lock().map_err(|e| e.to_string())?;
        (
            state.db_path.clone(),
            state.install_dir.clone(),
            state.current_model.clone(),
            database::get_setting(&state.db_path, "backend")
                .unwrap_or(None)
                .unwrap_or_else(|| "cpu".to_string()),
        )
    };

    // Save user message to database
    let user_msg = database::add_message(&db_path, &chat_id, "user", &content, None, None)
        .map_err(|e| e.to_string())?;

    // Get conversation history for context (last 20 messages)
    let history = database::get_messages(&db_path, &chat_id)
        .map_err(|e| e.to_string())?;

    let context_messages: Vec<inference::ContextMessage> = history.iter()
        .filter(|m| m.id != user_msg.id)
        .rev().take(20).rev()
        .map(|m| inference::ContextMessage {
            role: m.role.clone(),
            content: m.content.clone(),
        })
        .collect();

    // Build system prompt (include file context if any)
    let system_prompt = if let Some(ctx) = &file_context {
        format!(
            "{}\n\nThe user has provided the following document context:\n\n{}\n\nAnswer based on this context when relevant.",
            inference::get_default_system_prompt(),
            ctx
        )
    } else {
        inference::get_default_system_prompt()
    };

    // Format the full prompt
    let full_prompt = inference::format_chat_prompt(
        &system_prompt,
        &context_messages,
        &content,
    );

    // Create placeholder assistant message
    let ai_msg = database::add_message(&db_path, &chat_id, "assistant", "...", None, None)
        .map_err(|e| e.to_string())?;
    let ai_msg_id = ai_msg.id.clone();

    // Check if runtime exists
    let runtime_path = std::path::PathBuf::from(&install_dir)
        .join("runtime")
        .join("llama-cli.exe");

    if !runtime_path.exists() {
        // Development mode: return a demo response
        let demo_response = generate_demo_response(&content);
        database::update_message_content(&db_path, &ai_msg_id, &demo_response)
            .map_err(|e| e.to_string())?;

        // Emit streaming tokens for UI animation
        let tokens: Vec<&str> = demo_response.split_whitespace().collect();
        for token in &tokens {
            let chunk = InferenceChunk {
                token: format!("{} ", token),
                done: false,
                message_id: ai_msg_id.clone(),
            };
            let _ = app.emit("inference_chunk", &chunk);
            thread::sleep(std::time::Duration::from_millis(30));
        }
        let done_chunk = InferenceChunk {
            token: String::new(),
            done: true,
            message_id: ai_msg_id.clone(),
        };
        let _ = app.emit("inference_chunk", &done_chunk);

        return Ok(ai_msg);
    }

    // Real inference: spawn process and stream
    let db_path_clone = db_path.clone();
    let ai_msg_id_clone = ai_msg_id.clone();
    let app_clone = app.clone();

    thread::spawn(move || {
        let result = inference::run_inference_sync(
            &install_dir,
            &model,
            &full_prompt,
            1024,
            0.7,
            &backend,
        );

        match result {
            Ok(response) => {
                let _ = database::update_message_content(&db_path_clone, &ai_msg_id_clone, &response);
                let done_chunk = InferenceChunk {
                    token: response,
                    done: true,
                    message_id: ai_msg_id_clone,
                };
                let _ = app_clone.emit("inference_chunk", &done_chunk);
            }
            Err(e) => {
                let error_msg = format!("Error: {}", e);
                let _ = database::update_message_content(&db_path_clone, &ai_msg_id_clone, &error_msg);
                let done_chunk = InferenceChunk {
                    token: error_msg,
                    done: true,
                    message_id: ai_msg_id_clone,
                };
                let _ = app_clone.emit("inference_chunk", &done_chunk);
            }
        }
    });

    Ok(ai_msg)
}

fn generate_demo_response(user_message: &str) -> String {
    let msg = user_message.to_lowercase();
    if msg.contains("hello") || msg.contains("hi") || msg.contains("hey") {
        "Hello! I'm Nomad AI, your private offline AI assistant by AntVerse. I'm running entirely on your device — no internet, no cloud, just your AI wherever you go. How can I help you today?".to_string()
    } else if msg.contains("what") && msg.contains("nomad") {
        "Nomad AI is AntVerse's Apex-tier portable AI assistant. I run completely offline on your USB drive, so your conversations and data never leave your device. I travel with you — plug me into any compatible Windows PC and I'm ready to go.".to_string()
    } else if msg.contains("privacy") || msg.contains("data") || msg.contains("secure") {
        "Your privacy is my core design principle. Everything you tell me stays on your USB drive — no telemetry, no cloud sync, no data uploads. Not even AntVerse can access your conversations. Your AI. Your data. Your device.".to_string()
    } else if msg.contains("help") {
        "I can help you with:\n\n• **Writing** — drafting, editing, and reviewing text\n• **Research** — analyzing and summarizing documents you provide\n• **Coding** — writing, debugging, and explaining code\n• **Problem-solving** — thinking through complex challenges\n• **Conversation** — just chatting and brainstorming\n\nNote: The AI runtime needs to be installed for full capability. You're currently in demo mode.".to_string()
    } else if msg.contains("model") || msg.contains("ai") {
        "I currently operate in demo mode since the AI runtime isn't installed yet. In the full version, I use a local AI model running on your hardware — either the Nomad Compact model (optimized for most PCs) or Nomad Pro (for powerful systems). Both run 100% offline.".to_string()
    } else {
        format!("I received your message: \"{}\"\n\nI'm currently running in **demo mode** because the AI runtime hasn't been installed yet. In the full version, I would process this locally using a built-in language model without any internet connection.\n\nTo enable full AI capabilities, please install the Nomad runtime and AI models.", user_message)
    }
}

#[tauri::command]
pub async fn stop_inference() -> Result<(), String> {
    // In a full implementation, this would signal the inference thread to stop
    log::info!("Stop inference requested");
    Ok(())
}

#[tauri::command]
pub async fn get_available_models() -> Result<Vec<inference::ModelInfo>, String> {
    let install_dir = {
        let state = APP_STATE.get().ok_or("State not initialized")?.lock().map_err(|e| e.to_string())?;
        state.install_dir.clone()
    };
    Ok(inference::get_available_models(&install_dir))
}

#[tauri::command]
pub async fn set_model(model_id: String) -> Result<(), String> {
    let valid_models = ["low-end", "high-end"];
    if !valid_models.contains(&model_id.as_str()) {
        return Err(format!("Invalid model ID: {}", model_id));
    }
    if let Ok(mut state) = APP_STATE.get().ok_or("State not initialized")?.lock() {
        state.current_model = model_id.clone();
    }
    // Persist to settings
    let db_path = get_db_path()?;
    database::set_setting(&db_path, "current_model", &model_id)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_current_model() -> Result<String, String> {
    let state = APP_STATE.get().ok_or("State not initialized")?.lock().map_err(|e| e.to_string())?;
    Ok(state.current_model.clone())
}

// ─── HARDWARE ────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn detect_hardware() -> hardware::HardwareInfo {
    hardware::detect_hardware()
}

// ─── SETTINGS ────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_settings() -> Result<Vec<database::Setting>, String> {
    let db_path = get_db_path()?;
    database::get_all_settings(&db_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_setting(key: String, value: String) -> Result<(), String> {
    let db_path = get_db_path()?;
    database::set_setting(&db_path, &key, &value).map_err(|e| e.to_string())
}

// ─── FILE PROCESSING ─────────────────────────────────────────────────────────

#[tauri::command]
pub async fn process_file(file_path: String, file_type: String) -> Result<String, String> {
    let content = std::fs::read_to_string(&file_path)
        .map_err(|e| format!("Could not read file: {}", e))?;

    // Basic text extraction (real implementation would handle PDF, DOCX, etc.)
    let processed = match file_type.to_lowercase().as_str() {
        "txt" | "md" | "markdown" | "csv" | "json" | "rs" | "py" | "js" | "ts" | "html" | "css" => {
            // Plain text or code files — use directly
            if content.len() > 50000 {
                // Truncate very large files to first 50k chars
                format!("[Note: File truncated to first 50,000 characters]\n\n{}", &content[..50000])
            } else {
                content
            }
        }
        _ => {
            // Try to read as UTF-8 text for other formats
            content
        }
    };

    Ok(processed)
}

// ─── LICENSE ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_license_status() -> licensing::LicenseStatus {
    let install_dir = match APP_STATE.get() {
        Some(state) => state.lock().map(|s| s.install_dir.clone()).unwrap_or_default(),
        None => String::new(),
    };
    licensing::load_license(&install_dir)
}

#[tauri::command]
pub async fn activate_license(license_key: String) -> Result<licensing::LicenseStatus, String> {
    let install_dir = {
        let state = APP_STATE.get().ok_or("State not initialized")?.lock().map_err(|e| e.to_string())?;
        state.install_dir.clone()
    };
    licensing::activate_license(&install_dir, &license_key).map_err(|e| e.to_string())
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

fn get_db_path() -> Result<String, String> {
    APP_STATE.get()
        .ok_or("App state not initialized".to_string())?
        .lock()
        .map(|s| s.db_path.clone())
        .map_err(|e| e.to_string())
}
