// The Keeper's voice: ElevenLabs text-to-speech in a voice designed once for KEPT (scripts/keeper_voice_design.ts).
// Lines are cached on disk by (voice, model, text), so the stock lines cost one call each, ever.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../config.js";

export const MAX_LINE_CHARS = 220;
export const ELEVEN_API = "https://api.elevenlabs.io";

export class VoiceUnavailableError extends Error {}

/** MP3 bytes of the Keeper saying `text`; from the cache when this exact line was said before. */
export async function keeperSpeech(text: string, fetchImpl: typeof fetch = fetch): Promise<{ audio: Buffer; cached: boolean }> {
  if (!config.elevenLabsApiKey || !config.keeperVoiceId) throw new VoiceUnavailableError("The Keeper's voice is not configured (ELEVENLABS_API_KEY, KEEPER_VOICE_ID)");
  const key = createHash("sha256").update(`${config.keeperVoiceId}|${config.elevenTtsModel}|${text}`).digest("hex");
  const dir = join(config.proofStorageDir, "voice");
  const file = join(dir, `${key}.mp3`);
  try { return { audio: await readFile(file), cached: true }; } catch { /* not said before */ }
  const res = await fetchImpl(`${ELEVEN_API}/v1/text-to-speech/${encodeURIComponent(config.keeperVoiceId)}?output_format=mp3_44100_64`, {
    method: "POST",
    headers: { "xi-api-key": config.elevenLabsApiKey, "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: config.elevenTtsModel, voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.35, speed: 0.95 } }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!res?.ok) throw new VoiceUnavailableError(`ElevenLabs text-to-speech failed${res ? ` (HTTP ${res.status})` : ""}`);
  const audio = Buffer.from(await res.arrayBuffer());
  await mkdir(dir, { recursive: true }).then(() => writeFile(file, audio)).catch(() => undefined);
  return { audio, cached: false };
}

const said = new Map<string, { day: string; n: number }>();
/** At most `limit` new (uncached) lines per wallet per UTC day, so a client can't spend the voice credits. */
export function takeVoiceQuota(wallet: string, limit = 60): boolean {
  const day = new Date().toISOString().slice(0, 10);
  const q = said.get(wallet);
  const n = q && q.day === day ? q.n : 0;
  if (n >= limit) return false;
  said.set(wallet, { day, n: n + 1 });
  return true;
}
