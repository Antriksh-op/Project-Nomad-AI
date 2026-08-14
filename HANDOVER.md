# 🐜 Nomad AI — Handover & Architecture Summary

## 1. Project Overview
**Nomad AI** is designed to be the apex-tier commercial product in the AntVerse ecosystem. It is a **portable, offline-first AI platform for Windows**. 

The core product philosophy is that the software is distributed digitally, and the user installs it onto their own USB drive. The USB drive becomes their portable, encrypted AI environment that can be plugged into any Windows machine and run entirely offline with zero telemetry.

### The Tech Stack
- **Frontend:** React (TypeScript) + Vite
- **UI Design:** Custom "Liquid Glass" aesthetics (glassmorphism, vibrant gradients, custom micro-animations). Tailwind is NOT used; everything is built in Vanilla CSS (`src/index.css`).
- **Backend:** Rust + Tauri v2
- **Database:** SQLite (bundled via `rusqlite` in Rust) for chat history and settings.
- **Inference Engine:** `llama.cpp` (to be bundled as a sidecar binary and spawned as a child process by Rust).

---

## 2. Current State of the Codebase (What's Done)

The core architecture and source code for both the frontend and backend have been written:

### 🎨 Frontend (Fully Built & Mockable)
- **Liquid Glass UI:** The entire design system is implemented in `src/index.css`.
- **Components:** The Lock Screen, Welcome Screen, Sidebar, Chat Area, and Settings Panel are fully built (`src/components/`).
- **API Bridge (`src/api.ts`):** This is the interface that calls the Tauri Rust commands. **Crucially**, it has a fallback mechanism: if it detects it's running in a normal browser (not Tauri), it mocks the backend responses so the UI can be developed and tested immediately via `npm run dev`.

### ⚙️ Rust Backend (Code Written, But Blocked by Compiler Environment)
The backend logic is heavily stubbed and written in `src-tauri/src/`:
- **`database.rs`:** SQLite schema initialization and CRUD operations for chats and settings.
- **`security.rs` & `licensing.rs`:** Logic for hardware fingerprinting (Volume serials, Machine GUID), Argon2id password hashing, and Ed25519 token verification to prevent USB cloning.
- **`hardware.rs`:** WMI polling to detect system RAM/VRAM to automatically optimize the AI model.
- **`inference.rs`:** The structure for spawning the `llama.cpp` process and parsing its stdout stream.

---

## 3. The Current Blocker: The Windows SDK

**Why isn't the desktop app compiling yet?**
While writing the Rust backend, we hit a critical environment wall on the original development machine. 
Tauri requires **WebView2** on Windows, which strictly requires the **MSVC (Microsoft Visual C++) toolchain** and the **Windows 11 SDK**.

When trying to compile via `cargo build` or `npm run tauri dev`, it throws the following error:
> `LNK1181: cannot open input file 'kernel32.lib'`

This means the MSVC linker cannot find the core Windows C libraries because the Windows SDK is either missing or heavily corrupted on that virtual environment, and automated attempts to install the Build Tools failed.

---

## 4. What You Need To Do Next

Here is the exact action plan for taking over the project:

### Step 1: Fix the Build Environment (Local Machine)
You need to pull the repo to a Windows machine that has a healthy installation of Visual Studio Build Tools.
1. Install **Visual Studio 2022 Build Tools**.
2. Make sure both **"Desktop development with C++"** and the **"Windows 11 SDK"** (or Windows 10 SDK) are checked and installed.
3. Install the Rust toolchain (`rustup`).

### Step 2: Test the Frontend UI
While waiting for the backend environment to be fixed, you can test the React UI directly in the browser:
1. Run `npm install`
2. Run `npm run dev`
3. Open `http://localhost:1420` in a browser. You can interact with the Liquid Glass UI, test the lock screen, and mock chats.

### Step 3: Compile the Tauri App
Once the Windows SDK is installed on your machine:
1. Run `npm run tauri dev`
2. The Rust compiler will download all crates, link against `kernel32.lib` successfully, and launch the native desktop application.

### Step 4: Finalize the `llama.cpp` Integration
The UI and database are ready, but the actual AI brain needs to be connected:
1. Download a pre-compiled `llama.cpp` binary for Windows.
2. Place it inside the `src-tauri/bin/` folder and configure it as a Tauri sidecar in `tauri.conf.json`.
3. Complete the `spawn_llama_process()` logic inside `src-tauri/src/inference.rs` to pipe the stdout from the sidecar directly into the Tauri event emitter, which the React frontend is already listening for.
