import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Settings, Cpu, Shield, Key, Info, Zap, Database,
  Check, AlertTriangle, Loader2, Eye, EyeOff, ExternalLink, Sun, Moon, Palette
} from 'lucide-react';
import {
  detectHardware, getAvailableModels, setModel, setPassword,
  changePassword, disablePassword, getLicenseStatus, activateLicense,
  getAppVersion, getSettings, setSetting,
  type HardwareInfo, type ModelInfo, type LicenseStatus,
} from '../api';
import { useTheme, type Theme } from '../App';

interface SettingsPanelProps {
  onClose: () => void;
  onChange: () => void;
  onModelChange: (modelId: string) => void;
  currentModel: string;
  hasPassword: boolean;
  addToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

type Section = 'general' | 'ai' | 'security' | 'license' | 'about';

export function SettingsPanel({
  onClose, onChange, onModelChange, currentModel, hasPassword, addToast
}: SettingsPanelProps) {
  const [activeSection, setActiveSection] = useState<Section>('general');

  const navItems: { id: Section; label: string; icon: React.ReactNode }[] = [
    { id: 'general', label: 'General', icon: <Settings size={14} /> },
    { id: 'ai', label: 'AI Model', icon: <Cpu size={14} /> },
    { id: 'security', label: 'Security', icon: <Shield size={14} /> },
    { id: 'license', label: 'License', icon: <Key size={14} /> },
    { id: 'about', label: 'About', icon: <Info size={14} /> },
  ];

  return (
    <motion.div
      className="settings-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        className="settings-panel"
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      >
        <div className="settings-header">
          <h2 className="settings-title">Settings</h2>
          <button className="settings-close-btn" onClick={onClose}>
            <X size={15} />
          </button>
        </div>

        <div className="settings-body">
          <nav className="settings-nav">
            {navItems.map(item => (
              <button
                key={item.id}
                className={`settings-nav-item ${activeSection === item.id ? 'active' : ''}`}
                onClick={() => setActiveSection(item.id)}
                id={`settings-nav-${item.id}`}
              >
                <span className="icon">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>

          <div className="settings-content">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeSection}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.15 }}
              >
                {activeSection === 'general' && (
                  <GeneralSection addToast={addToast} onChange={onChange} />
                )}
                {activeSection === 'ai' && (
                  <AISection
                    currentModel={currentModel}
                    addToast={addToast}
                    onChange={onChange}
                    onModelChange={onModelChange}
                  />
                )}
                {activeSection === 'security' && (
                  <SecuritySection
                    hasPassword={hasPassword}
                    addToast={addToast}
                    onChange={onChange}
                  />
                )}
                {activeSection === 'license' && (
                  <LicenseSection addToast={addToast} />
                )}
                {activeSection === 'about' && (
                  <AboutSection />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── GENERAL SECTION ─────────────────────────────────────────────────────────

function GeneralSection({ addToast, onChange }: { addToast: any; onChange: any }) {
  const { theme, setTheme } = useTheme();

  const themes: { id: Theme; label: string; icon: React.ReactNode; desc: string }[] = [
    { id: 'dark', label: 'Dark', icon: <Moon size={14} />, desc: 'Deep space dark mode' },
    { id: 'light', label: 'Light', icon: <Sun size={14} />, desc: 'Clean light mode' },
    { id: 'deep-dark', label: 'Deep Dark', icon: <Palette size={14} />, desc: 'Maximum contrast' },
  ];

  return (
    <div>
      <div className="settings-section-title">Appearance</div>
      <div className="settings-group">
        <div style={{ padding: '8px 0 4px' }}>
          <div className="settings-row-label" style={{ marginBottom: 10 }}>Theme</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {themes.map(t => (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                style={{
                  flex: 1,
                  padding: '10px 8px',
                  borderRadius: 'var(--radius-md)',
                  border: theme === t.id ? '2px solid var(--ant-red)' : '1px solid var(--border-soft)',
                  background: theme === t.id ? 'var(--ant-red-ultra)' : 'var(--glass-2)',
                  color: theme === t.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: 11,
                  fontFamily: 'var(--font-sans)',
                  fontWeight: theme === t.id ? 600 : 400,
                  transition: 'all 0.15s ease',
                }}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="settings-section-title" style={{ marginTop: 16 }}>Privacy</div>
      <div className="settings-group">
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Privacy Mode</div>
            <div className="settings-row-desc">Zero telemetry, no cloud sync</div>
          </div>
          <div className="settings-row-right">
            <span style={{ color: 'var(--accent-green)', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
              <Check size={13} /> Always On
            </span>
          </div>
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-row-label">Telemetry</div>
            <div className="settings-row-desc">Usage data collection</div>
          </div>
          <div className="settings-row-right">
            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Disabled</span>
          </div>
        </div>
      </div>

      <div className="settings-section-title" style={{ marginTop: 8 }}>Storage</div>
      <div className="settings-group">
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Data Location</div>
            <div className="settings-row-desc">All data stored on your device</div>
          </div>
          <div className="settings-row-right">
            <span style={{ fontSize: 11, color: 'var(--accent-green)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span className="status-dot active" />
              USB Drive
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── AI SECTION ───────────────────────────────────────────────────────────────

function AISection({ currentModel, addToast, onChange, onModelChange }: {
  currentModel: string; addToast: any; onChange: any; onModelChange: (id: string) => void;
}) {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);
  const [selectedModel, setSelectedModel] = useState(currentModel);
  const [loading, setLoading] = useState(false);
  const [hwLoading, setHwLoading] = useState(false);

  useEffect(() => {
    getAvailableModels().then(setModels).catch(() => {
      // Demo models when backend not available
      setModels([
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
      ]);
    });
  }, []);

  const handleDetectHardware = async () => {
    setHwLoading(true);
    try {
      const hw = await detectHardware();
      setHardware(hw);
    } catch {
      addToast('Hardware detection not available', 'info');
    }
    setHwLoading(false);
  };

  const handleSelectModel = async (modelId: string) => {
    setLoading(true);
    try {
      await setModel(modelId);
      setSelectedModel(modelId);
      onModelChange(modelId);
      onChange();
      addToast(`Switched to ${modelId === 'high-end' ? '⚡ Nomad Pro' : '🤖 Nomad Compact'}`, 'success');
    } catch (e) {
      addToast('Failed to switch model', 'error');
    }
    setLoading(false);
  };

  return (
    <div>
      <div className="settings-section-title">AI Model</div>

      <div className="model-cards">
        {models.map(model => (
          <button
            key={model.id}
            className={`model-card ${selectedModel === model.id ? 'selected' : ''} ${model.id}`}
            onClick={() => handleSelectModel(model.id)}
            disabled={loading}
          >
            <div className="model-card-name">
              <span className={`model-card-badge ${model.id === 'low-end' ? 'compact' : 'pro'}`}>
                {model.id === 'low-end' ? 'COMPACT' : 'PRO'}
              </span>
              {selectedModel === model.id && <Check size={12} style={{ color: 'var(--accent-green)', marginLeft: 'auto' }} />}
            </div>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4, color: 'var(--text-primary)' }}>
              {model.name}
            </div>
            <div className="model-card-desc">{model.description}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, display: 'flex', gap: 10 }}>
              <span>~{model.size_gb}GB</span>
              <span>{model.context_length.toLocaleString()} ctx</span>
              {model.is_available ? (
                <span style={{ color: 'var(--accent-green)' }}>● Installed</span>
              ) : (
                <span style={{ color: 'var(--accent-amber)' }}>○ Not installed</span>
              )}
            </div>
          </button>
        ))}
      </div>

      <div style={{ marginTop: 20 }}>
        <div className="settings-section-title">Hardware Detection</div>
        <button
          className="btn btn-secondary btn-sm"
          onClick={handleDetectHardware}
          disabled={hwLoading}
          style={{ marginBottom: 12 }}
        >
          {hwLoading ? <><Loader2 size={13} style={{ animation: 'spin 0.7s linear infinite' }} /> Detecting...</> : <><Cpu size={13} /> Detect My Hardware</>}
        </button>

        {hardware && (
          <div className="hw-grid">
            <div className="hw-card">
              <div className="hw-card-label">CPU</div>
              <div className="hw-card-value" style={{ fontSize: 11 }}>{hardware.cpu_name}</div>
            </div>
            <div className="hw-card">
              <div className="hw-card-label">RAM</div>
              <div className="hw-card-value">{hardware.ram_gb.toFixed(1)} GB</div>
            </div>
            <div className="hw-card">
              <div className="hw-card-label">GPU</div>
              <div className="hw-card-value" style={{ fontSize: 11 }}>{hardware.gpu_name || 'Not detected'}</div>
            </div>
            <div className="hw-card">
              <div className="hw-card-label">VRAM</div>
              <div className="hw-card-value">
                {hardware.vram_mb > 0 ? `${(hardware.vram_mb / 1024).toFixed(1)} GB` : 'N/A'}
              </div>
            </div>
            <div className="hw-card" style={{ gridColumn: '1 / -1' }}>
              <div className="hw-card-label">Recommended</div>
              <div className="hw-card-value" style={{ color: 'var(--accent-purple)' }}>
                {hardware.recommended_model === 'high-end' ? 'Nomad Pro' : 'Nomad Compact'} via {hardware.recommended_backend.toUpperCase()}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SECURITY SECTION ─────────────────────────────────────────────────────────

function SecuritySection({ hasPassword, addToast, onChange }: {
  hasPassword: boolean; addToast: any; onChange: any;
}) {
  const [mode, setMode] = useState<'view' | 'create' | 'change' | 'disable'>('view');
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [currentPw, setCurrentPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setPw1(''); setPw2(''); setCurrentPw('');
    setMode('view');
  };

  const handleCreate = async () => {
    if (pw1.length < 8) { addToast('Password must be at least 8 characters', 'error'); return; }
    if (pw1 !== pw2) { addToast('Passwords do not match', 'error'); return; }
    setLoading(true);
    try {
      await setPassword(pw1);
      onChange();
      addToast('Password set successfully', 'success');
      reset();
    } catch (e) {
      addToast('Failed to set password: ' + String(e), 'error');
    }
    setLoading(false);
  };

  const handleChange = async () => {
    if (pw1.length < 8) { addToast('New password must be at least 8 characters', 'error'); return; }
    if (pw1 !== pw2) { addToast('Passwords do not match', 'error'); return; }
    setLoading(true);
    try {
      await changePassword(currentPw, pw1);
      addToast('Password changed successfully', 'success');
      reset();
    } catch (e) {
      addToast('Failed to change password: ' + String(e), 'error');
    }
    setLoading(false);
  };

  const handleDisable = async () => {
    setLoading(true);
    try {
      await disablePassword(currentPw);
      onChange();
      addToast('Password protection disabled', 'success');
      reset();
    } catch (e) {
      addToast('Failed to disable password: ' + String(e), 'error');
    }
    setLoading(false);
  };

  const inputStyle = { type: showPw ? 'text' : 'password' };

  return (
    <div>
      <div className="settings-section-title">Password Protection</div>

      <div className="settings-group">
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Status</div>
            <div className="settings-row-desc">Require password on launch</div>
          </div>
          <div className="settings-row-right">
            <span style={{
              fontSize: 12, fontWeight: 600,
              color: hasPassword ? 'var(--accent-green)' : 'var(--text-muted)',
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <span className={`status-dot ${hasPassword ? 'active' : 'inactive'}`} />
              {hasPassword ? 'Enabled' : 'Disabled'}
            </span>
          </div>
        </div>
      </div>

      {mode === 'view' && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {!hasPassword && (
            <button className="btn btn-primary btn-sm" onClick={() => setMode('create')}>
              <Shield size={13} /> Set Password
            </button>
          )}
          {hasPassword && (
            <>
              <button className="btn btn-secondary btn-sm" onClick={() => setMode('change')}>
                Change Password
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => setMode('disable')}>
                Disable Password
              </button>
            </>
          )}
        </div>
      )}

      {mode === 'create' && (
        <div>
          <div style={{ position: 'relative' }}>
            <input
              {...inputStyle}
              className="form-input"
              placeholder="New password (min. 8 characters)"
              value={pw1}
              onChange={e => setPw1(e.target.value)}
            />
            <input
              {...inputStyle}
              className="form-input"
              placeholder="Confirm password"
              value={pw2}
              onChange={e => setPw2(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={handleCreate} disabled={loading}>
              {loading ? 'Setting...' : 'Set Password'}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={reset}>Cancel</button>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
            ⚠️ If you forget your password, your data may be inaccessible. Keep it safe.
          </p>
        </div>
      )}

      {mode === 'change' && (
        <div>
          <input
            {...inputStyle}
            className="form-input"
            placeholder="Current password"
            value={currentPw}
            onChange={e => setCurrentPw(e.target.value)}
          />
          <input
            {...inputStyle}
            className="form-input"
            placeholder="New password"
            value={pw1}
            onChange={e => setPw1(e.target.value)}
          />
          <input
            {...inputStyle}
            className="form-input"
            placeholder="Confirm new password"
            value={pw2}
            onChange={e => setPw2(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={handleChange} disabled={loading}>
              {loading ? 'Changing...' : 'Change Password'}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={reset}>Cancel</button>
          </div>
        </div>
      )}

      {mode === 'disable' && (
        <div>
          <input
            {...inputStyle}
            className="form-input"
            placeholder="Current password to confirm"
            value={currentPw}
            onChange={e => setCurrentPw(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-danger btn-sm" onClick={handleDisable} disabled={loading}>
              {loading ? 'Disabling...' : 'Disable Password'}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={reset}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        <div className="settings-section-title">Privacy</div>
        <div className="settings-group">
          {[
            { label: 'Local Data Only', desc: 'Nothing leaves your device', status: 'active' },
            { label: 'No Telemetry', desc: 'Zero usage data collection', status: 'active' },
            { label: 'Offline AI', desc: 'No cloud inference', status: 'active' },
            { label: 'Encrypted Storage', desc: 'Sensitive data encrypted at rest', status: 'active' },
          ].map(item => (
            <div key={item.label} className="settings-row">
              <div>
                <div className="settings-row-label">{item.label}</div>
                <div className="settings-row-desc">{item.desc}</div>
              </div>
              <div className="settings-row-right">
                <span className={`status-dot ${item.status}`} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── LICENSE SECTION ──────────────────────────────────────────────────────────

function LicenseSection({ addToast }: { addToast: any }) {
  const [license, setLicense] = useState<LicenseStatus | null>(null);
  const [licenseKey, setLicenseKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [activating, setActivating] = useState(false);

  useEffect(() => {
    setLoading(true);
    getLicenseStatus().then(l => {
      setLicense(l);
      setLoading(false);
    }).catch(() => {
      setLicense({ is_activated: false, license_type: 'Nomad AI', fingerprint_match: false, is_valid: false });
      setLoading(false);
    });
  }, []);

  const handleActivate = async () => {
    if (!licenseKey.trim()) { addToast('Please enter a license key', 'error'); return; }
    setActivating(true);
    try {
      const result = await activateLicense(licenseKey);
      setLicense(result);
      addToast('Nomad AI activated successfully!', 'success');
      setLicenseKey('');
    } catch (e) {
      addToast('Activation failed: ' + String(e), 'error');
    }
    setActivating(false);
  };

  if (loading) return <div className="spinner" style={{ margin: '40px auto' }} />;

  return (
    <div>
      <div className="settings-section-title">License Status</div>
      <div className="settings-group">
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Activation</div>
            <div className="settings-row-desc">{license?.license_type || 'Nomad AI'}</div>
          </div>
          <div className="settings-row-right">
            <span style={{
              display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600,
              color: license?.is_valid ? 'var(--accent-green)' : 'var(--accent-amber)',
            }}>
              <span className={`status-dot ${license?.is_valid ? 'active' : 'warning'}`} />
              {license?.is_valid ? 'Active' : 'Not Activated'}
            </span>
          </div>
        </div>

        {license?.license_key && (
          <div className="settings-row">
            <div>
              <div className="settings-row-label">License Key</div>
              <div className="settings-row-desc">Your unique license</div>
            </div>
            <div className="settings-row-right">
              <code style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                {license.license_key}
              </code>
            </div>
          </div>
        )}

        {license?.activation_date && (
          <div className="settings-row">
            <div>
              <div className="settings-row-label">Activated</div>
            </div>
            <div className="settings-row-right">
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {new Date(license.activation_date).toLocaleDateString()}
              </span>
            </div>
          </div>
        )}

        <div className="settings-row">
          <div>
            <div className="settings-row-label">Device Binding</div>
            <div className="settings-row-desc">License bound to this installation</div>
          </div>
          <div className="settings-row-right">
            <span style={{
              fontSize: 12, fontWeight: 600,
              color: license?.fingerprint_match ? 'var(--accent-green)' : 'var(--text-muted)',
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <span className={`status-dot ${license?.fingerprint_match ? 'active' : 'inactive'}`} />
              {license?.fingerprint_match ? 'Verified' : 'N/A'}
            </span>
          </div>
        </div>
      </div>

      {!license?.is_valid && (
        <div>
          <div className="settings-section-title" style={{ marginTop: 20 }}>Activate Nomad AI</div>
          <input
            type="text"
            className="form-input"
            placeholder="Enter your license key (e.g. NOMAD-XXXX-XXXX-XXXX)"
            value={licenseKey}
            onChange={e => setLicenseKey(e.target.value.toUpperCase())}
          />
          <button
            className="btn btn-primary"
            onClick={handleActivate}
            disabled={activating}
            style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}
          >
            {activating ? <><Loader2 size={13} /> Activating...</> : <><Key size={13} /> Activate License</>}
          </button>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10 }}>
            Purchase Nomad AI at antverse.com · Requires internet for one-time activation only
          </p>
        </div>
      )}
    </div>
  );
}

// ─── ABOUT SECTION ────────────────────────────────────────────────────────────

function AboutSection() {
  const [version, setVersion] = useState('0.1.0');

  useEffect(() => {
    getAppVersion().then(setVersion).catch(() => {});
  }, []);

  return (
    <div>
      <div className="about-header">
        <div className="about-logo">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <circle cx="14" cy="9" r="5" stroke="white" strokeWidth="2" fill="none" />
            <path d="M3 25 C3 17 25 17 25 25" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none" />
          </svg>
        </div>
        <div>
          <div className="about-name">Nomad AI</div>
          <div className="about-version">Version {version} · AntVerse Apex Tier</div>
        </div>
      </div>

      <div className="settings-group">
        {[
          { label: 'Product', value: 'Nomad AI' },
          { label: 'Tier', value: '🔴 AntVerse Apex' },
          { label: 'Version', value: version },
          { label: 'Runtime', value: 'llama.cpp (bundled)' },
          { label: 'Platform', value: 'Windows x64' },
          { label: 'Tagline', value: 'Your AI. Anywhere. Offline. Private.' },
        ].map(item => (
          <div key={item.label} className="settings-row">
            <div className="settings-row-label">{item.label}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16 }}>
        <div className="settings-section-title">Open Source Components</div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.8, padding: '8px 0' }}>
          <div>• llama.cpp — MIT License</div>
          <div>• SQLite — Public Domain</div>
          <div>• Tauri — Apache 2.0 / MIT</div>
          <div>• React — MIT License</div>
          <div>• Argon2 — Apache 2.0 / CC0</div>
        </div>
      </div>

      <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--glass-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-dim)' }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
          © 2024 AntVerse. All rights reserved.<br />
          Nomad AI is a product of AntVerse — antverse.com
        </div>
      </div>
    </div>
  );
}
