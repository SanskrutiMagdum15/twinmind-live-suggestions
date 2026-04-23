"use client";

import { useAppStore } from "@/store/useAppStore";

export default function ExportButton() {
  const sessionStartedAt = useAppStore((s) => s.sessionStartedAt);
  const transcript = useAppStore((s) => s.transcript);
  const suggestions = useAppStore((s) => s.suggestions);
  const chat = useAppStore((s) => s.chat);

  const handleExport = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      sessionStartedAt,
      transcript,
      suggestionBatches: suggestions,
      chat,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const timestamp = new Date().toISOString().replaceAll(":", "-");

    a.href = url;
    a.download = `twinmind-session-${timestamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      onClick={handleExport}
      className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
    >
      Export Session
    </button>
  );
}