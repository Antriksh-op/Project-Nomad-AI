// Nomad AI — Tauri API bindings
// All backend calls centralized here with browser-mode mock fallback

// ─── ENVIRONMENT DETECTION ──────────────────────────────────────────────────

const IS_TAURI = typeof (window as any).__TAURI_INTERNALS__ !== 'undefined';

// Lazy import Tauri modules only in Tauri context
let _invoke: any = null;
let _listen: any = null;
let _dialogOpen: any = null;
let _dialogSave: any = null;
let _writeTextFile: any = null;
let _getCurrentWindow: any = null;

async function getInvoke() {
  if (!_invoke) {
    const m = await import('@tauri-apps/api/core');
    _invoke = m.invoke;
  }
  return _invoke;
}
async function getListen() {
  if (!_listen) {
    const m = await import('@tauri-apps/api/event');
    _listen = m.listen;
  }
  return _listen;
}
async function getDialogOpen() {
  if (!_dialogOpen) {
    const m = await import('@tauri-apps/plugin-dialog');
    _dialogOpen = m.open;
  }
  return _dialogOpen;
}
async function getDialogSave() {
  if (!_dialogSave) {
    const m = await import('@tauri-apps/plugin-dialog');
    _dialogSave = m.save;
  }
  return _dialogSave;
}
async function getWriteTextFile() {
  if (!_writeTextFile) {
    const m = await import('@tauri-apps/plugin-fs');
    _writeTextFile = m.writeTextFile;
  }
  return _writeTextFile;
}
async function getWindow() {
  if (!_getCurrentWindow) {
    const m = await import('@tauri-apps/api/window');
    _getCurrentWindow = m.getCurrentWindow;
  }
  return _getCurrentWindow;
}

async function invoke<T>(cmd: string, args?: any): Promise<T> {
  if (!IS_TAURI) {
    return mockInvoke<T>(cmd, args);
  }
  const fn = await getInvoke();
  return fn(cmd, args);
}

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

// ─── MOCK DATA STORE (browser mode) ─────────────────────────────────────────

const mockStore = {
  chats: [] as Chat[],
  messages: {} as Record<string, Message[]>,
  settings: { theme: 'dark', current_model: 'low-end' } as Record<string, string>,
  has_password: false,
  is_activated: false,
  license_key: '',
};

let mockMessageIdCounter = 1000;
let mockChatIdCounter = 1;

const MOCK_AI_RESPONSES = [
  "I'm Nomad AI, your fully offline personal assistant! I'm running entirely on your USB drive with no internet connection needed. How can I help you today?",
  "Great question! Since I'm running completely offline on your device, all our conversations stay completely private. No data ever leaves your USB drive.",
  "I can help with writing, analysis, coding, brainstorming, research synthesis, and much more. What would you like to explore?",
  "As a portable AI, I travel with you everywhere you go. Just plug in your USB drive on any Windows 10/11 machine and I'm ready to assist — no installations required.",
  "That's an interesting topic! Let me think through this with you. The key considerations here would be the trade-offs between performance and privacy, which is exactly why Nomad AI was designed to run locally.",
  "I'm designed to work even on lower-end hardware. The Nomad Compact model can run on machines with as little as 4GB RAM, while Nomad Pro offers higher quality responses on machines with 16GB+ RAM.",
];

let mockResponseIndex = 0;

