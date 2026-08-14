import React, { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Minus, Maximize2, X, Lock } from 'lucide-react';
import {
  getAppState,
  minimizeWindow,
  maximizeWindow,
  closeWindow,
  unlockApp,
  createChat,
  setSetting,
  getSettings,
  type AppStateDto,
} from './api';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { SettingsPanel } from './components/SettingsPanel';
import { Toast, type ToastMessage } from './components/Toast';
import './index.css';

// ─── THEME CONTEXT ────────────────────────────────────────────────────────────

export type Theme = 'dark' | 'light' | 'deep-dark';

interface ThemeContextType {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

export const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  setTheme: () => {},
});

export const useTheme = () => useContext(ThemeContext);

// ─── LOCK SCREEN ─────────────────────────────────────────────────────────────

function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 300);
  }, []);

  const handleUnlock = async () => {
    if (!password) return;
    setLoading(true);
    setError('');
    try {
      const success = await unlockApp(password);
      if (success) {
        onUnlock();
      } else {
        setError('Incorrect password. Please try again.');
        setPassword('');
        inputRef.current?.focus();
      }
    } catch (e: any) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleUnlock();
  };

  return (
    <motion.div
      className="lock-screen"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="lock-card"
        initial={{ opacity: 0, y: 30, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.1, duration: 0.4, type: 'spring', damping: 20 }}
      >
        <div className="lock-logo">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="10" r="6" stroke="white" strokeWidth="2.5" fill="none"/>
            <path d="M4 28 C4 20 28 20 28 28" stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
          </svg>
        </div>
        <h1 className="lock-title">Nomad AI</h1>
        <p className="lock-subtitle">Enter your password to continue</p>

        <input
          ref={inputRef}
          type="password"
          className="form-input"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          autoComplete="current-password"
        />

        <button
          className="btn btn-primary"
          style={{ width: '100%', justifyContent: 'center' }}
          onClick={handleUnlock}
          disabled={loading || !password}
        >
          {loading ? (
            <><span className="spinner" style={{ width: 16, height: 16 }} /> Unlocking...</>
          ) : (
            <><Lock size={14} /> Unlock</>
          )}
        </button>

        {error && <div className="lock-error">{error}</div>}

        <div style={{ marginTop: 20, fontSize: 11, color: 'var(--text-muted)' }}>
          🔒 Nomad AI — Your AI. Anywhere. Offline. Private.
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── TITLE BAR ────────────────────────────────────────────────────────────────

function TitleBar() {
  return (
    <div className="titlebar">
      <div className="titlebar-brand">
        <svg className="titlebar-logo" viewBox="0 0 20 20" fill="none">
          <defs>
            <linearGradient id="tg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ff3b3b" />
              <stop offset="50%" stopColor="#a855f7" />
              <stop offset="100%" stopColor="#3b82f6" />
            </linearGradient>
          </defs>
          <rect width="20" height="20" rx="5" fill="url(#tg)" />
          <circle cx="10" cy="7" r="3" stroke="white" strokeWidth="1.5" fill="none" />
          <path d="M3 17 C3 12 17 12 17 17" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        </svg>
        <span className="titlebar-name">Nomad AI</span>
        <span className="apex-badge">🔴 Apex</span>
      </div>
      <div className="titlebar-controls">
        <button className="titlebar-btn" onClick={minimizeWindow} title="Minimize">
          <Minus size={12} />
        </button>
        <button className="titlebar-btn" onClick={maximizeWindow} title="Maximize">
          <Maximize2 size={11} />
        </button>
        <button className="titlebar-btn close" onClick={closeWindow} title="Close">
          <X size={12} />
        </button>
      </div>
    </div>
  );
}

// ─── WELCOME SCREEN ───────────────────────────────────────────────────────────

function WelcomeScreen({
  onNewChat,
  currentModel,
}: {
  onNewChat: (chatId: string) => void;
  currentModel: string;
}) {
  const suggestions = [
    { title: '✍️ Write something', body: 'Help me write a professional email to my team...' },
    { title: '📄 Analyze a document', body: 'Attach a file and I\'ll summarize it for you.' },
    { title: '💻 Code assistance', body: 'Explain how to implement a binary search tree...' },
    { title: '💬 Just chat', body: 'Tell me something interesting about the universe...' },
  ];

  const handleSuggestion = async (body: string) => {
    const chat = await createChat('New Chat');
    onNewChat(chat.id, body);
  };

  return (
    <motion.div
      className="welcome-screen"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3 }}
    >
      <div className="welcome-logo">
        <div className="welcome-logo-inner">
          <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
            <circle cx="22" cy="14" r="8" stroke="white" strokeWidth="2.5" fill="none" />
            <path d="M6 40 C6 28 38 28 38 40" stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none" />
          </svg>
        </div>
      </div>

      <h1 className="welcome-title">Nomad AI</h1>
      <p className="welcome-subtitle">Your AI. Anywhere. Offline. Private.</p>
      <p className="welcome-tagline">
        Active model:{' '}
        <span
          style={{
            color: currentModel === 'high-end' ? 'var(--accent-purple)' : 'var(--accent-cyan)',
          }}
        >
          {currentModel === 'high-end' ? '⚡ Nomad Pro' : '🤖 Nomad Compact'}
        </span>
      </p>

      <div className="welcome-suggestions">
        {suggestions.map((s, i) => (
          <motion.button
            key={i}
            className="suggestion-card"
            onClick={() => handleSuggestion(s.body)}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.07 }}
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
          >
            <strong>{s.title}</strong>
            {s.body}
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

export default function App() {
  const [appState, setAppState] = useState<AppStateDto | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [initialMessage, setInitialMessage] = useState<string | undefined>(undefined);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshChats, setRefreshChats] = useState(0);
  const [theme, setThemeState] = useState<Theme>('dark');
  const [currentModel, setCurrentModel] = useState('low-end');

  // Apply theme to document
  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    document.documentElement.setAttribute('data-theme', t);
    setSetting('theme', t).catch(() => {});
  }, []);

  const addToast = useCallback(
    (message: string, type: 'success' | 'error' | 'info' = 'info') => {
      const id = Date.now().toString();
      setToasts(prev => [...prev, { id, message, type }]);
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
    },
    []
  );

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  useEffect(() => {
    getAppState()
      .then(state => {
        setAppState(state);
        setCurrentModel(state.current_model);
        setIsUnlocked(!state.has_password || state.is_unlocked);

        // Load saved theme
        getSettings().then(settings => {
          const saved = settings.find(s => s.key === 'theme');
          if (saved?.value) {
            setThemeState(saved.value as Theme);
            document.documentElement.setAttribute('data-theme', saved.value);
          }
        }).catch(() => {});

        setLoading(false);
      })
      .catch(() => {
        setAppState({
          is_unlocked: true,
          has_password: false,
          current_model: 'low-end',
          install_dir: 'Demo Mode',
          is_activated: false,
        });
        setCurrentModel('low-end');
        setIsUnlocked(true);
        setLoading(false);
      });
  }, []);

  const handleUnlock = useCallback(() => {
    setIsUnlocked(true);
    setAppState(prev => (prev ? { ...prev, is_unlocked: true } : prev));
  }, []);

  const handleNewChat = useCallback((chatId: string, prefill?: string) => {
    setActiveChatId(chatId);
    setInitialMessage(prefill);
    setRefreshChats(v => v + 1);
  }, []);

  const handleSettingsChange = useCallback(() => {
    getAppState()
      .then(state => {
        setAppState(state);
        setCurrentModel(state.current_model);
      })
      .catch(() => {});
    setRefreshChats(v => v + 1);
  }, []);

  const handleModelChange = useCallback((modelId: string) => {
    setCurrentModel(modelId);
    setAppState(prev => prev ? { ...prev, current_model: modelId } : prev);
  }, []);

  if (loading) {
    return (
      <div
        className="app-root"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <div className="spinner" style={{ width: 32, height: 32 }} />
      </div>
    );
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      <div className="app-root" data-theme={theme}>
        <TitleBar />

        <AnimatePresence>
          {!isUnlocked && <LockScreen onUnlock={handleUnlock} />}
        </AnimatePresence>

        <div className="app-content">
          <Sidebar
            activeChatId={activeChatId}
            onSelectChat={(id) => { setActiveChatId(id); setInitialMessage(undefined); }}
            onNewChat={handleNewChat}
            onOpenSettings={() => setShowSettings(true)}
            currentModel={currentModel}
            refreshTrigger={refreshChats}
            addToast={addToast}
          />

          <div className="main-area">
            <AnimatePresence mode="wait">
              {activeChatId ? (
                <ChatArea
                  key={activeChatId}
                  chatId={activeChatId}
                  currentModel={currentModel}
                  installDir={appState?.install_dir || '.'}
                  addToast={addToast}
                  onChatUpdate={() => setRefreshChats(v => v + 1)}
                  initialMessage={initialMessage}
                />
              ) : (
                <WelcomeScreen
                  key="welcome"
                  onNewChat={handleNewChat}
                  currentModel={currentModel}
                />
              )}
            </AnimatePresence>
          </div>
        </div>

        <AnimatePresence>
          {showSettings && (
            <SettingsPanel
              onClose={() => setShowSettings(false)}
              onChange={handleSettingsChange}
              onModelChange={handleModelChange}
              currentModel={currentModel}
              hasPassword={appState?.has_password || false}
              addToast={addToast}
            />
          )}
        </AnimatePresence>

        <Toast toasts={toasts} onRemove={removeToast} />
      </div>
    </ThemeContext.Provider>
  );
}
