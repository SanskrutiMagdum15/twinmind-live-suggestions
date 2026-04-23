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

function postProcessAnswer(answer: string): string {
  return answer
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/^#{1,6}\s?/gm, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
        "Start by identifying whether the slowdown comes from rendering, JavaScript execution, network requests, or backend response time. Once the biggest source is known, optimize that path first instead of applying broad fixes everywhere.";

      if (inputType === "suggestion" && suggestionType === "question_to_ask") {
        mockAnswer =
          "Ask this to narrow the bottleneck: “Which part of the experience feels slow — initial page load, clicking or interacting with the UI, or background data updates?” This helps separate frontend rendering issues from API or infrastructure latency.";
      } else if (
        inputType === "suggestion" &&
        suggestionType === "talking_point"
      ) {
        mockAnswer =
          "A strong way to frame this is to separate real latency from perceived latency. Real latency may require backend or database improvements, while perceived latency can often be improved with loading states, caching, prefetching, or optimistic UI.";
      } else if (inputType === "suggestion" && suggestionType === "answer") {
        mockAnswer =
          "A practical next step is to run a Lighthouse audit and inspect Web Vitals like LCP, INP, and TTFB. Then target the largest bottleneck first, such as reducing JavaScript execution, deferring non-critical scripts, caching static assets, or optimizing slow API calls.";
      } else if (
        inputType === "suggestion" &&
        suggestionType === "clarification"
      ) {
        mockAnswer =
          "The unclear part is what kind of latency the team means. Clarify whether they are talking about slow initial load, delayed user interactions, expensive background sync, or backend response time, because each one needs a different fix.";
      } else if (
        inputType === "suggestion" &&
        suggestionType === "fact_check"
      ) {
        mockAnswer =
          "The transcript supports that latency is a concern, but it does not yet prove the root cause. Before committing to a fix, validate the claim with measurements such as Lighthouse, browser performance traces, API timing logs, and p95 or p99 backend latency.";
      } else if (inputType === "manual") {
        mockAnswer =
          "Latency is the delay between a user action and the visible response. To reduce it, first measure where the delay comes from, then optimize the biggest source: frontend rendering, JavaScript execution, network calls, database queries, or backend processing.";
      }

      return NextResponse.json({ answer: postProcessAnswer(mockAnswer) });
    }

    const transcriptText = getRecentTranscriptText(transcript, 5);
    const recentChat = getRecentChatText(chat, 6);

    const systemPrompt = `
You are a live AI meeting copilot helping a user during an ongoing conversation.

You are NOT a participant in the conversation.
You do NOT speak as the other person.
You do NOT continue the conversation on behalf of someone else.
You help the user understand what was said, decide what to say next, or get a deeper answer after clicking a suggestion.

You will receive:
- inputType: "suggestion" or "manual"
- suggestionType: one of "question_to_ask", "talking_point", "answer", "fact_check", "clarification", or empty
- prompt
- transcript context
- recent chat history

Core rules:
- Use transcript context first.
- Be concise, practical, and useful in a live conversation.
- Avoid generic openings like "Sure", "Certainly", or "Here’s a response".
- Do not restate the full transcript.
- Do not over-explain.
- Do not invent facts that are not supported by the transcript.
- If context is incomplete, say what is known and what still needs clarification.
- The response should be clearly more useful than the clicked preview.

Formatting rules:
- Write in clean plain text only.
- Do NOT use markdown formatting like **bold**, *, #, or markdown headings.
- Do NOT use markdown bullet symbols like "-" or "*".
- Do NOT include section titles wrapped in symbols.
- If structure is helpful, use short paragraphs or numbered steps like 1., 2., 3.
- Keep the response visually clean and product-like.

For manual user messages:
- Answer the user directly.
- Do not default to "You could say" or "You could ask".
- If the manual message asks for phrasing help, then give speakable wording.
- If the manual message asks a factual or technical question, give the answer directly.

For clicked suggestions:
- Do NOT repeat the clicked suggestion verbatim.
- Do NOT merely paraphrase the clicked suggestion.
- Expand it with NEW value.
- Add at least one of the following:
  reasoning, concrete steps, tradeoffs, examples, risks, a short action plan, or what to measure or verify.
- Keep the response to 1-3 short paragraphs or a short numbered list.
- The answer should feel like a useful expanded explanation, not just cleaned-up wording.

Behavior by suggestion type:
- question_to_ask:
  - Explain why the question matters and what information it would unlock.
  - Provide a sharper version of the question only if helpful.
  - Do not only reword the question.

- talking_point:
  - Expand the point with reasoning, context, or a practical next step.
  - Make it useful enough that the user understands why to say it.

- answer:
  - Give a stronger answer than the preview.
  - Add explanation, steps, tradeoffs, or examples.

- clarification:
  - Identify what is unclear.
  - Explain why that detail matters.
  - Suggest the most useful clarification to ask.

- fact_check:
  - Separate what is supported by the transcript from what is uncertain.
  - Suggest how to verify the claim if needed.

Only use "You could ask:" or "You could say:" if the user specifically needs speakable wording.
Otherwise, provide a helpful expanded answer with details.
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

Clicked suggestion or user message:
${prompt}

Generate the most useful expanded response for the user now.
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
          temperature: 0.2,
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

    const answer = postProcessAnswer(rawAnswer);

    return NextResponse.json({ answer });
  } catch (error) {
    console.error("Chat route error:", error);
    return NextResponse.json(
      { error: "Failed to generate chat response" },
      { status: 500 }
    );
  }
}