import { NextRequest, NextResponse } from "next/server";

type TranscriptChunk = {
  text: string;
  timestamp?: string;
};

type Suggestion = {
  type:
    | "question_to_ask"
    | "talking_point"
    | "clarification"
    | "answer"
    | "fact_check";
  preview: string;
};

const ALLOWED_TYPES = new Set([
  "question_to_ask",
  "talking_point",
  "clarification",
  "answer",
  "fact_check",
]);

function normalize(text: string) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function getRecentTranscriptText(transcript: TranscriptChunk[], maxChunks = 4) {
  return transcript
    .slice(-maxChunks)
    .map((chunk, index) => `[Chunk ${index + 1}] ${chunk.text}`)
    .join("\n\n");
}

function dedupeSuggestions(items: Suggestion[]) {
  const seen = new Set<string>();
  const result: Suggestion[] = [];

  for (const item of items) {
    const key = normalize(item.preview);
    if (!seen.has(key)) {
      seen.add(key);
      result.push({
        type: item.type,
        preview: item.preview.trim(),
      });
    }
  }

  return result;
}

function isValidSuggestion(item: unknown): item is Suggestion {
  if (!item || typeof item !== "object") return false;

  const maybe = item as Suggestion;
  return (
    typeof maybe.type === "string" &&
    ALLOWED_TYPES.has(maybe.type) &&
    typeof maybe.preview === "string" &&
    maybe.preview.trim().length >= 12 &&
    maybe.preview.trim().length <= 260
  );
}

function detectIntent(transcript: TranscriptChunk[]) {
  const joined = transcript
    .map((chunk) => chunk.text.toLowerCase())
    .join(" ");

  const hasQuestionMark = joined.includes("?");

  const directAsk =
    hasQuestionMark ||
    /\b(what is|what are|how do|how can|how should|why is|why are|where can|where should|can you|could you|should we|do we|is it|are there|tell me|give me|explain|help me)\b/.test(
      joined
    );

  const recommendationRequest =
    /\b(best|good|top|recommend|recommendation|suggest|suggestion|options|places|spot|restaurant|bakery|cake|coffee|pizza|dessert|brunch|itinerary|plan|visit|where should|what should)\b/.test(
      joined
    );

  const technicalQuestion =
    /\b(latency|performance|scale|scaling|backend|frontend|api|database|cache|caching|websocket|kafka|nats|queue|server|deployment|architecture|cost|failure mode|reliability|p95|p99)\b/.test(
      joined
    );

  const planningRequest =
    /\b(plan|itinerary|day out|with my family|outing|things to do|visit|schedule)\b/.test(
      joined
    );

  const uncertainClaim =
    /\b(i read|i heard|apparently|is it true|fact check|not sure|concerned|worried|avoid that pattern)\b/.test(
      joined
    );

  const constrained =
    /\b(neighborhood|area|budget|price|cheap|expensive|downtown|capitol hill|slu|vegan|vegetarian|gluten-free|family|kids|volume|users|monthly|cost)\b/.test(
      joined
    );

  return {
    directAsk,
    recommendationRequest,
    technicalQuestion,
    planningRequest,
    uncertainClaim,
    constrained,
    shouldLeadWithAnswer:
      directAsk || recommendationRequest || technicalQuestion || planningRequest,
  };
}

function getFallbackSuggestions(transcript: TranscriptChunk[]): Suggestion[] {
  const intent = detectIntent(transcript);

  if (intent.shouldLeadWithAnswer) {
    return [
      {
        type: "answer",
        preview:
          "Give a direct answer first, then add one practical next step instead of asking only a follow-up question.",
      },
      {
        type: "talking_point",
        preview:
          "Frame the key tradeoff clearly so the conversation can move toward a decision.",
      },
      {
        type: intent.uncertainClaim ? "fact_check" : "question_to_ask",
        preview: intent.uncertainClaim
          ? "Verify the uncertain claim before using it as the basis for a decision."
          : "Ask one targeted follow-up only if it would materially improve the answer.",
      },
    ];
  }

  return [
    {
      type: "question_to_ask",
      preview:
        "Ask one concise follow-up question that would unlock a better recommendation.",
    },
    {
      type: "talking_point",
      preview:
        "Offer one practical point the user could say right away to keep the conversation moving.",
    },
    {
      type: "clarification",
      preview:
        "Clarify the most important missing detail before giving a stronger answer.",
    },
  ];
}

