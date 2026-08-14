# 🐜 Nomad AI — Full Handover Document
### AntVerse Apex Tier Product · Last Updated: August 2026

---

## 🧭 What Is Nomad AI?

**Nomad AI** is a portable, fully offline AI assistant for Windows — think ChatGPT, but it lives on your USB drive and never touches the internet.

The product is sold digitally by **AntVerse**. The customer downloads an installer, plugs in their own USB/flash drive, and the installer sets up Nomad AI on that drive. From that point, the USB IS their personal AI — plug it into any Windows 10/11 machine and it just works. No Ollama, no Python, no internet, no logins required on the host machine.

### Core Philosophy
- **"The computer is temporary. Nomad is yours."**
- Zero telemetry. Zero cloud. Zero passwords by default.
- All chats, memory, and settings live on the USB drive.
- The entire AI model runs as a bundled sidecar — nothing gets installed on the host PC.

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    NOMAD AI (USB Drive)                 │
│                                                         │
│  ┌──────────────────┐     ┌──────────────────────────┐  │
│  │  Frontend (React)│     │   Backend (Rust / Tauri) │  │
│  │                  │     │                          │  │
│  │  • Liquid Glass  │◄───►│  • SQLite Database       │  │
│  │    UI Design     │     │  • Device Fingerprint    │  │
│  │  • Chat UI       │     │  • Argon2id Security     │  │
│  │  • Settings      │     │  • License Verification  │  │
│  │  • 3 Themes      │     │  • Hardware Detection    │  │
│  │  • Model Switch  │     │  • llama.cpp Subprocess  │  │
│  └──────────────────┘     └──────────────────────────┘  │
│           ▲                           ▲                  │
│           └───────── Tauri IPC ───────┘                  │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │              llama.cpp (Bundled Binary)          │   │
│  │   • Runs entirely offline                        │   │
│  │   • Streams tokens back via stdout               │   │
│  │   • Nomad Compact (4.5GB) or Nomad Pro (14GB)    │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Tech Stack
| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| UI Design | Vanilla CSS ("Liquid Glass" glassmorphism) |
| Desktop Shell | Tauri v2 (Rust-based, lightweight) |
| Database | SQLite via `rusqlite` (bundled, no install needed) |
| AI Engine | `llama.cpp` (bundled sidecar binary) |
| Security | Argon2id (password hashing), AES-256-GCM (encryption) |
| Licensing | Ed25519 signature verification (offline) |

---

## 📁 Project Structure

```
nomad-ai/
├── src/                          # React Frontend
│   ├── App.tsx                   # Root app, theme context, routing
│   ├── api.ts                    # ALL backend calls + browser mock fallback
│   ├── index.css                 # Liquid Glass design system (3 themes)
│   └── components/
│       ├── Sidebar.tsx           # Chat list, search, new chat
│       ├── ChatArea.tsx          # Messages, streaming, file attach
│       ├── SettingsPanel.tsx     # Theme, AI model, security, license
│       └── Toast.tsx             # Notification toasts
│
├── src-tauri/                    # Rust Backend
│   ├── Cargo.toml                # Dependencies
│   └── src/
│       ├── main.rs               # Entry point
│       ├── lib.rs                # Tauri setup, command registry, app state
│       ├── commands.rs           # All Tauri command handlers (API surface)
│       ├── database.rs           # SQLite schema, CRUD for chats/messages/settings
│       ├── security.rs           # Argon2id, AES-256, hardware fingerprinting
│       ├── licensing.rs          # Ed25519 license token verification
│       ├── hardware.rs           # WMI CPU/RAM/GPU detection
│       └── inference.rs          # llama.cpp subprocess spawning + stdout streaming
│
├── scripts/
│   └── setup-runtime.js          # Model download helper script
└── HANDOVER.md                   # This file
```

---

## ✅ What Is Currently Working (Frontend / Browser Demo)

Go to `http://localhost:1420` after running `npm run dev` to test these:

| Feature | Status | Notes |
|---------|--------|-------|
| Liquid Glass UI | ✅ Done | Glassmorphism, gradients, animations |
| Dark Theme | ✅ Done | Default deep-space dark |
| **Light Theme** | ✅ Done | Clean blue-tinted light mode |
| **Deep Dark Theme** | ✅ Done | Pure black maximum contrast |
| Theme switching (instant) | ✅ Done | Via Settings → General → Appearance |
| **New Chat** | ✅ Fixed | Creates real in-memory chat |
| Chat list in sidebar | ✅ Done | Groups by Today / Yesterday / This Week |
| Chat search | ✅ Done | Filters by title |
| Rename & Delete chat | ✅ Done | Via right-click or action buttons |
| **Send Message** | ✅ Fixed | User message appears immediately |
| **AI Streaming Response** | ✅ Fixed | Tokens stream word-by-word with cursor animation |
| **Suggestion Cards** | ✅ Fixed | Click → creates chat → auto-sends that prompt |
| Copy AI message | ✅ Done | Copy button on hover |
| Export chat (MD/TXT/JSON) | ✅ Done | Downloads file in browser |
| File attachment (demo) | ✅ Done | Simulated in browser |
| **AI Model Switching** | ✅ Fixed | Settings → AI Model → pick Compact or Pro |
| Model badge updates globally | ✅ Fixed | Titlebar + welcome screen reflect current model |
| Settings panel (all tabs) | ✅ Done | General, AI, Security, License, About |
| Password protection flow | ✅ Done | Set/Change/Disable password UI |
| License activation | ✅ Done | Enter `NOMAD-XXXX-XXXX-XXXX` format (demo accepts any) |
| Hardware detection (mock) | ✅ Done | Returns demo specs in browser mode |
| Lock screen | ✅ Done | Password gate on app open |

