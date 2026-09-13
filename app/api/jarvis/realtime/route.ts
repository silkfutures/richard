const MODEL = "gpt-realtime-2.1";

function openAIKey() {
  return process.env.OPENAI_API_KEY?.trim() || null;
}

export async function GET() {
  return Response.json({ available: !!openAIKey() });
}

export async function POST(request: Request) {
  const key = openAIKey();
  if (!key) {
    return Response.json(
      { error: "Live voice still needs its secure OpenAI connection." },
      { status: 503 },
    );
  }

  const sdp = await request.text();
  if (!sdp || sdp.length > 100_000) {
    return Response.json({ error: "The voice connection request was invalid." }, { status: 400 });
  }

  const session = {
    type: "realtime",
    model: MODEL,
    instructions: `You are Rich, short for Richard, Nathan's calm, perceptive personal chief of staff. Respond naturally to either Rich or Richard. This is a live spoken conversation, so sound natural, warm and concise. Use British English and speak with a subtle, warm Scottish character. Keep the accent understated and authentic rather than theatrical. Never give a generic productivity lecture.

For every completed user turn, call consult_command_centre exactly once with a faithful transcript of what Nathan said. Do not answer from your own knowledge before using the tool. After the tool returns, speak its reply naturally and accurately. Do not invent dashboard facts or claim an action happened unless the tool says it happened. If the tool asks for confirmation, Nathan can simply say yes or no. Nathan may interrupt you; stop and listen when he does.

Do not read punctuation, markdown symbols, numbered formatting or technical labels aloud. Keep normal replies brief unless Nathan asks for depth.`,
    audio: {
      input: {
        transcription: { model: "gpt-4o-mini-transcribe", language: "en" },
        turn_detection: {
          type: "semantic_vad",
          eagerness: "medium",
          create_response: true,
          interrupt_response: true,
        },
      },
      output: { voice: "marin" },
    },
    tools: [
      {
        type: "function",
        name: "consult_command_centre",
        description: "Use Nathan's live projects, tasks, notes, history and confirmation system to answer or carry out his request.",
        parameters: {
          type: "object",
          properties: {
            message: {
              type: "string",
              description: "A faithful transcript of Nathan's complete spoken request.",
            },
          },
          required: ["message"],
          additionalProperties: false,
        },
      },
    ],
    tool_choice: "auto",
  };

  const form = new FormData();
  form.set("sdp", sdp);
  form.set("session", JSON.stringify(session));

  try {
    const response = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "OpenAI-Safety-Identifier": "command-centre-owner",
      },
      body: form,
    });
    const answer = await response.text();
    if (!response.ok) {
      console.error("Realtime session failed", response.status, answer.slice(0, 500));
      return Response.json({ error: "Rich couldn’t start a live voice session." }, { status: 502 });
    }
    return new Response(answer, { headers: { "Content-Type": "application/sdp" } });
  } catch (error) {
    console.error("Realtime connection failed", error);
    return Response.json({ error: "Rich couldn’t reach the live voice service." }, { status: 502 });
  }
}

