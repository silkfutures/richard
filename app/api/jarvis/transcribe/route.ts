import { gateway, transcribe } from "ai";

export async function POST(request: Request) {
  const aiAvailable = !!(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL === "1");
  if (!aiAvailable) return Response.json({ error: "AI voice is not connected yet." }, { status: 503 });

  const form = await request.formData();
  const audio = form.get("audio");
  if (!(audio instanceof File) || !audio.size) return Response.json({ error: "No recording was received." }, { status: 400 });
  if (audio.size > 8_000_000) return Response.json({ error: "That recording is too long. Keep voice notes under a minute." }, { status: 413 });

  try {
    const result = await transcribe({
      model: gateway.transcription("openai/gpt-4o-mini-transcribe"),
      audio: new Uint8Array(await audio.arrayBuffer()),
      abortSignal: AbortSignal.timeout(35_000),
    });
    const text = result.text.trim();
    if (!text) return Response.json({ error: "I couldn’t hear any words in that recording." }, { status: 422 });
    return Response.json({ text });
  } catch (error) {
    console.error("Jarvis transcription failed", error);
    return Response.json({ error: "I couldn’t turn that recording into text. Please try again." }, { status: 502 });
  }
}