function reorderSuggestions(
  suggestions: Suggestion[],
  transcript: TranscriptChunk[]
): Suggestion[] {
  const intent = detectIntent(transcript);

  const priority = intent.shouldLeadWithAnswer
    ? ["answer", "talking_point", "fact_check", "clarification", "question_to_ask"]
    : ["question_to_ask", "talking_point", "clarification", "answer", "fact_check"];

  return [...suggestions].sort((a, b) => {
    return priority.indexOf(a.type) - priority.indexOf(b.type);
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const transcript = Array.isArray(body?.transcript) ? body.transcript : [];

    const recentSuggestionPreviews = Array.isArray(
      body?.recentSuggestionPreviews
    )
      ? body.recentSuggestionPreviews.filter(
          (x: unknown) => typeof x === "string"
        )
      : [];

    const apiKey = req.headers.get("x-groq-api-key");

    if (!transcript.length) {
      return NextResponse.json(
        { error: "Transcript is required" },
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
    const intent = detectIntent(transcript);

    if (useMock) {
      return NextResponse.json({
        suggestions: intent.shouldLeadWithAnswer
          ? [
              {
                type: "answer",
                preview:
                  "Latency is the delay between request and response; reduce it with caching, fewer round trips, and faster backend responses.",
              },
              {
                type: "talking_point",
                preview:
                  "Start by measuring p95 and p99 latency so the team optimizes the real bottleneck, not just the visible symptom.",
              },
              {
                type: "question_to_ask",
                preview:
                  "Are we seeing latency mostly from frontend loading, network calls, database queries, or backend processing?",
              },
            ]
          : [
              {
                type: "question_to_ask",
                preview:
                  "What decision are we trying to make from this discussion?",
              },
              {
                type: "talking_point",
                preview:
                  "Summarize the current tradeoff so everyone aligns on the next step.",
              },
              {
                type: "clarification",
                preview:
                  "Clarify the most important missing constraint before recommending a direction.",
              },
            ],
      });
    }

    const transcriptText = getRecentTranscriptText(transcript, 4);

    const priorSuggestionsText =
      recentSuggestionPreviews.length > 0
        ? recentSuggestionPreviews
            .map((s: string, i: number) => `${i + 1}. ${s}`)
            .join("\n")
        : "None";

    const systemPrompt = `
You are a real-time AI meeting copilot. Your job is to generate live suggestions while a conversation is happening.

Generate exactly 3 suggestions based on the most recent transcript.

The suggestions must be useful immediately, even before the user clicks them.

Most important behavior:
- Do NOT generate only questions unless the transcript truly needs only follow-up questions.
- If the speaker asks a direct question, include at least one direct ANSWER.
- If the speaker asks for recommendations, options, a plan, or advice, include at least one direct ANSWER or specific recommendation.
- If the speaker mentions uncertainty, risk, cost, correctness, or a claim that may need verification, consider a FACT_CHECK.
- If the discussion is vague or missing a key detail, include one QUESTION_TO_ASK or CLARIFICATION.
- If there is a useful thing the user could say next, include a TALKING_POINT.

Choose the best mix based on context. Do not force the same mix every time.

Suggestion quality rules:
- Each preview must be specific to the transcript.
- Each preview must be one sentence.
- Each preview should be useful on its own.
- Avoid generic advice like "consider the pros and cons."
- Avoid repeating the transcript.
- Avoid repeating prior suggestions.
- Avoid asking obvious questions when a direct answer would be more helpful.
- Make the batch feel like progress from earlier batches.
- Keep previews concise but valuable.

Allowed types:
- "answer"
- "talking_point"
- "question_to_ask"
- "clarification"
- "fact_check"

Return valid JSON only in exactly this format:
{
  "suggestions": [
    { "type": "answer", "preview": "..." },
    { "type": "talking_point", "preview": "..." },
    { "type": "question_to_ask", "preview": "..." }
  ]
}
`.trim();

    const userPrompt = `
Most recent transcript context:
${transcriptText}

Detected context:
- shouldLeadWithAnswer: ${intent.shouldLeadWithAnswer ? "yes" : "no"}
- directAsk: ${intent.directAsk ? "yes" : "no"}
- recommendationRequest: ${intent.recommendationRequest ? "yes" : "no"}
- technicalQuestion: ${intent.technicalQuestion ? "yes" : "no"}
- planningRequest: ${intent.planningRequest ? "yes" : "no"}
- uncertainClaim: ${intent.uncertainClaim ? "yes" : "no"}
- alreadyConstrained: ${intent.constrained ? "yes" : "no"}

Recent prior suggestion previews to avoid repeating:
${priorSuggestionsText}

Generate the best 3 live suggestions for what would help the user right now.
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
          temperature: 0.25,
          response_format: { type: "json_object" },
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
        { error: data?.error?.message || "Suggestion generation failed" },
        { status: response.status }
      );
    }

    const content = data?.choices?.[0]?.message?.content;

    if (!content) {
      return NextResponse.json(
        { suggestions: getFallbackSuggestions(transcript) },
        { status: 200 }
      );
    }

    let parsed: { suggestions?: unknown[] };

    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json(
        { suggestions: getFallbackSuggestions(transcript) },
        { status: 200 }
      );
    }

    const rawSuggestions = Array.isArray(parsed?.suggestions)
      ? parsed.suggestions
      : [];

    const validSuggestions = rawSuggestions.filter(isValidSuggestion);
    const uniqueSuggestions = dedupeSuggestions(validSuggestions).slice(0, 3);

    if (uniqueSuggestions.length !== 3) {
      return NextResponse.json(
        { suggestions: getFallbackSuggestions(transcript) },
        { status: 200 }
      );
    }

    const orderedSuggestions = reorderSuggestions(uniqueSuggestions, transcript);

    return NextResponse.json({ suggestions: orderedSuggestions });
  } catch (error) {
    console.error("Suggestions route error:", error);

    return NextResponse.json(
      { error: "Failed to generate suggestions" },
      { status: 500 }
    );
  }
}