async function mockInvoke<T>(cmd: string, args?: any): Promise<T> {
  // Simulate slight async delay
  await new Promise(r => setTimeout(r, 60 + Math.random() * 80));

  switch (cmd) {
    case 'get_app_state':
      return {
        is_unlocked: true,
        has_password: mockStore.has_password,
        current_model: mockStore.settings.current_model || 'low-end',
        install_dir: 'USB Drive (Demo Mode)',
        is_activated: mockStore.is_activated,
      } as T;

    case 'get_app_version':
      return '0.1.0' as T;

    case 'safe_exit':
      return undefined as T;

    case 'unlock_app':
      return true as T;

    case 'set_password':
      mockStore.has_password = true;
      return undefined as T;

    case 'change_password':
      return undefined as T;

    case 'disable_password':
      mockStore.has_password = false;
      return undefined as T;

    case 'get_chats':
      return [...mockStore.chats].sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      ) as T;

    case 'create_chat': {
      const id = `chat-${Date.now()}-${mockChatIdCounter++}`;
      const now = new Date().toISOString();
      const chat: Chat = {
        id,
        title: args?.title || 'New Chat',
        created_at: now,
        updated_at: now,
        message_count: 0,
      };
      mockStore.chats.push(chat);
      mockStore.messages[id] = [];
      return chat as T;
    }

    case 'delete_chat': {
      mockStore.chats = mockStore.chats.filter(c => c.id !== args?.chatId);
      delete mockStore.messages[args?.chatId];
      return undefined as T;
    }

    case 'rename_chat': {
      const chat = mockStore.chats.find(c => c.id === args?.chatId);
      if (chat) {
        chat.title = args?.newTitle;
        chat.updated_at = new Date().toISOString();
      }
      return undefined as T;
    }

    case 'search_chats': {
      const q = (args?.query || '').toLowerCase();
      return mockStore.chats.filter(c => c.title.toLowerCase().includes(q)) as T;
    }

    case 'get_messages':
      return (mockStore.messages[args?.chatId] || []) as T;

    case 'send_message_cmd': {
      const chatId = args?.chatId;
      const content = args?.content || '';
      const msgId = `msg-${++mockMessageIdCounter}`;
      const aiMsgId = `msg-${++mockMessageIdCounter}`;
      const now = new Date().toISOString();

      const userMsg: Message = { id: msgId, chat_id: chatId, role: 'user', content, created_at: now };
      if (!mockStore.messages[chatId]) mockStore.messages[chatId] = [];
      mockStore.messages[chatId].push(userMsg);

      const chat = mockStore.chats.find(c => c.id === chatId);
      if (chat) {
        chat.message_count = mockStore.messages[chatId].length;
        chat.title = content.length > 40 ? content.slice(0, 37) + '...' : content;
        chat.updated_at = now;
      }

      // Simulate streaming response
      const aiResponse = MOCK_AI_RESPONSES[mockResponseIndex % MOCK_AI_RESPONSES.length];
      mockResponseIndex++;

      // Simulate token streaming via BroadcastChannel
      setTimeout(async () => {
        const channel = new BroadcastChannel('nomad-inference');
        const tokens = aiResponse.split(/(?<=\s)|(?=\s)/g);
        let accumulated = '';

        for (let i = 0; i < tokens.length; i++) {
          await new Promise(r => setTimeout(r, 30 + Math.random() * 40));
          accumulated += tokens[i];
          channel.postMessage({ type: 'chunk', payload: { token: tokens[i], done: false, message_id: aiMsgId } });
        }

        // Save AI message
        const aiMsg: Message = { id: aiMsgId, chat_id: chatId, role: 'assistant', content: accumulated, created_at: new Date().toISOString() };
        mockStore.messages[chatId].push(aiMsg);
        if (chat) chat.message_count = mockStore.messages[chatId].length;

        await new Promise(r => setTimeout(r, 60));
        channel.postMessage({ type: 'chunk', payload: { token: '', done: true, message_id: aiMsgId } });
        channel.close();
      }, 300);

      return userMsg as T;
    }

    case 'stop_inference':
      return undefined as T;

    case 'get_available_models':
      return [
        {
          id: 'low-end',
          name: 'Nomad Compact',
          description: 'Optimized for lower-end hardware. Works on most computers with 4GB+ RAM.',
          file_path: '',
          size_gb: 4.5,
          context_length: 4096,
          is_available: false,
          requires_vram_mb: 0,
          requires_ram_gb: 6,
        },
        {
          id: 'high-end',
          name: 'Nomad Pro',
          description: 'Full-performance model. Requires 16GB+ RAM or dedicated GPU.',
          file_path: '',
          size_gb: 14,
          context_length: 8192,
          is_available: false,
          requires_vram_mb: 8192,
          requires_ram_gb: 16,
        },
      ] as T;

    case 'set_model':
      mockStore.settings.current_model = args?.modelId;
      return undefined as T;

    case 'get_current_model':
      return mockStore.settings.current_model as T;

    case 'detect_hardware':
      return {
        cpu_name: 'Intel Core i7 (Demo)',
        cpu_cores: 8,
        cpu_threads: 16,
        cpu_arch: 'x86_64',
        ram_gb: 16,
        gpu_name: 'NVIDIA GeForce RTX 3060 (Demo)',
        gpu_vendor: 'NVIDIA',
        vram_mb: 12288,
        has_dedicated_gpu: true,
        cuda_capable: true,
        vulkan_capable: true,
        recommended_model: 'high-end',
        recommended_backend: 'cuda',
        os_version: 'Windows 11 (Demo)',
      } as T;

    case 'get_settings':
      return Object.entries(mockStore.settings).map(([key, value]) => ({ key, value })) as T;

    case 'set_setting':
      mockStore.settings[args?.key] = args?.value;
      return undefined as T;

    case 'process_file':
      return `[File: ${args?.filePath}]\n\nThis is simulated file content in demo mode. In the full desktop app, the actual file contents will be extracted and sent to the AI as context.` as T;

    case 'export_chat': {
      const msgs = mockStore.messages[args?.chatId] || [];
      if (args?.format === 'json') return JSON.stringify(msgs, null, 2) as T;
      return msgs.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n') as T;
    }

    case 'get_license_status':
      return {
        is_activated: mockStore.is_activated,
        license_key: mockStore.license_key || undefined,
        license_type: 'Nomad AI',
        fingerprint_match: mockStore.is_activated,
        is_valid: mockStore.is_activated,
      } as T;

    case 'activate_license': {
      const key = (args?.licenseKey || '').toUpperCase();
      // Accept any key that starts with NOMAD- in demo mode
      const valid = key.startsWith('NOMAD-') && key.length >= 14;
      mockStore.is_activated = valid;
      mockStore.license_key = valid ? key : '';
      return {
        is_activated: valid,
        license_key: valid ? key : undefined,
        activation_date: valid ? new Date().toISOString() : undefined,
        license_type: 'Nomad AI',
        fingerprint_match: valid,
        is_valid: valid,
        error_message: valid ? undefined : 'Invalid license key format. Expected: NOMAD-XXXX-XXXX-XXXX',
      } as T;
    }

    default:
      console.warn('[Mock] Unhandled command:', cmd, args);
      return undefined as T;
  }
}

