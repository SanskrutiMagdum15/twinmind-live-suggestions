import { NextRequest, NextResponse } from "next/server";

type TranscriptChunk = {
  text: string;
  timestamp?: string;
};

type ChatMessage = {
  role: string;
  text: string;
};

type InputType = "suggestion" | "manual";

type SuggestionType =
  | "question_to_ask"
  | "talking_point"
  | "answer"
  | "fact_check"
  | "clarification"
  | "";

function getRecentTranscriptText(
  transcript: TranscriptChunk[],
  maxChunks = 5
): string {
  return transcript
    .slice(-maxChunks)
    .map((chunk, index) => `[Chunk ${index + 1}] ${chunk.text}`)
    .join("\n\n");
}

function getRecentChatText(chat: ChatMessage[], maxMessages = 6): string {
  return chat
    .slice(-maxMessages)
    .map((msg) => `${msg.role}: ${msg.text}`)
    .join("\n");
}

function normalizeInputType(value: unknown): InputType {
  return value === "suggestion" ? "suggestion" : "manual";
}

function normalizeSuggestionType(value: unknown): SuggestionType {
  const validTypes: SuggestionType[] = [
    "question_to_ask",
    "talking_point",
    "answer",
    "fact_check",
    "clarification",
    "",
  ];

  return typeof value === "string" &&
    validTypes.includes(value as SuggestionType)
    ? (value as SuggestionType)
    : "";
}

