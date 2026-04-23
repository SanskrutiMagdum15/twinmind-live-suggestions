"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useAppStore } from "@/store/useAppStore";

function formatTypeLabel(type?: string) {
  if (!type) return "";
  return type
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function ChatPanel() {
  const transcript = useAppStore((s) => s.transcript);
  const chat = useAppStore((s) => s.chat);
  const groqApiKey = useAppStore((s) => s.groqApiKey);
  const isChatLoading = useAppStore((s) => s.isChatLoading);

  const addChatMessage = useAppStore((s) => s.addChatMessage);
  const setChatLoading = useAppStore((s) => s.setChatLoading);
  const setMediaError = useAppStore((s) => s.setMediaError);

  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat, isChatLoading]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const trimmed = input.trim();
    if (!trimmed) return;

    try {
      setMediaError(null);

      if (!groqApiKey) {
        setMediaError("Please add your Groq API key in Settings first.");
        return;
      }

      const userMessage = {
        id: crypto.randomUUID(),
        role: "user" as const,
        text: trimmed,
        source: "manual" as const,
        timestamp: new Date().toISOString(),
      };

      addChatMessage(userMessage);
      setInput("");
      setChatLoading(true);

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-groq-api-key": groqApiKey,
        },
        body: JSON.stringify({
          prompt: trimmed,
          inputType: "manual",
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
      console.error("Manual chat error:", error);
      setMediaError("Failed to send chat message");
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <section className="flex h-full min-h-[560px] flex-col rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <div className="mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-white/70">
          3. Chat
        </h2>
        <p className="mt-1 text-xs text-white/40">
          Click a suggestion or type a question below.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-3">
        {chat.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-center text-sm text-white/50">
              Click a suggestion or type a question to start the conversation.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {chat.map((message) => {
              const isUser = message.role === "user";

              return (
                <div key={message.id} className="space-y-2">
                  <div
                    className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${
                      isUser ? "text-blue-300/75" : "text-white/45"
                    }`}
                  >
                    {isUser
                      ? message.suggestionType
                        ? `You · ${formatTypeLabel(message.suggestionType)}`
                        : "You"
                      : "Assistant"}
                  </div>

                  <div
                    className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                      isUser
                        ? "ml-auto bg-blue-600 text-white"
                        : "mr-auto border border-white/10 bg-white/[0.06] text-white/90"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{message.text}</p>
                    <p
                      className={`mt-2 text-xs ${
                        isUser ? "text-blue-100/70" : "text-white/35"
                      }`}
                    >
                      {new Date(message.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              );
            })}

            {isChatLoading && (
              <div className="space-y-2">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">
                  Assistant
                </div>
                <div className="mr-auto max-w-[92%] rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white/80">
                  Thinking...
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask anything..."
          disabled={isChatLoading}
          className="flex-1 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35"
        />

        <button
          type="submit"
          disabled={isChatLoading || !input.trim()}
          className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </section>
  );
}