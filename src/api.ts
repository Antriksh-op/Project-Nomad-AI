// Nomad AI — Tauri API bindings
// All backend calls centralized here

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { open as dialogOpen, save as dialogSave } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { getCurrentWindow } from '@tauri-apps/api/window';

// ─── TYPES ─────────────────────────────────────────────────────────────────

export interface Chat {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface Message {
  id: string;
  chat_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
  file_name?: string;
  file_type?: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  description: string;
  file_path: string;
  size_gb: number;
  context_length: number;
  is_available: boolean;
  requires_vram_mb: number;
  requires_ram_gb: number;
}

export interface HardwareInfo {
  cpu_name: string;
  cpu_cores: number;
  cpu_threads: number;
  cpu_arch: string;
  ram_gb: number;
  gpu_name: string;
  gpu_vendor: string;
  vram_mb: number;
  has_dedicated_gpu: boolean;
  cuda_capable: boolean;
  vulkan_capable: boolean;
  recommended_model: string;
  recommended_backend: string;
  os_version: string;
}

export interface LicenseStatus {
  is_activated: boolean;
  license_key?: string;
  activation_date?: string;
  license_type: string;
  fingerprint_match: boolean;
  is_valid: boolean;
  error_message?: string;
}

export interface AppStateDto {
  is_unlocked: boolean;
  has_password: boolean;
  current_model: string;
  install_dir: string;
  is_activated: boolean;
}

export interface Setting {
  key: string;
  value: string;
}

export interface InferenceChunk {
  token: string;
  done: boolean;
  message_id: string;
}

// ─── APP STATE ──────────────────────────────────────────────────────────────

export async function getAppState(): Promise<AppStateDto> {
  return invoke<AppStateDto>('get_app_state');
}

export async function getAppVersion(): Promise<string> {
  return invoke<string>('get_app_version');
}

export async function safeExit(): Promise<void> {
  return invoke('safe_exit');
}

// ─── WINDOW CONTROLS ────────────────────────────────────────────────────────

export async function minimizeWindow(): Promise<void> {
  const win = getCurrentWindow();
  await win.minimize();
}

export async function maximizeWindow(): Promise<void> {
  const win = getCurrentWindow();
  const isMax = await win.isMaximized();
  if (isMax) {
    await win.unmaximize();
  } else {
    await win.maximize();
  }
}

export async function closeWindow(): Promise<void> {
  await safeExit();
}

// ─── AUTH / SECURITY ─────────────────────────────────────────────────────────

export async function unlockApp(password: string): Promise<boolean> {
  return invoke<boolean>('unlock_app', { password });
}

export async function setPassword(password: string): Promise<void> {
  return invoke('set_password', { password });
}

export async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
  return invoke('change_password', { oldPassword, newPassword });
}

export async function disablePassword(password: string): Promise<void> {
  return invoke('disable_password', { password });
}

// ─── CHATS ──────────────────────────────────────────────────────────────────

export async function getChats(): Promise<Chat[]> {
  return invoke<Chat[]>('get_chats');
}

export async function createChat(title: string = 'New Chat'): Promise<Chat> {
  return invoke<Chat>('create_chat', { title });
}

export async function deleteChat(chatId: string): Promise<void> {
  return invoke('delete_chat', { chatId });
}

export async function renameChat(chatId: string, newTitle: string): Promise<void> {
  return invoke('rename_chat', { chatId, newTitle });
}

export async function searchChats(query: string): Promise<Chat[]> {
  return invoke<Chat[]>('search_chats', { query });
}

export async function exportChat(chatId: string, format: 'txt' | 'md' | 'json'): Promise<string> {
  return invoke<string>('export_chat', { chatId, format });
}

// ─── MESSAGES ────────────────────────────────────────────────────────────────

export async function getMessages(chatId: string): Promise<Message[]> {
  return invoke<Message[]>('get_messages', { chatId });
}

export async function sendMessage(
  chatId: string,
  content: string,
  fileContext?: string
): Promise<Message> {
  return invoke<Message>('send_message_cmd', { chatId, content, fileContext });
}

export async function stopInference(): Promise<void> {
  return invoke('stop_inference');
}

// ─── INFERENCE STREAMING ─────────────────────────────────────────────────────

export function listenInferenceChunks(
  callback: (chunk: InferenceChunk) => void
): Promise<UnlistenFn> {
  return listen<InferenceChunk>('inference_chunk', (event) => {
    callback(event.payload);
  });
}

// ─── MODELS ──────────────────────────────────────────────────────────────────

export async function getAvailableModels(): Promise<ModelInfo[]> {
  return invoke<ModelInfo[]>('get_available_models');
}

export async function setModel(modelId: string): Promise<void> {
  return invoke('set_model', { modelId });
}

export async function getCurrentModel(): Promise<string> {
  return invoke<string>('get_current_model');
}

// ─── HARDWARE ─────────────────────────────────────────────────────────────────

export async function detectHardware(): Promise<HardwareInfo> {
  return invoke<HardwareInfo>('detect_hardware');
}

// ─── SETTINGS ─────────────────────────────────────────────────────────────────

export async function getSettings(): Promise<Setting[]> {
  return invoke<Setting[]>('get_settings');
}

export async function setSetting(key: string, value: string): Promise<void> {
  return invoke('set_setting', { key, value });
}

// ─── FILES ───────────────────────────────────────────────────────────────────

export async function openFileDialog(): Promise<string | null> {
  const result = await dialogOpen({
    multiple: false,
    filters: [
      {
        name: 'Documents',
        extensions: ['txt', 'md', 'markdown', 'pdf', 'docx', 'csv', 'json',
                     'rs', 'py', 'js', 'ts', 'jsx', 'tsx', 'html', 'css',
                     'c', 'cpp', 'h', 'java', 'go', 'rb', 'php', 'yaml', 'yml'],
      },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (typeof result === 'string') return result;
  return null;
}

export async function processFile(filePath: string): Promise<string> {
  const ext = filePath.split('.').pop()?.toLowerCase() || 'txt';
  return invoke<string>('process_file', { filePath, fileType: ext });
}

export async function saveExportedChat(content: string, filename: string): Promise<void> {
  const ext = filename.split('.').pop() || 'txt';
  const savePath = await dialogSave({
    defaultPath: filename,
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
  });
  if (savePath) {
    await writeTextFile(savePath, content);
  }
}

// ─── LICENSE ─────────────────────────────────────────────────────────────────

export async function getLicenseStatus(): Promise<LicenseStatus> {
  return invoke<LicenseStatus>('get_license_status');
}

export async function activateLicense(licenseKey: string): Promise<LicenseStatus> {
  return invoke<LicenseStatus>('activate_license', { licenseKey });
}
