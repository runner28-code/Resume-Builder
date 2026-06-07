"use client";

import { useState } from "react";
import { useResumeStore, type ApiKeys } from "@/store/resume-store";

interface Props {
  onClose: () => void;
}

interface KeyField {
  key: keyof ApiKeys;
  label: string;
  placeholder: string;
  hint: string;
}

const FIELDS: KeyField[] = [
  {
    key: "anthropic",
    label: "Anthropic API Key",
    placeholder: "sk-ant-api03-...",
    hint: "console.anthropic.com → API Keys",
  },
  {
    key: "tavily",
    label: "Tavily API Key",
    placeholder: "tvly-...",
    hint: "app.tavily.com → API",
  },
  {
    key: "voyage",
    label: "Voyage AI API Key",
    placeholder: "pa-...",
    hint: "dash.voyageai.com → API Keys",
  },
];

export function ApiKeysModal({ onClose }: Props) {
  const { apiKeys, setApiKeys } = useResumeStore();
  const [draft, setDraft] = useState<ApiKeys>({ ...apiKeys });
  const [visible, setVisible] = useState<Record<keyof ApiKeys, boolean>>({
    anthropic: false,
    tavily: false,
    voyage: false,
  });

  function toggle(k: keyof ApiKeys) {
    setVisible((v) => ({ ...v, [k]: !v[k] }));
  }

  function handleSave() {
    setApiKeys(draft);
    onClose();
  }

  function handleClear(k: keyof ApiKeys) {
    setDraft((d) => ({ ...d, [k]: "" }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <h2 className="text-lg font-semibold">API Keys</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-white text-xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          <div className="rounded-lg border border-amber-700 bg-amber-950/60 px-3 py-2.5 text-xs text-amber-300 leading-relaxed">
            <span className="font-semibold">⚠ Security notice:</span> Keys are saved in
            plaintext in your browser&apos;s localStorage. Do not use this on a shared
            or public device. Leave a field blank to use the server&apos;s environment
            variable instead.
          </div>

          {FIELDS.map(({ key, label, placeholder, hint }) => (
            <div key={key}>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium text-slate-300">{label}</label>
                <span className="text-xs text-slate-500">{hint}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type={visible[key] ? "text" : "password"}
                    value={draft[key]}
                    onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 pr-10 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => toggle(key)}
                    aria-label={visible[key] ? "Hide key" : "Show key"}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-sm"
                  >
                    {visible[key] ? "🙈" : "👁"}
                  </button>
                </div>
                {draft[key] && (
                  <button
                    type="button"
                    onClick={() => handleClear(key)}
                    aria-label={`Clear ${label}`}
                    className="text-xs text-red-400 hover:text-red-300 shrink-0"
                  >
                    Clear
                  </button>
                )}
              </div>
              {draft[key] && (
                <p className="mt-1 text-xs text-green-500">✓ Key set</p>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors"
          >
            Save Keys
          </button>
        </div>
      </div>
    </div>
  );
}
