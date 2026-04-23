import MicPanel from "@/components/MicPanel";
import SuggestionsPanel from "@/components/SuggestionsPanel";
import ChatPanel from "@/components/ChatPanel";
import SettingsPanel from "@/components/SettingsPanel";
import ExportButton from "@/components/ExportButton";

export default function Home() {
  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="border-b border-white/10 px-6 py-4">
        <h1 className="text-xl font-semibold">
          TwinMind – Live Suggestions Web App
        </h1>
      </div>

      <div className="px-4 py-4">
        <div className="mb-4 flex items-center justify-end">
          <ExportButton />
        </div>

        <div className="mb-4">
          <SettingsPanel />
        </div>

        <div className="grid min-h-[calc(100vh-180px)] grid-cols-1 gap-4 lg:grid-cols-3">
          <MicPanel />
          <SuggestionsPanel />
          <ChatPanel />
        </div>
      </div>
    </main>
  );
}