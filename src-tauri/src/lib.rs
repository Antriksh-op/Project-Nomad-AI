// Nomad AI — Rust Backend Core
// AntVerse Apex Tier Product

pub mod commands;
pub mod database;
pub mod security;
pub mod hardware;
pub mod inference;
pub mod licensing;

use tauri::Manager;
use once_cell::sync::OnceCell;
use std::sync::Mutex;

pub static APP_STATE: OnceCell<Mutex<AppState>> = OnceCell::new();

#[derive(Debug, Default)]
pub struct AppState {
    pub db_path: String,
    pub is_unlocked: bool,
    pub has_password: bool,
    pub current_model: String,
    pub inference_running: bool,
    pub install_dir: String,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Determine install directory (relative to exe for portability)
            let exe_path = std::env::current_exe()
                .unwrap_or_else(|_| std::path::PathBuf::from("."));
            let install_dir = exe_path
                .parent()
                .unwrap_or(std::path::Path::new("."))
                .to_string_lossy()
                .to_string();

            let db_path = format!("{}/nomad_data/nomad.db", install_dir);

            // Initialize app state
            APP_STATE.get_or_init(|| {
                Mutex::new(AppState {
                    db_path: db_path.clone(),
                    is_unlocked: false,
                    has_password: false,
                    current_model: "low-end".to_string(),
                    inference_running: false,
                    install_dir: install_dir.clone(),
                })
            });

            // Initialize database
            if let Err(e) = database::init_database(&db_path) {
                log::error!("Failed to initialize database: {}", e);
            }

            // Check if password protection is enabled
            if let Ok(has_pw) = database::check_has_password(&db_path) {
                if let Ok(mut state) = APP_STATE.get().unwrap().lock() {
                    state.has_password = has_pw;
                    if !has_pw {
                        state.is_unlocked = true;
                    }
                }
            }

            let main_window = app.get_webview_window("main").unwrap();
            main_window.set_decorations(false).unwrap();

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // App state
            commands::get_app_state,
            commands::unlock_app,
            commands::set_password,
            commands::change_password,
            commands::disable_password,
            // Chat commands
            commands::get_chats,
            commands::create_chat,
            commands::delete_chat,
            commands::rename_chat,
            commands::get_messages,
            commands::search_chats,
            commands::export_chat,
            // Inference
            commands::send_message_cmd,
            commands::stop_inference,
            commands::get_available_models,
            commands::set_model,
            commands::get_current_model,
            // Hardware
            commands::detect_hardware,
            // Settings
            commands::get_settings,
            commands::set_setting,
            // File processing
            commands::process_file,
            // License
            commands::get_license_status,
            commands::activate_license,
            // System
            commands::get_app_version,
            commands::safe_exit,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Nomad AI");
}
