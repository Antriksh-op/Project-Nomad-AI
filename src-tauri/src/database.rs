// Nomad AI — Database Module
// Handles SQLite storage for chats, messages, settings, and security state

use anyhow::{Result, Context};
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use chrono::Utc;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Chat {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
    pub message_count: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Message {
    pub id: String,
    pub chat_id: String,
    pub role: String,   // "user" | "assistant" | "system"
    pub content: String,
    pub created_at: String,
    pub file_name: Option<String>,
    pub file_type: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Setting {
    pub key: String,
    pub value: String,
}

fn open_conn(db_path: &str) -> Result<Connection> {
    // Ensure parent directory exists
    if let Some(parent) = std::path::Path::new(db_path).parent() {
        std::fs::create_dir_all(parent)?;
    }
    let conn = Connection::open(db_path)?;
    // Enable WAL mode for better performance and reliability
    conn.execute_batch("
        PRAGMA journal_mode=WAL;
        PRAGMA synchronous=NORMAL;
        PRAGMA foreign_keys=ON;
        PRAGMA cache_size=4000;
        PRAGMA temp_store=MEMORY;
    ")?;
    Ok(conn)
}

pub fn init_database(db_path: &str) -> Result<()> {
    let conn = open_conn(db_path)?;

    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS chats (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL DEFAULT 'New Chat',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            chat_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL,
            file_name TEXT,
            file_type TEXT,
            FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS security (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            has_password INTEGER NOT NULL DEFAULT 0,
            password_hash TEXT,
            salt TEXT,
            master_key_encrypted TEXT,
            created_at TEXT,
            updated_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
        CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
        CREATE INDEX IF NOT EXISTS idx_chats_updated_at ON chats(updated_at);

        INSERT OR IGNORE INTO security (id, has_password, created_at, updated_at)
        VALUES (1, 0, datetime('now'), datetime('now'));
    ")?;

    Ok(())
}

pub fn check_has_password(db_path: &str) -> Result<bool> {
    let conn = open_conn(db_path)?;
    let has_pw: i64 = conn.query_row(
        "SELECT has_password FROM security WHERE id = 1",
        [],
        |row| row.get(0),
    ).unwrap_or(0);
    Ok(has_pw != 0)
}

// ─── CHAT OPERATIONS ────────────────────────────────────────────────────────

pub fn get_all_chats(db_path: &str) -> Result<Vec<Chat>> {
    let conn = open_conn(db_path)?;
    let mut stmt = conn.prepare("
        SELECT c.id, c.title, c.created_at, c.updated_at,
               COUNT(m.id) as message_count
        FROM chats c
        LEFT JOIN messages m ON m.chat_id = c.id
        GROUP BY c.id
        ORDER BY c.updated_at DESC
    ")?;
    let chats = stmt.query_map([], |row| {
        Ok(Chat {
            id: row.get(0)?,
            title: row.get(1)?,
            created_at: row.get(2)?,
            updated_at: row.get(3)?,
            message_count: row.get(4)?,
        })
    })?
    .filter_map(|r| r.ok())
    .collect();
    Ok(chats)
}

pub fn create_chat(db_path: &str, title: &str) -> Result<Chat> {
    let conn = open_conn(db_path)?;
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO chats (id, title, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
        params![id, title, now, now],
    )?;
    Ok(Chat {
        id,
        title: title.to_string(),
        created_at: now.clone(),
        updated_at: now,
        message_count: 0,
    })
}

pub fn delete_chat(db_path: &str, chat_id: &str) -> Result<()> {
    let conn = open_conn(db_path)?;
    conn.execute("DELETE FROM chats WHERE id = ?1", params![chat_id])?;
    Ok(())
}

pub fn rename_chat(db_path: &str, chat_id: &str, new_title: &str) -> Result<()> {
    let conn = open_conn(db_path)?;
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE chats SET title = ?1, updated_at = ?2 WHERE id = ?3",
        params![new_title, now, chat_id],
    )?;
    Ok(())
}

pub fn search_chats(db_path: &str, query: &str) -> Result<Vec<Chat>> {
    let conn = open_conn(db_path)?;
    let pattern = format!("%{}%", query);
    let mut stmt = conn.prepare("
        SELECT DISTINCT c.id, c.title, c.created_at, c.updated_at,
               COUNT(m.id) as message_count
        FROM chats c
        LEFT JOIN messages m ON m.chat_id = c.id
        WHERE c.title LIKE ?1 OR m.content LIKE ?1
        GROUP BY c.id
        ORDER BY c.updated_at DESC
        LIMIT 50
    ")?;
    let chats = stmt.query_map(params![pattern], |row| {
        Ok(Chat {
            id: row.get(0)?,
            title: row.get(1)?,
            created_at: row.get(2)?,
            updated_at: row.get(3)?,
            message_count: row.get(4)?,
        })
    })?
    .filter_map(|r| r.ok())
    .collect();
    Ok(chats)
}

// ─── MESSAGE OPERATIONS ──────────────────────────────────────────────────────

pub fn get_messages(db_path: &str, chat_id: &str) -> Result<Vec<Message>> {
    let conn = open_conn(db_path)?;
    let mut stmt = conn.prepare("
        SELECT id, chat_id, role, content, created_at, file_name, file_type
        FROM messages
        WHERE chat_id = ?1
        ORDER BY created_at ASC
    ")?;
    let messages = stmt.query_map(params![chat_id], |row| {
        Ok(Message {
            id: row.get(0)?,
            chat_id: row.get(1)?,
            role: row.get(2)?,
            content: row.get(3)?,
            created_at: row.get(4)?,
            file_name: row.get(5)?,
            file_type: row.get(6)?,
        })
    })?
    .filter_map(|r| r.ok())
    .collect();
    Ok(messages)
}

pub fn add_message(
    db_path: &str,
    chat_id: &str,
    role: &str,
    content: &str,
    file_name: Option<&str>,
    file_type: Option<&str>,
) -> Result<Message> {
    let conn = open_conn(db_path)?;
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO messages (id, chat_id, role, content, created_at, file_name, file_type)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![id, chat_id, role, content, now, file_name, file_type],
    )?;

    // Update chat's updated_at
    conn.execute(
        "UPDATE chats SET updated_at = ?1 WHERE id = ?2",
        params![now, chat_id],
    )?;

    // Auto-title the chat from first user message if title is "New Chat"
    if role == "user" {
        let current_title: String = conn.query_row(
            "SELECT title FROM chats WHERE id = ?1",
            params![chat_id],
            |row| row.get(0),
        ).unwrap_or_default();

        if current_title == "New Chat" || current_title.is_empty() {
            let auto_title = if content.len() > 60 {
                format!("{}...", &content[..57])
            } else {
                content.to_string()
            };
            conn.execute(
                "UPDATE chats SET title = ?1 WHERE id = ?2",
                params![auto_title, chat_id],
            )?;
        }
    }

    Ok(Message {
        id,
        chat_id: chat_id.to_string(),
        role: role.to_string(),
        content: content.to_string(),
        created_at: now,
        file_name: file_name.map(String::from),
        file_type: file_type.map(String::from),
    })
}

pub fn update_message_content(db_path: &str, msg_id: &str, content: &str) -> Result<()> {
    let conn = open_conn(db_path)?;
    conn.execute(
        "UPDATE messages SET content = ?1 WHERE id = ?2",
        params![content, msg_id],
    )?;
    Ok(())
}

pub fn get_export_data(db_path: &str, chat_id: &str) -> Result<(Chat, Vec<Message>)> {
    let conn = open_conn(db_path)?;
    let chat: Chat = conn.query_row(
        "SELECT c.id, c.title, c.created_at, c.updated_at,
                COUNT(m.id) as message_count
         FROM chats c
         LEFT JOIN messages m ON m.chat_id = c.id
         WHERE c.id = ?1
         GROUP BY c.id",
        params![chat_id],
        |row| Ok(Chat {
            id: row.get(0)?,
            title: row.get(1)?,
            created_at: row.get(2)?,
            updated_at: row.get(3)?,
            message_count: row.get(4)?,
        }),
    )?;
    let messages = get_messages(db_path, chat_id)?;
    Ok((chat, messages))
}

// ─── SETTINGS OPERATIONS ─────────────────────────────────────────────────────

pub fn get_setting(db_path: &str, key: &str) -> Result<Option<String>> {
    let conn = open_conn(db_path)?;
    let result = conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        params![key],
        |row| row.get::<_, String>(0),
    );
    match result {
        Ok(val) => Ok(Some(val)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

pub fn set_setting(db_path: &str, key: &str, value: &str) -> Result<()> {
    let conn = open_conn(db_path)?;
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
        params![key, value],
    )?;
    Ok(())
}

pub fn get_all_settings(db_path: &str) -> Result<Vec<Setting>> {
    let conn = open_conn(db_path)?;
    let mut stmt = conn.prepare("SELECT key, value FROM settings ORDER BY key")?;
    let settings = stmt.query_map([], |row| {
        Ok(Setting {
            key: row.get(0)?,
            value: row.get(1)?,
        })
    })?
    .filter_map(|r| r.ok())
    .collect();
    Ok(settings)
}

// ─── SECURITY OPERATIONS ─────────────────────────────────────────────────────

pub struct SecurityRecord {
    pub has_password: bool,
    pub password_hash: Option<String>,
    pub salt: Option<String>,
    pub master_key_encrypted: Option<String>,
}

pub fn get_security_record(db_path: &str) -> Result<SecurityRecord> {
    let conn = open_conn(db_path)?;
    let record = conn.query_row(
        "SELECT has_password, password_hash, salt, master_key_encrypted FROM security WHERE id = 1",
        [],
        |row| {
            Ok(SecurityRecord {
                has_password: row.get::<_, i64>(0)? != 0,
                password_hash: row.get(1)?,
                salt: row.get(2)?,
                master_key_encrypted: row.get(3)?,
            })
        },
    )?;
    Ok(record)
}

pub fn set_security_record(
    db_path: &str,
    has_password: bool,
    password_hash: Option<&str>,
    salt: Option<&str>,
    master_key_encrypted: Option<&str>,
) -> Result<()> {
    let conn = open_conn(db_path)?;
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE security SET has_password = ?1, password_hash = ?2, salt = ?3,
         master_key_encrypted = ?4, updated_at = ?5 WHERE id = 1",
        params![
            has_password as i64,
            password_hash,
            salt,
            master_key_encrypted,
            now
        ],
    )?;
    Ok(())
}