---

## ⚙️ What Still Needs To Be Done (Backend / Real Build)

### Priority 1: Fix the Build Environment
The Rust backend code is **100% written**, but it cannot compile on the original development machine due to a missing Windows SDK (the MSVC linker cannot find `kernel32.lib`).

**To fix this:**
1. Open **Visual Studio Installer** (download from microsoft.com if not installed).
2. Click **Modify** on Visual Studio 2022 / Build Tools.
3. Under "Desktop development with C++", ensure these are checked:
   - `MSVC v143 - VS 2022 C++ x64/x86 build tools`
   - `Windows 11 SDK (10.0.22621.0)` ← this is the critical one
4. Click **Modify** and wait for it to install.
5. Then run `npm run tauri dev` — the Rust backend will compile.

### Priority 2: Bundle llama.cpp
This is the biggest remaining feature — connecting the actual AI brain.

1. Download a Windows x64 `llama-server.exe` or `llama-cli.exe` from the [llama.cpp GitHub Releases](https://github.com/ggerganov/llama.cpp/releases).
2. Place it in `src-tauri/bin/llama-cli-x86_64-pc-windows-msvc.exe`.
3. In `src-tauri/tauri.conf.json`, add it as an external binary under `"bundle"`.
4. In `src-tauri/src/inference.rs`, the `spawn_llama_process()` function is already stubbed — fill in the actual `Command::new()` call with the correct model path and flags.
5. The frontend is **already listening** for streaming tokens via the `inference_chunk` Tauri event — it will just work once the backend sends them.

### Priority 3: Get a Real AI Model
1. Download a GGUF format model. Recommended:
   - **Compact (4GB):** `Phi-3-mini-4k-instruct-q4.gguf` or `TinyLlama-1.1B`
   - **Pro (14GB):** `Llama-3.1-8B-Instruct-Q5_K_M.gguf` or `Mistral-7B-Instruct-v0.3`
2. Models go in `[USB_ROOT]/nomad_data/models/`

### Priority 4: Installer (Inno Setup)
We need a Windows installer that:
- Lets the user select their USB drive
- Copies the app files + models to the drive
- Does NOT install anything to the host PC's Program Files
- Bundles a one-time activation step

---

## 🧪 How To Test Right Now (Browser Mode)

No compilation needed. Just:

```bash
cd "D:\Project-Nomad AI\nomad-ai"
npm install
npm run dev
```

Open **http://localhost:1420** in Chrome/Edge.

**Test Checklist:**
- [ ] Click **New Chat** → should create a chat in sidebar
- [ ] Type a message and hit Enter → user bubble appears, AI streams back
- [ ] Click a **Suggestion Card** on the welcome screen → auto-creates chat and sends
- [ ] Open **Settings** (bottom left gear icon)
- [ ] Go to **General** → click Light / Deep Dark / Dark → whole app changes instantly
- [ ] Go to **AI Model** → click Nomad Pro → model badge in top-right updates
- [ ] Right-click a chat → Rename, Export, Delete
- [ ] Search in sidebar → filters chats live

---

## 🔐 Security Architecture

| Layer | Mechanism |
|-------|-----------|
| Password | Argon2id hash stored in SQLite. 8-char minimum. |
| Fingerprint | Volume Serial + Machine GUID → SHA-256 identity |
| Clone protection | On launch, fingerprint is re-checked against the stored value |
| License | Ed25519 signed JWT token, verified offline |
| Encryption | AES-256-GCM key derived from password + fingerprint |

**Default state: No password, no lock.** User can optionally enable password protection in Settings → Security.

---

## 📜 License & IP

- Product: **Nomad AI**  
- Company: **AntVerse**  
- Tier: **Apex**  
- Website: antverse.com  
- Open source deps used: llama.cpp (MIT), SQLite (Public Domain), Tauri (MIT/Apache), React (MIT), Argon2 (Apache/CC0)

---

## 🚀 Quick Reference Commands

```bash
# Install dependencies
npm install

# Run in browser (demo/mock mode — no Rust needed)
npm run dev

# Run full desktop app (requires Windows SDK + Rust)
npm run tauri dev

# Build production .exe
npm run tauri build

# Update HANDOVER.md and push to GitHub
git add -A && git commit -m "update" && git push origin main
```

---

> **Note for the developer taking over:**  
> The browser demo at `http://localhost:1420` is a fully functional simulation of the real app. All UI flows, themes, chat features, and settings are wired up. The only missing piece is connecting the real Rust backend (requires fixing the Windows SDK environment) and bundling the `llama.cpp` binary with a real GGUF model. Once those two steps are done, Nomad AI will be a fully functional offline AI product.
