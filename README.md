# TwinMind – Live Suggestions Web App  
**By Sanskruti Magdum**

---

## 🚀 Live Demo

https://twinmind-live-suggestions-three.vercel.app

---

## Overview

This project is a real-time AI meeting copilot that listens to live audio, generates transcript chunks and surfaces useful suggestions during an ongoing conversation.

The goal is to **show the right suggestion at the right time**, while a conversation is happening.

---

##  Features

- 🎤 Live microphone recording
- 📝 Real-time transcription (chunked audio)
- 💡 Context-aware live suggestions (auto-refresh)
- 💬 Click-to-expand suggestions into detailed responses
- 🧑‍💻 Manual chat input supported
- 📦 Export full session (transcript + suggestions + chat)

---

##  Architecture

### Frontend
- Next.js (App Router)
- Zustand for global state management
- 3-panel layout:
  - **Transcript (left)**
  - **Suggestions (middle)**
  - **Chat (right)**

### Backend (API Routes)
- `/api/transcribe` → speech-to-text (Groq Whisper)
- `/api/suggestions` → generates live suggestions
- `/api/chat` → generates detailed responses

---

##  Transcription Strategy

Instead of relying on MediaRecorder time-slicing, which can produce invalid or incomplete audio chunks, I implemented:

- Fixed-duration recording (10–30 seconds)
- Stop → create complete audio blob → upload
- Restart recording for next chunk

### Why this approach?
- Ensures valid audio files for transcription
- Prevents "invalid media file" errors
- More reliable for real-time streaming

---

##  Live Suggestions Strategy

Suggestions are generated using:
- Recent transcript chunks (last few segments)
- Previous suggestions (to avoid repetition)

### Types of suggestions:
- Question to ask
- Talking point
- Answer
- Clarification
- Fact-check

### Key design decision

Suggestions are triggered **immediately when a new transcript chunk arrives**, rather than waiting for a fixed interval.

### Why?
- Reduces perceived latency
- Makes the system feel real-time
- Aligns with the assignment goal:  
  *“showing the right thing at the right time”*

---

##  Chat Behavior

### 1. Suggestion Click
- Expands a suggestion into a more useful response
- Avoids repeating the preview text
- Makes it more conversational and actionable

### 2. Manual Input
- Answers user questions directly
- Uses transcript + recent chat context

### Prompt Design Focus:
- Avoid role confusion (assistant vs meeting participant)
- Keep responses concise and usable in real conversations
- Add value beyond suggestion previews
- Maintain context awareness

---

##  Export Feature

Exports full session as JSON including:

- Transcript (with timestamps)
- Suggestion batches (with timestamps)
- Chat history (user + assistant)
- Session metadata (start time, export time)

This ensures complete session traceability.

---

##  Latency & UX Decisions

- Reduced chunk size (10s during testing) for faster feedback
- Immediate suggestion triggering after transcript updates
- Deduplication of similar suggestions
- Non-blocking UI during API calls

---

## API Key Handling

- User provides Groq API key via UI
- Stored locally in browser
- Never hardcoded in the app

---

##  Setup

```bash
npm install
npm run dev