function cleanQuotedText(text: string): string {
  return text
    .trim()
    .replace(/^["']+/, "")
    .replace(/["']+$/, "")
    .trim();
}

function ensurePrefix(answer: string, prefix: string): string {
  const trimmed = answer.trim();
  if (!trimmed) return trimmed;

  if (trimmed.toLowerCase().startsWith(prefix.toLowerCase())) {
    return trimmed;
  }

  return `${prefix} ${trimmed}`;
}

function postProcessAnswer(
  answer: string,
  inputType: InputType,
  suggestionType: SuggestionType
): string {
  const trimmed = answer.trim();

  if (!trimmed) {
    return trimmed;
  }

  if (inputType !== "suggestion") {
    return trimmed;
  }

  if (suggestionType === "question_to_ask") {
    const lower = trimmed.toLowerCase();
    const hasHelpfulPrefix =
      lower.startsWith("you could ask:") ||
      lower.startsWith("you could ask something like:");

    if (hasHelpfulPrefix) {
      return trimmed;
    }

    const cleaned = cleanQuotedText(trimmed);
    return `You could ask: "${cleaned}"`;
  }

  if (suggestionType === "talking_point") {
    return ensurePrefix(trimmed, "You could say:");
  }

  if (suggestionType === "answer") {
    return ensurePrefix(trimmed, "You could say:");
  }

  if (suggestionType === "clarification") {
    const lower = trimmed.toLowerCase();
    const hasHelpfulPrefix =
      lower.startsWith("you could clarify by asking:") ||
      lower.startsWith("you could ask:");

    if (hasHelpfulPrefix) {
      return trimmed;
    }

    const cleaned = cleanQuotedText(trimmed);
    return `You could clarify by asking: "${cleaned}"`;
  }

  if (suggestionType === "fact_check") {
    return trimmed;
  }

  return trimmed;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const transcript = Array.isArray(body?.transcript) ? body.transcript : [];
    const chat = Array.isArray(body?.chat) ? body.chat : [];
    const prompt = typeof body?.prompt === "string" ? body.prompt : "";
    const inputType = normalizeInputType(body?.inputType);
    const suggestionType = normalizeSuggestionType(body?.suggestionType);
    const apiKey = req.headers.get("x-groq-api-key");

    if (!prompt.trim()) {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 }
      );
    }

    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing API key" },
        { status: 400 }
      );
    }

    const useMock = process.env.MOCK_TRANSCRIPT === "true";

    if (useMock) {
      let mockAnswer =
        "Here are the most useful next steps based on the current discussion.";

      if (inputType === "suggestion" && suggestionType === "question_to_ask") {
        mockAnswer =
          'You could ask: "What is the biggest source of latency right now — rendering, network calls, or expensive JavaScript on the main thread?"';
      } else if (
        inputType === "suggestion" &&
        suggestionType === "talking_point"
      ) {
        mockAnswer =
          'You could say: "We should separate whether this is actual backend latency or perceived UI latency, because the fixes may be very different."';
      } else if (inputType === "suggestion" && suggestionType === "answer") {
        mockAnswer =
          'You could say: "A practical next step is to profile the slow path first, then prioritize the biggest latency contributor instead of optimizing everything at once."';
      } else if (
        inputType === "suggestion" &&
        suggestionType === "clarification"
      ) {
        mockAnswer =
          'You could clarify by asking: "When you say UI latency, are we talking about slow page load, delayed interactions, or visual jank during updates?"';
      } else if (
        inputType === "suggestion" &&
        suggestionType === "fact_check"
      ) {
        mockAnswer =
          "From the transcript alone, the latency concern is clear, but the exact root cause is still uncertain and needs confirmation.";
      } else if (inputType === "manual") {
        mockAnswer =
          "The best next step is to identify whether the slowdown is caused by rendering, JavaScript execution, network requests, or layout shifts, because that determines which optimization will actually help.";
      }

      return NextResponse.json({ answer: mockAnswer });
    }

    const transcriptText = getRecentTranscriptText(transcript, 5);
    const recentChat = getRecentChatText(chat, 6);

    const systemPrompt = `
You are a live AI meeting copilot helping a user during an ongoing conversation.

You are NOT a participant in the conversation.
You do NOT speak as the other person.
You do NOT continue the conversation on behalf of someone else.
You only help the user decide what to say next or understand what was said.

You will receive:
- inputType: "suggestion" or "manual"
- suggestionType: one of "question_to_ask", "talking_point", "answer", "fact_check", "clarification", or empty
- prompt
- transcript context
- recent chat history

Core rules:
- Always respond from the user's perspective.
- Never act as the other speaker.
- Never answer as though you are the other person in the meeting.
- Use transcript context first.
- Keep the answer concise, practical, natural, and useful in a live conversation.
- Avoid generic AI openings like "Sure", "Certainly", or "Here’s a response".
- Prefer direct wording the user can immediately say or use.
- If context is incomplete, say what is known and what still needs clarification.
- Be careful with uncertainty and factual claims.
- Usually keep the response to 1-3 short paragraphs.
- Optimize for live usefulness, not completeness.
- Do not restate the whole transcript.
- Do not over-explain.

Behavior:
- If inputType is "manual":
  - Treat this like a normal user question or request.
  - Answer directly and clearly.
  - DO NOT default to "You could say" or "You could ask".
  - Only use a speakable format if the user explicitly asks for phrasing help.
  - If the input is vague, infer intent from context and provide the most useful direct answer.

- If inputType is "suggestion":
  - Expand the clicked suggestion in the most useful way for the user.
  - Do NOT repeat the clicked suggestion verbatim.
  - Do NOT simply paraphrase it with tiny wording changes.
  - The response must be more useful than the preview.
  - Make it sound natural in a real meeting.
  - Either sharpen it into a better question, make it more speakable, or add one practical layer of detail.
  - Keep it concise.

- If suggestionType is "question_to_ask":
  - Do NOT answer the question.
  - Do NOT roleplay the other person.
  - Generate exactly what the user could ask next.
  - Preserve the core intent of the clicked suggestion.
  - Prefer rewriting or sharpening the same question rather than changing it into a different downstream request.
  - Do NOT jump ahead to a later-stage question unless the original suggestion clearly requires it.
  - Prefer starting with: You could ask:
  - Keep it natural, conversational, and ready to speak.

- If suggestionType is "talking_point":
  - Turn it into a polished point the user could say next.
  - Preserve the original point rather than changing the topic.
  - Prefer starting with: You could say:
  - Add slight practical framing when helpful.

- If suggestionType is "answer":
  - Give a concise answer the user could say.
  - Stay aligned with the exact question or request.
  - Prefer starting with: You could say:
  - Make it more useful than the preview by adding clarity or a practical next step if appropriate.

- If suggestionType is "clarification":
  - Briefly identify what is unclear.
  - Suggest a natural follow-up the user could ask next.
  - Prefer directly usable conversational wording.
  - Prefer starting with: You could clarify by asking:

- If suggestionType is "fact_check":
  - Distinguish between what is supported by the transcript and what is uncertain.
  - Keep it short, grounded, and non-speculative.
`.trim();

    const userPrompt = `
Input type:
${inputType}

Suggestion type:
${suggestionType || "none"}

Most recent transcript context:
${transcriptText || "No transcript provided."}

Recent chat history:
${recentChat || "No previous chat."}

Clicked prompt or user message:
${prompt}

Generate the most useful response for the user now.
`.trim();

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/gpt-oss-120b",
          temperature: 0.15,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data?.error?.message || "Chat generation failed" },
        { status: response.status }
      );
    }

    const rawAnswer = data?.choices?.[0]?.message?.content?.trim();

    if (!rawAnswer) {
      return NextResponse.json(
        { error: "Empty chat response" },
        { status: 500 }
      );
    }

    const answer = postProcessAnswer(rawAnswer, inputType, suggestionType);

    return NextResponse.json({ answer });
  } catch (error) {
    console.error("Chat route error:", error);
    return NextResponse.json(
      { error: "Failed to generate chat response" },
      { status: 500 }
    );
  }
}