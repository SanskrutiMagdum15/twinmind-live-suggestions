"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/store/useAppStore";

export default function SettingsPanel() {
  const groqApiKey = useAppStore((s) => s.groqApiKey);
  const setGroqApiKey = useAppStore((s) => s.setGroqApiKey);

  const [value, setValue] = useState(groqApiKey);

  useEffect(() => {
    const saved = localStorage.getItem("groq_api_key") || "";
    if (saved) {
      setGroqApiKey(saved);
      setValue(saved);
    }
  }, [setGroqApiKey]);

  const handleSave = () => {
    setGroqApiKey(value.trim());
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-white/70">
        Settings
      </h2>

      <label className="mb-2 block text-sm text-white/70">Groq API Key</label>

      <input
        type="password"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Paste your Groq API key"
        className="w-full rounded-xl bg-white/10 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30"
      />

      <button
        onClick={handleSave}
        className="mt-3 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500"
      >
        Save Key
      </button>

      <p className="mt-2 text-xs text-white/50">
        This key is stored locally in your browser.
      </p>
    </section>
  );
}