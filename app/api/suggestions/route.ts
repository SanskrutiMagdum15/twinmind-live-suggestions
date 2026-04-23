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

function getRecentTranscriptText(transcript: TranscriptChunk[], maxChunks = 3) {
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
      result.push(item);
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
    maybe.preview.trim().length <= 220
  );
}

function detectIntent(transcript: TranscriptChunk[]) {
  const joined = transcript
    .map((chunk) => chunk.text.toLowerCase())
    .join(" ");

  const recommendationRequest =
    /\b(best|good|top|recommend|recommendation|suggest|suggestion|options|places|spot|restaurant|bakery|cake|coffee|pizza|dessert|brunch|itinerary|plan|day out|visit|where should|what should)\b/.test(
      joined
    );

  const directAsk =
    /\b(tell me|give me|help me find|can you help|what is the best|what are the best|where can i|where should i)\b/.test(
      joined
    );

  const planningRequest =
    /\b(plan|itinerary|day out|with my family|outing|things to do|visit)\b/.test(
      joined
    );

  const constrained =
    /\b(neighborhood|area|budget|price|cheap|expensive|downtown|capitol hill|slu|vegan|vegetarian|gluten-free|family|kids)\b/.test(
      joined
    );

  return {
    recommendationRequest,
    directAsk,
    planningRequest,
    constrained,
    shouldLeadWithAnswer:
      recommendationRequest || directAsk || planningRequest,
  };
}

function getFallbackSuggestions(transcript: TranscriptChunk[]): Suggestion[] {
  const lastText = transcript.slice(-1)[0]?.text?.trim().toLowerCase() || "";
  const intent = detectIntent(transcript);

  if (!lastText) {
    return [
      {
        type: "answer",
        preview:
          "Offer one concrete recommendation first so the user gets immediate value.",
      },
      {
        type: "question_to_ask",
        preview:
          "Ask one short follow-up about budget, area, or preference only if it helps narrow options.",
      },
      {
        type: "clarification",
        preview:
          "Clarify one missing detail that would most improve the recommendation.",
      },
    ];
  }

  if (intent.shouldLeadWithAnswer) {
    return [
      {
        type: "answer",
        preview:
          "Give one or two concrete recommendations first before asking follow-up questions.",
      },
      {
        type: "talking_point",
        preview:
          "Explain briefly why those options are a strong fit for what the speaker asked.",
      },
      {
        type: intent.constrained ? "clarification" : "question_to_ask",
        preview: intent.constrained
          ? "Clarify one remaining preference only if it would meaningfully improve the recommendation."
          : "Ask one short follow-up question to narrow the options if needed.",
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
        "Offer one practical suggestion the user could say right away.",
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

  if (!intent.shouldLeadWithAnswer) {
    return suggestions;
  }

  const priority = ["answer", "talking_point", "question_to_ask", "clarification", "fact_check"];

  return [...suggestions].sort((a, b) => {
    return priority.indexOf(a.type) - priority.indexOf(b.type);
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const transcript = Array.isArray(body?.transcript) ? body.transcript : [];
    const recentSuggestionPreviews = Array.isArray(body?.recentSuggestionPreviews)
      ? body.recentSuggestionPreviews.filter((x: unknown) => typeof x === "string")
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
      if (intent.shouldLeadWithAnswer) {
        return NextResponse.json({
          suggestions: [
            {
              type: "answer",
              preview:
                "Bakery Nouveau and Deep Sea Sugar are two strong Seattle options if you want excellent chocolate cake.",
            },
            {
              type: "talking_point",
              preview:
                "Mention one or two standout options and why each is worth considering.",
            },
            {
              type: "question_to_ask",
              preview:
                "Ask whether they care more about neighborhood, price, or dine-in experience.",
            },
          ],
        });
      }

      return NextResponse.json({
        suggestions: [
          {
            type: "question_to_ask",
            preview:
              "Ask which city or neighborhood they’ll spend most of their time in.",
          },
          {
            type: "talking_point",
            preview:
              "Mention one strong local recommendation and briefly explain what it is known for.",
          },
          {
            type: "clarification",
            preview:
              "Clarify whether they care more about quality, price, convenience, or atmosphere.",
          },
        ],
      });
    }

    const transcriptText = getRecentTranscriptText(transcript, 3);
    const priorSuggestionsText =
      recentSuggestionPreviews.length > 0
        ? recentSuggestionPreviews
            .map((s: string, i: number) => `${i + 1}. ${s}`)
            .join("\n")
        : "None";

    const systemPrompt = `
You are a real-time meeting copilot generating live suggestions while a conversation is happening.

Your job is to surface the 3 most useful next-step suggestions based on the MOST RECENT transcript context.

Important product principle:
- If the speaker has made a clear direct request for recommendations, options, places, or a plan, do NOT lead only with clarifying questions.
- In those cases, at least one suggestion should provide immediate value through a direct answer or recommendation.
- Follow-up questions should help refine the answer, not block the answer.

Rules:
- Return exactly 3 suggestions.
- Each suggestion should have a different type whenever possible.
- Suggestions must feel timely, specific, and immediately useful.
- The preview must provide value even if the user never clicks it.
- Avoid generic advice, filler, or repeating what was just said.
- Avoid repeating prior suggestions provided below.
- Avoid repetition across batches:
  - Do NOT repeat the same angle from recent suggestions unless it is clearly necessary.
  - If a similar clarification was already suggested recently, choose a different angle.
  - Each new batch should feel like a progression, not a reset.
- Prioritize high-leverage suggestions over low-value or obvious ones.
- Focus on what would help the user most in the next few moments of the conversation.
- If the transcript is ambiguous, prefer one clarification, but do not overuse clarifying questions.
- Keep each preview to 1 sentence.
- Write previews in plain, natural language the user could speak or use right away.
- Return valid JSON only.

Suggestion mix guidance:
- If the transcript contains a direct ask for recommendations, lists, best options, or planning help:
  1. include one answer OR talking_point that directly helps
  2. include one additional supporting suggestion
  3. include at most one clarification or question_to_ask
- If the transcript is exploratory or underspecified:
  1. one question_to_ask
  2. one talking_point OR answer
  3. one clarification OR fact_check

Return JSON in exactly this format:
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

Detected intent:
- shouldLeadWithAnswer: ${intent.shouldLeadWithAnswer ? "yes" : "no"}
- recommendationRequest: ${intent.recommendationRequest ? "yes" : "no"}
- planningRequest: ${intent.planningRequest ? "yes" : "no"}
- alreadyConstrained: ${intent.constrained ? "yes" : "no"}

Recent prior suggestion previews to avoid repeating:
${priorSuggestionsText}

Generate the best 3 live suggestions for what would help right now.
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
