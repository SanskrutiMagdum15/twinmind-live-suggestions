import { create } from "zustand";

type TranscriptChunk = {
  id: string;
  text: string;
  timestamp: string;
};

export type Suggestion = {
  id: string;
  type: string;
  preview: string;
};

export type SuggestionBatch = {
  id: string;
  suggestions: Suggestion[];
  createdAt: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: string;
  suggestionType?: string;
  source?: "manual" | "suggestion";
};

type AppState = {
  sessionStartedAt: string;
  isRecording: boolean;
  transcript: TranscriptChunk[];
  suggestions: SuggestionBatch[];
  chat: ChatMessage[];
  mediaError: string | null;
  groqApiKey: string;
  isSuggestionsLoading: boolean;
  isChatLoading: boolean;
  suggestionsCountdown: number;

  setRecording: (val: boolean) => void;
  setMediaError: (val: string | null) => void;
  setGroqApiKey: (val: string) => void;
  setSuggestionsLoading: (val: boolean) => void;
  setChatLoading: (val: boolean) => void;
  setSuggestionsCountdown: (
    val: number | ((prev: number) => number)
  ) => void;
  addTranscript: (text: string) => void;
  addSuggestionBatch: (batch: SuggestionBatch) => void;
  addChatMessage: (msg: ChatMessage) => void;
  resetSession: () => void;
};

export const useAppStore = create<AppState>((set) => ({
  sessionStartedAt: new Date().toISOString(),
  isRecording: false,
  transcript: [],
  suggestions: [],
  chat: [],
  mediaError: null,
  groqApiKey: "",
  isSuggestionsLoading: false,
  isChatLoading: false,
  suggestionsCountdown: 30,

  setRecording: (val) => set({ isRecording: val }),
  setMediaError: (val) => set({ mediaError: val }),
  setSuggestionsLoading: (val) => set({ isSuggestionsLoading: val }),
  setChatLoading: (val) => set({ isChatLoading: val }),
  setSuggestionsCountdown: (val) =>
    set((state) => ({
      suggestionsCountdown:
        typeof val === "function" ? val(state.suggestionsCountdown) : val,
    })),

  setGroqApiKey: (val) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("groq_api_key", val);
    }
    set({ groqApiKey: val });
  },

  addTranscript: (text) =>
    set((state) => ({
      transcript: [
        ...state.transcript,
        {
          id: crypto.randomUUID(),
          text,
          timestamp: new Date().toISOString(),
        },
      ],
    })),

  addSuggestionBatch: (batch) =>
    set((state) => ({
      suggestions: [batch, ...state.suggestions],
    })),

  addChatMessage: (msg) =>
    set((state) => ({
      chat: [...state.chat, msg],
    })),

  resetSession: () =>
    set({
      sessionStartedAt: new Date().toISOString(),
      isRecording: false,
      transcript: [],
      suggestions: [],
      chat: [],
      mediaError: null,
      isSuggestionsLoading: false,
      isChatLoading: false,
      suggestionsCountdown: 30,
    }),
}));