// ─── INFERENCE STREAMING ─────────────────────────────────────────────────────

export type UnlistenFn = () => void;

export function listenInferenceChunks(callback: (chunk: InferenceChunk) => void): Promise<UnlistenFn> {
  if (!IS_TAURI) {
    // Browser mock: listen to BroadcastChannel
    const channel = new BroadcastChannel('nomad-inference');
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'chunk') {
        callback(event.data.payload);
      }
    };
    channel.addEventListener('message', handler);
    return Promise.resolve(() => {
      channel.removeEventListener('message', handler);
      channel.close();
    });
  }

  return getListen().then((listen: any) =>
    listen<InferenceChunk>('inference_chunk', (event: any) => {
      callback(event.payload);
    })
  );
}

// ─── APP STATE ──────────────────────────────────────────────────────────────

export async function getAppState(): Promise<AppStateDto> {
  return invoke<AppStateDto>('get_app_state');
}

export async function getAppVersion(): Promise<string> {
  return invoke<string>('get_app_version');
}

export async function safeExit(): Promise<void> {
  if (IS_TAURI) return invoke('safe_exit');
}

// ─── WINDOW CONTROLS ────────────────────────────────────────────────────────

export async function minimizeWindow(): Promise<void> {
  if (!IS_TAURI) return;
  const getCW = await getWindow();
  const win = getCW();
  await win.minimize();
}

export async function maximizeWindow(): Promise<void> {
  if (!IS_TAURI) return;
  const getCW = await getWindow();
  const win = getCW();
  const isMax = await win.isMaximized();
  if (isMax) await win.unmaximize();
  else await win.maximize();
}

export async function closeWindow(): Promise<void> {
  if (!IS_TAURI) return;
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

export async function sendMessage(chatId: string, content: string, fileContext?: string): Promise<Message> {
  return invoke<Message>('send_message_cmd', { chatId, content, fileContext });
}

export async function stopInference(): Promise<void> {
  return invoke('stop_inference');
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
  if (!IS_TAURI) {
    // Simulate a file picker in browser mode
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.txt,.md,.pdf,.docx,.csv,.json,.py,.js,.ts';
      input.onchange = () => {
        const file = input.files?.[0];
        resolve(file ? file.name : null);
      };
      input.oncancel = () => resolve(null);
      input.click();
    });
  }
  const open = await getDialogOpen();
  const result = await open({
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
  if (!IS_TAURI) {
    // Browser download fallback
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  const ext = filename.split('.').pop() || 'txt';
  const save = await getDialogSave();
  const savePath = await save({
    defaultPath: filename,
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
  });
  if (savePath) {
    const write = await getWriteTextFile();
    await write(savePath, content);
  }
}

// ─── LICENSE ─────────────────────────────────────────────────────────────────

export async function getLicenseStatus(): Promise<LicenseStatus> {
  return invoke<LicenseStatus>('get_license_status');
}

export async function activateLicense(licenseKey: string): Promise<LicenseStatus> {
  return invoke<LicenseStatus>('activate_license', { licenseKey });
}
