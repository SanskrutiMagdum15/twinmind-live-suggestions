import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const apiKey = req.headers.get("x-groq-api-key");

    if (!apiKey) {
      return NextResponse.json({ error: "Missing API key" }, { status: 400 });
    }

    if (file.size < 1024) {
      return NextResponse.json(
        { error: "Audio chunk too small to transcribe" },
        { status: 400 }
      );
    }

    console.log("Transcribe request received:", {
      name: file.name,
      type: file.type,
      size: file.size,
    });

    const useMock = process.env.MOCK_TRANSCRIPT === "true";

    if (useMock) {
      console.log("Using mock transcript response");
      return NextResponse.json({
        text: "Best places to eat pizza in Seattle include Delancey, Cornelly, Bar Del Corso, and Serious Pie.",
      });
    }

    const groqFormData = new FormData();
    groqFormData.append("file", file, file.name || "audio.webm");
    groqFormData.append("model", "whisper-large-v3");
    groqFormData.append("language", "en");

    const response = await fetch(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: groqFormData,
      }
    );

    let data: any = null;

    try {
      data = await response.json();
    } catch (parseError) {
      console.error("Failed to parse Groq response as JSON:", parseError);
    }

    if (!response.ok) {
      console.error("Groq transcription failed:", {
        status: response.status,
        statusText: response.statusText,
        data,
      });

      return NextResponse.json(
        { error: data?.error?.message || "Groq transcription failed" },
        { status: response.status }
      );
    }

    return NextResponse.json({ text: data?.text ?? "" });
  } catch (error) {
    console.error("Transcription route error:", error);
    return NextResponse.json(
      { error: "Transcription failed" },
      { status: 500 }
    );
  }
}