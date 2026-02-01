import { useState, useEffect } from 'react';
import { X, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { settingsApi } from '../../lib/api';
import type { VerifierConfig } from '@vibemanager/shared';

interface VerifierSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

type ConfigState = VerifierConfig & { hasApiKey: boolean };

export default function VerifierSettingsModal({ open, onClose }: VerifierSettingsModalProps) {
  const [config, setConfig] = useState<ConfigState>({
    enabled: false,
    apiUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
    maxTokens: 1024,
    hasApiKey: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      loadConfig();
    }
  }, [open]);

  const loadConfig = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await settingsApi.getVerifier();
      setConfig(data);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setTestResult(null);
    try {
      const data = await settingsApi.updateVerifier({
        enabled: config.enabled,
        apiUrl: config.apiUrl,
        apiKey: config.apiKey,
        model: config.model,
        maxTokens: config.maxTokens,
      });
      setConfig(data);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setError('');
    try {
      const result = await settingsApi.testVerifier();
      setTestResult({ success: true, message: result.message });
    } catch (err) {
      setTestResult({ success: false, message: String(err) });
    } finally {
      setTesting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-[2px] flex items-center justify-center z-[1000] p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-2">
          <h2 className="text-[15px] font-semibold text-text-primary">
            Task Verifier Settings
          </h2>
          <button
            className="text-text-dim hover:text-text-primary transition-colors"
            onClick={onClose}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 flex flex-col gap-4 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-text-dim" />
            </div>
          ) : (
            <>
              {/* Enable toggle */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-5 h-5 rounded"
                  checked={config.enabled}
                  onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                />
                <div>
                  <div className="text-[14px] text-text-primary font-medium">
                    Enable LLM Verification
                  </div>
                  <div className="text-[11px] text-text-dim">
                    Use AI to verify if tasks completed successfully
                  </div>
                </div>
              </label>

              {/* API URL */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] uppercase tracking-wider text-text-dim font-semibold">
                  API URL (OpenAI Compatible)
                </label>
                <input
                  type="text"
                  className="input w-full py-2.5 px-3 bg-surface-2"
                  placeholder="https://api.openai.com/v1"
                  value={config.apiUrl}
                  onChange={(e) => setConfig({ ...config, apiUrl: e.target.value })}
                />
                <span className="text-[10px] text-text-dim">
                  Works with OpenAI, OpenRouter, local LLMs, etc.
                </span>
              </div>

              {/* API Key */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] uppercase tracking-wider text-text-dim font-semibold">
                  API Key
                </label>
                <input
                  type="password"
                  className="input w-full py-2.5 px-3 bg-surface-2 font-mono"
                  placeholder={config.hasApiKey ? '••••••••••••' : 'sk-...'}
                  value={config.apiKey}
                  onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                />
              </div>

              {/* Model */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] uppercase tracking-wider text-text-dim font-semibold">
                  Model
                </label>
                <input
                  type="text"
                  className="input w-full py-2.5 px-3 bg-surface-2"
                  placeholder="gpt-4o-mini"
                  value={config.model}
                  onChange={(e) => setConfig({ ...config, model: e.target.value })}
                />
                <span className="text-[10px] text-text-dim">
                  e.g., gpt-4o-mini, gpt-4o, claude-3-haiku, etc.
                </span>
              </div>

              {/* Max Tokens */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] uppercase tracking-wider text-text-dim font-semibold">
                  Max Tokens
                </label>
                <input
                  type="number"
                  className="input w-full py-2.5 px-3 bg-surface-2"
                  min={100}
                  max={4096}
                  value={config.maxTokens}
                  onChange={(e) => setConfig({ ...config, maxTokens: parseInt(e.target.value) || 1024 })}
                />
              </div>

              {/* Test result */}
              {testResult && (
                <div
                  className={`flex items-start gap-2 p-3 rounded text-[12px] ${
                    testResult.success
                      ? 'bg-accent-green/10 text-accent-green'
                      : 'bg-accent-red/10 text-accent-red'
                  }`}
                >
                  {testResult.success ? (
                    <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  )}
                  <span>{testResult.message}</span>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="text-[12px] text-accent-red bg-accent-red/10 px-3 py-2 rounded">
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-4 border-t border-surface-2">
          <button
            className="btn flex-1"
            onClick={handleTest}
            disabled={testing || !config.enabled || !config.apiKey}
          >
            {testing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Testing...
              </>
            ) : (
              'Test Connection'
            )}
          </button>
          <button
            className="btn btn-primary flex-1"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
