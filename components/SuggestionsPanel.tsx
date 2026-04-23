"use client";

import { useCallback, useEffect, useRef } from "react";
import { useAppStore } from "@/store/useAppStore";

const SUGGESTION_INTERVAL_SECONDS = 10; // keep in sync with mic chunking while testing

function formatTypeLabel(type: string) {
  return type
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalize(text: string) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function areBatchesTooSimilar(
  a: { preview: string }[],
  b: { preview: string }[]
) {
  const aSet = new Set(a.map((item) => normalize(item.preview)));
  const bSet = new Set(b.map((item) => normalize(item.preview)));

  let overlap = 0;
  for (const item of aSet) {
    if (bSet.has(item)) overlap += 1;
  }

  return overlap >= 2;
}

function getTypeStyles(type: string) {
  switch (type) {
    case "answer":
      return "border-green-500/30 bg-green-500/12 text-green-300";
    case "question_to_ask":
      return "border-blue-500/30 bg-blue-500/12 text-blue-300";
    case "talking_point":
      return "border-violet-500/30 bg-violet-500/12 text-violet-300";
    case "clarification":
      return "border-amber-500/30 bg-amber-500/12 text-amber-300";
    case "fact_check":
      return "border-pink-500/30 bg-pink-500/12 text-pink-300";
    default:
      return "border-white/15 bg-white/10 text-white/75";
  }
}

export default function SuggestionsPanel() {
  const isRecording = useAppStore((s) => s.isRecording);
  const transcript = useAppStore((s) => s.transcript);
  const suggestions = useAppStore((s) => s.suggestions);
  const groqApiKey = useAppStore((s) => s.groqApiKey);
  const chat = useAppStore((s) => s.chat);

  const isSuggestionsLoading = useAppStore((s) => s.isSuggestionsLoading);
  const isChatLoading = useAppStore((s) => s.isChatLoading);
  const suggestionsCountdown = useAppStore((s) => s.suggestionsCountdown);

  const setSuggestionsLoading = useAppStore((s) => s.setSuggestionsLoading);
  const setChatLoading = useAppStore((s) => s.setChatLoading);
  const setSuggestionsCountdown = useAppStore((s) => s.setSuggestionsCountdown);

  const addSuggestionBatch = useAppStore((s) => s.addSuggestionBatch);
  const addChatMessage = useAppStore((s) => s.addChatMessage);
  const setMediaError = useAppStore((s) => s.setMediaError);

  const lastTranscriptCountRef = useRef(0);

  const generateSuggestions = useCallback(async () => {
    try {
      setMediaError(null);

      if (!groqApiKey) return;
      if (transcript.length === 0) return;
      if (isSuggestionsLoading) return;

      setSuggestionsLoading(true);

      const recentTranscript = transcript.slice(-3);
      const recentSuggestionPreviews = suggestions
        .slice(0, 2)
        .flatMap((batch) => batch.suggestions.map((item) => item.preview))
        .slice(0, 6);

      const res = await fetch("/api/suggestions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-groq-api-key": groqApiKey,
        },
        body: JSON.stringify({
          transcript: recentTranscript,
          recentSuggestionPreviews,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMediaError(data?.error || "Failed to generate suggestions");
        return;
      }

      const nextBatch = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        suggestions: (data.suggestions || []).map(
          (item: { type: string; preview: string }) => ({
            id: crypto.randomUUID(),
            type: item.type,
            preview: item.preview,
          })
        ),
      };

      const latestBatch = suggestions[0];
      if (
        latestBatch &&
        areBatchesTooSimilar(latestBatch.suggestions, nextBatch.suggestions)
      ) {
        setSuggestionsCountdown(SUGGESTION_INTERVAL_SECONDS);
        return;
      }

      addSuggestionBatch(nextBatch);
      setSuggestionsCountdown(SUGGESTION_INTERVAL_SECONDS);
    } catch (error) {
      console.error("Suggestions fetch error:", error);
      setMediaError("Failed to generate suggestions");
    } finally {
      setSuggestionsLoading(false);
    }
  }, [
    groqApiKey,
    transcript,
    suggestions,
    isSuggestionsLoading,
    setSuggestionsLoading,
    addSuggestionBatch,
    setMediaError,
    setSuggestionsCountdown,
  ]);

  // Start/reset countdown while recording
  useEffect(() => {
    if (!isRecording) {
      setSuggestionsCountdown(SUGGESTION_INTERVAL_SECONDS);
      lastTranscriptCountRef.current = transcript.length;
      return;
    }

    setSuggestionsCountdown(SUGGESTION_INTERVAL_SECONDS);

    const interval = setInterval(() => {
      setSuggestionsCountdown((prev) => {
        if (prev <= 1) {
          return SUGGESTION_INTERVAL_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isRecording, setSuggestionsCountdown, transcript.length]);

  // 🔥 Generate immediately whenever a new transcript chunk arrives
  useEffect(() => {
    if (!isRecording) return;
    if (!groqApiKey) return;
    if (transcript.length === 0) return;

    const previousCount = lastTranscriptCountRef.current;
    const currentCount = transcript.length;

    if (currentCount > previousCount) {
      lastTranscriptCountRef.current = currentCount;
      void generateSuggestions();
      setSuggestionsCountdown(SUGGESTION_INTERVAL_SECONDS);
    }
  }, [
    transcript.length,
    isRecording,
    groqApiKey,
    generateSuggestions,
    setSuggestionsCountdown,
  ]);

  const handleReloadSuggestions = async () => {
    if (!groqApiKey) {
      setMediaError("Please add your Groq API key in Settings first.");
      return;
    }

    if (transcript.length === 0) {
      setMediaError("Transcript is empty. Record something first.");
      return;
    }

    await generateSuggestions();
  };

  const handleSuggestionClick = async (text: string, type: string) => {
    try {
      setMediaError(null);

      if (!groqApiKey) {
        setMediaError("Please add your Groq API key in Settings first.");
        return;
      }

      const userMessage = {
        id: crypto.randomUUID(),
        role: "user" as const,
        text,
        suggestionType: type,
        source: "suggestion" as const,
        timestamp: new Date().toISOString(),
      };

      addChatMessage(userMessage);
      setChatLoading(true);

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-groq-api-key": groqApiKey,
        },
        body: JSON.stringify({
          prompt: text,
          inputType: "suggestion",
          suggestionType: type,
          transcript: transcript.slice(-5),
          chat: [...chat, userMessage].slice(-6),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMediaError(data?.error || "Failed to generate chat response");
        return;
      }

      addChatMessage({
        id: crypto.randomUUID(),
        role: "assistant",
        text: data.answer || "No answer returned.",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Suggestion click chat error:", error);
      setMediaError("Failed to generate detailed answer");
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <section className="flex h-full min-h-[560px] flex-col rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-white/70">
            2. Live Suggestions
          </h2>
          <p className="mt-1 text-xs text-white/40">
            {isRecording
              ? `Auto-refresh in ${suggestionsCountdown}s`
              : "Auto-refresh starts when recording begins"}
          </p>
        </div>

        <button
          onClick={handleReloadSuggestions}
          disabled={isSuggestionsLoading}
          className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-medium text-white transition hover:bg-white/[0.1] disabled:opacity-50"
        >
          {isSuggestionsLoading ? "Loading..." : "Reload suggestions"}
        </button>
      </div>

      {suggestions.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-white/10 bg-black/20 p-6">
          <p className="text-center text-sm text-white/50">
            Suggestions appear here once transcript starts coming in.
          </p>
        </div>
      ) : (
        <div className="flex-1 space-y-4 overflow-y-auto pr-1">
          {suggestions.map((batch, batchIndex) => (
            <div
              key={batch.id}
              className="rounded-xl border border-white/10 bg-black/20 p-3"
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs text-white/40">
                  {new Date(batch.createdAt).toLocaleTimeString()}
                </p>
                {batchIndex === 0 && (
                  <p className="text-[10px] uppercase tracking-[0.18em] text-white/30">
                    Latest batch
                  </p>
                )}
              </div>

              <div className="space-y-3">
                {batch.suggestions.map((suggestion) => (
                  <button
                    key={suggestion.id}
                    type="button"
                    disabled={isChatLoading}
                    onClick={() =>
                      handleSuggestionClick(suggestion.preview, suggestion.type)
                    }
                    className="block w-full rounded-xl border border-white/10 bg-white/[0.04] p-3 text-left transition hover:border-white/20 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <div
                      className={`mb-2 inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${getTypeStyles(
                        suggestion.type
                      )}`}
                    >
                      {formatTypeLabel(suggestion.type)}
                    </div>

                    <p className="text-sm leading-6 text-white/92">
                      {suggestion.preview}
                    </p>

                    <p className="mt-2 text-xs text-white/35">
                      Click to expand
                    </p>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}