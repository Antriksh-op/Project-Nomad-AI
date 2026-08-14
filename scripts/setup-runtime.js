#!/usr/bin/env node
/**
 * Nomad AI — Runtime Setup Script
 * Downloads and sets up llama.cpp prebuilt binaries for Windows
 * Run: node scripts/setup-runtime.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const LLAMA_CPP_RELEASE = 'b5220'; // Pin to a specific stable release
const RUNTIME_DIR = path.join(__dirname, '..', 'src-tauri', 'runtime');
const MODELS_DIR = path.join(__dirname, '..', 'src-tauri', 'models');

// llama.cpp release URLs for Windows
const LLAMA_RELEASES = {
  cpu: `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_CPP_RELEASE}/llama-${LLAMA_CPP_RELEASE}-bin-win-avx2-x64.zip`,
  cuda12: `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_CPP_RELEASE}/llama-${LLAMA_CPP_RELEASE}-bin-win-cuda12-x64.zip`,
  vulkan: `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_CPP_RELEASE}/llama-${LLAMA_CPP_RELEASE}-bin-win-vulkan-x64.zip`,
};

// Model recommendations
const MODEL_RECOMMENDATIONS = {
  'low-end': {
    name: 'Nomad Compact (Llama 3.2 3B Q4_K_M)',
    // Using a small model for low-end hardware
    huggingface: 'bartowski/Llama-3.2-3B-Instruct-GGUF',
    file: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    size_gb: 2.0,
    description: 'Optimized for computers with 4-8GB RAM',
  },
  'high-end': {
    name: 'Nomad Pro (Llama 3.1 8B Q6_K)',
    huggingface: 'bartowski/Meta-Llama-3.1-8B-Instruct-GGUF',
    file: 'Meta-Llama-3.1-8B-Instruct-Q6_K.gguf',
    size_gb: 6.6,
    description: 'Full-quality model for 16GB+ RAM systems',
  },
};

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Created: ${dir}`);
  }
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading: ${url}`);
    console.log(`→ ${dest}`);
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        file.close();
        fs.unlinkSync(dest);
        downloadFile(response.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlinkSync(dest);
      reject(err);
    });
  });
}

async function setupRuntime() {
  console.log('🚀 Nomad AI Runtime Setup');
  console.log('================================\n');

  ensureDir(RUNTIME_DIR);
  ensureDir(path.join(MODELS_DIR, 'low-end'));
  ensureDir(path.join(MODELS_DIR, 'high-end'));

  console.log('📦 Runtime directory:', RUNTIME_DIR);
  console.log('📂 Models directory:', MODELS_DIR);
  console.log('');

  // Check what's already installed
  const cliPath = path.join(RUNTIME_DIR, 'llama-cli.exe');
  if (fs.existsSync(cliPath)) {
    console.log('✅ llama-cli.exe already installed');
  } else {
    console.log('⚠️  llama-cli.exe not found');
    console.log('');
    console.log('To install the runtime:');
    console.log('1. Download from: https://github.com/ggml-org/llama.cpp/releases');
    console.log(`2. Get the Windows release: llama-${LLAMA_CPP_RELEASE}-bin-win-avx2-x64.zip`);
    console.log(`3. Extract llama-cli.exe to: ${RUNTIME_DIR}`);
    console.log('');
    console.log('For NVIDIA GPU support:');
    console.log(`   Get: llama-${LLAMA_CPP_RELEASE}-bin-win-cuda12-x64.zip`);
    console.log('   Also copy required CUDA DLLs');
  }

  // Check models
  console.log('\n📊 Model Status:');
  for (const [modelId, info] of Object.entries(MODEL_RECOMMENDATIONS)) {
    const modelPath = path.join(MODELS_DIR, modelId, 'model.gguf');
    if (fs.existsSync(modelPath)) {
      const stat = fs.statSync(modelPath);
      console.log(`✅ ${info.name} (${(stat.size / 1e9).toFixed(1)} GB)`);
    } else {
      console.log(`⚠️  ${info.name} — NOT INSTALLED`);
      console.log(`   Expected: ${modelPath}`);
      console.log(`   HuggingFace: https://huggingface.co/${info.huggingface}`);
      console.log(`   File: ${info.file}`);
      console.log(`   Size: ~${info.size_gb} GB`);
    }
    console.log('');
  }

  console.log('\n📋 Manual Setup Instructions:');
  console.log('1. Download llama-cli.exe from llama.cpp releases');
  console.log('2. Place it in: src-tauri/runtime/llama-cli.exe');
  console.log('3. Download a GGUF model from HuggingFace');
  console.log('4. Place low-end model at: src-tauri/models/low-end/model.gguf');
  console.log('5. Place high-end model at: src-tauri/models/high-end/model.gguf');
  console.log('');
  console.log('✨ Nomad AI will work in DEMO MODE without models.');
  console.log('   In demo mode, pre-written responses are returned.');
  console.log('   Full AI requires the runtime and at least one model.');
}

setupRuntime().catch(console.error);
