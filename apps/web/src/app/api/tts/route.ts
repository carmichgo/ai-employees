/**
 * POST /api/tts
 *
 * Text-to-speech endpoint. Returns audio/mpeg data.
 *
 * Backends (in priority order):
 *   1. OpenAI TTS  — set OPENAI_API_KEY env var. High quality neural voices.
 *   2. Custom Kokoro/xTTS — set TTS_API_URL env var pointing to a self-hosted
 *      Kokoro or xTTS server (POST with { text, voice } → audio bytes).
 *
 * If no backend is configured, returns 501 so the client falls back to
 * browser SpeechSynthesis with improved voice selection.
 *
 * Body: { text: string, voice?: string }
 */
import { NextRequest, NextResponse } from "next/server";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const TTS_API_URL = process.env.TTS_API_URL; // e.g. "http://your-kokoro-server:8080/tts"

// OpenAI TTS voices
const OPENAI_VOICES = ["alloy", "echo", "fable", "nova", "onyx", "shimmer"] as const;
type OpenAIVoice = (typeof OPENAI_VOICES)[number];

export async function POST(request: NextRequest) {
  let body: { text: string; voice?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { text, voice } = body;
  if (!text || typeof text !== "string" || text.length > 4096) {
    return NextResponse.json(
      { error: "text is required (max 4096 chars)" },
      { status: 400 },
    );
  }

  // Strip markdown for cleaner speech
  const clean = text
    .replace(/```[\s\S]*?```/g, " code block ")
    .replace(/`[^`]+`/g, (m) => m.slice(1, -1))
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " image ")
    .replace(/\[[^\]]*\]\([^)]+\)/g, (m) =>
      m.replace(/\[([^\]]*)\]\([^)]+\)/, "$1"),
    )
    .replace(/[#*_~>]/g, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, " ")
    .trim();

  if (!clean) {
    return NextResponse.json({ error: "Empty text after cleanup" }, { status: 400 });
  }

  // ── Backend 1: Custom TTS server (Kokoro, xTTS, etc.) ──
  if (TTS_API_URL) {
    try {
      const res = await fetch(TTS_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clean, voice: voice || "default" }),
      });

      if (!res.ok) {
        throw new Error(`TTS server returned ${res.status}`);
      }

      const contentType = res.headers.get("content-type") || "audio/wav";
      const audioData = await res.arrayBuffer();

      return new NextResponse(audioData, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=3600",
        },
      });
    } catch (err: any) {
      console.error("Custom TTS failed, trying OpenAI:", err.message);
      // Fall through to OpenAI
    }
  }

  // ── Backend 2: OpenAI TTS ──
  if (OPENAI_API_KEY) {
    const selectedVoice: OpenAIVoice = OPENAI_VOICES.includes(voice as OpenAIVoice)
      ? (voice as OpenAIVoice)
      : "nova";

    try {
      const res = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "tts-1",
          input: clean,
          voice: selectedVoice,
          response_format: "mp3",
        }),
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        throw new Error(`OpenAI TTS ${res.status}: ${errBody}`);
      }

      const audioData = await res.arrayBuffer();

      return new NextResponse(audioData, {
        headers: {
          "Content-Type": "audio/mpeg",
          "Cache-Control": "public, max-age=3600",
        },
      });
    } catch (err: any) {
      console.error("OpenAI TTS failed:", err.message);
      return NextResponse.json(
        { error: "TTS generation failed", fallback: true },
        { status: 502 },
      );
    }
  }

  // ── No backend configured ──
  return NextResponse.json(
    { error: "No TTS backend configured. Set OPENAI_API_KEY or TTS_API_URL.", fallback: true },
    { status: 501 },
  );
}
