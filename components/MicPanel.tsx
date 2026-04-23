"use client";

import { useEffect, useRef, useState } from "react";
import { useAppStore } from "@/store/useAppStore";

function getExtensionFromMimeType(mimeType: string) {
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("mpeg")) return "mp3";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("m4a")) return "m4a";
  return "webm";
}

const CHUNK_MS = 10000; // use 10000 for faster local testing

export default function MicPanel() {
  const isRecording = useAppStore((s) => s.isRecording);
  const setRecording = useAppStore((s) => s.setRecording);
  const mediaError = useAppStore((s) => s.mediaError);
  const setMediaError = useAppStore((s) => s.setMediaError);
  const transcript = useAppStore((s) => s.transcript);
  const addTranscript = useAppStore((s) => s.addTranscript);
  const groqApiKey = useAppStore((s) => s.groqApiKey);

  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldContinueRef = useRef(false);
  const isUploadingRef = useRef(false);

  const [isUploading, setIsUploading] = useState(false);

  const stopCurrentRecorder = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  };

  const uploadChunk = async (blob: Blob, mimeType: string) => {
    if (blob.size < 1024) {
      console.log("Skipping tiny audio chunk:", blob.size);
      return;
    }

    if (isUploadingRef.current) {
      console.log("Skipping chunk because upload already in progress");
      return;
    }

    try {
      isUploadingRef.current = true;
      setIsUploading(true);

      console.log("Uploading complete chunk:", {
        size: blob.size,
        type: mimeType,
      });

      const extension = getExtensionFromMimeType(mimeType);
      const formData = new FormData();
      formData.append("file", blob, `audio.${extension}`);

      const res = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
        headers: {
          "x-groq-api-key": groqApiKey,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        console.error("Transcription API error:", data);
        setMediaError(data?.error || "Transcription failed");
        return;
      }

      if (data.text?.trim()) {
        addTranscript(data.text.trim());
      }
    } catch (err) {
      console.error("Chunk transcription error:", err);
      setMediaError("Transcription failed: network or server error");
    } finally {
      isUploadingRef.current = false;
      setIsUploading(false);
    }
  };

  const startChunkRecorder = () => {
    const stream = streamRef.current;
    if (!stream || !shouldContinueRef.current) return;

    let recorder: MediaRecorder;

    if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
      recorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });
    } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
      recorder = new MediaRecorder(stream, {
        mimeType: "audio/mp4",
      });
    } else {
      recorder = new MediaRecorder(stream);
    }

    mediaRecorderRef.current = recorder;

    const chunks: BlobPart[] = [];

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    recorder.onerror = (event) => {
      console.error("MediaRecorder error:", event);
      setMediaError("Recording error occurred");
    };

    recorder.onstop = async () => {
      const blob = new Blob(chunks, {
        type: recorder.mimeType || "audio/webm",
      });

      await uploadChunk(blob, recorder.mimeType || "audio/webm");

      mediaRecorderRef.current = null;

      if (shouldContinueRef.current) {
        startChunkRecorder();
      }
    };

    recorder.start();

    timeoutRef.current = setTimeout(() => {
      if (recorder.state !== "inactive") {
        recorder.stop();
      }
    }, CHUNK_MS);
  };

  const handleToggleMic = async () => {
    if (isRecording) {
      shouldContinueRef.current = false;
      stopCurrentRecorder();

      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;

      setRecording(false);
      return;
    }

    try {
      setMediaError(null);

      if (!groqApiKey) {
        setMediaError("Please add your Groq API key in Settings first.");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      shouldContinueRef.current = true;

      setRecording(true);
      startChunkRecorder();
    } catch (err) {
      console.error("Mic start error:", err);
      setMediaError("Microphone access was denied or unavailable.");
      setRecording(false);
    }
  };

  useEffect(() => {
    return () => {
      shouldContinueRef.current = false;
      stopCurrentRecorder();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/70">
          1. Mic & Transcript
        </h2>

        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            isRecording
              ? "bg-green-500/20 text-green-300"
              : "bg-white/10 text-white/60"
          }`}
        >
          {isRecording ? "Recording" : "Idle"}
        </span>
      </div>

      <button
        onClick={handleToggleMic}
        className={`mb-4 rounded-xl px-4 py-2 text-sm font-medium text-white ${
          isRecording
            ? "bg-red-600 hover:bg-red-500"
            : "bg-blue-600 hover:bg-blue-500"
        }`}
      >
        {isRecording ? "Stop Mic" : "Start Mic"}
      </button>

      {isUploading && (
        <p className="mb-3 text-xs text-blue-400">Transcribing...</p>
      )}

      {mediaError && (
        <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {mediaError}
        </p>
      )}

      <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white/60">
        {transcript.length === 0 ? (
          <p>No transcript yet, start the mic.</p>
        ) : (
          <div className="space-y-3">
            {transcript.map((chunk) => (
              <div key={chunk.id}>
                <p className="text-xs text-white/40">
                  {new Date(chunk.timestamp).toLocaleTimeString()}
                </p>
                <p>{chunk.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}