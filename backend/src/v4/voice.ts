// The Keeper's voice: ElevenLabs text-to-speech in a voice designed once for KEPT (scripts/keeper_voice_design.ts).
// Lines are cached on disk by (voice, model, text), so the stock lines cost one call each, ever.
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../config.js";

/** The longest line the Keeper says (Ask the Keeper answers are up to this long; the app uses the same limit). */
export const MAX_LINE_CHARS = 320;
export const ELEVEN_API = "https://api.elevenlabs.io";

export class VoiceUnavailableError extends Error {}

const cacheFile = (text: string) => {
  const key = createHash("sha256").update(`${config.keeperVoiceId}|${config.elevenTtsModel}|${text}`).digest("hex");
  return { dir: join(config.proofStorageDir, "voice"), file: join(config.proofStorageDir, "voice", `${key}.mp3`) };
};

/** The cached MP3 for this exact line, if the Keeper said it before (no ElevenLabs call). */
export async function cachedSpeech(text: string): Promise<Buffer | null> {
  if (!config.keeperVoiceId) return null;
  return readFile(cacheFile(text).file).catch(() => null);
}

/** Uncached characters synthesized today, across every wallet: a hard cap that protects the ElevenLabs credits. */
let spent = { day: "", chars: 0 };
export function takeGlobalVoiceBudget(chars: number, cap = Number(process.env.VOICE_DAILY_CHAR_CAP) || 6_000): boolean {
  const day = new Date().toISOString().slice(0, 10);
  if (spent.day !== day) spent = { day, chars: 0 };
  if (spent.chars + chars > cap) return false;
  spent.chars += chars;
  return true;
}

/**
 * Lines the app may ask to have spoken that weren't pre-said by the server: only the explain-before-sign sentence
 * ("{what}. Your wallet: {change} SOL. Sign only if that is what you meant."), with a short, plain "what". Verdicts and
 * Ask the Keeper answers are spoken by the server first (so the app's request is a cache hit).
 */
export const SIGN_LINE = /^[\p{L}\p{N} .,()…'’:+-]{3,110}\. Your wallet: (?:(?:down|up) (?:about \d{1,6}(?:\.\d{1,2})?|less than 0\.01) SOL|unchanged|not known)\. Sign only if that is what you meant\.$/u;

/** MP3 bytes of the Keeper saying `text`; from the cache when this exact line was said before. */
export async function keeperSpeech(text: string, fetchImpl: typeof fetch = fetch): Promise<{ audio: Buffer; cached: boolean }> {
  if (!config.elevenLabsApiKey || !config.keeperVoiceId) throw new VoiceUnavailableError("The Keeper's voice is not configured (ELEVENLABS_API_KEY, KEEPER_VOICE_ID)");
  const { dir, file } = cacheFile(text);
  try { return { audio: await readFile(file), cached: true }; } catch { /* not said before */ }
  const res = await fetchImpl(`${ELEVEN_API}/v1/text-to-speech/${encodeURIComponent(config.keeperVoiceId)}?output_format=mp3_44100_64`, {
    method: "POST",
    headers: { "xi-api-key": config.elevenLabsApiKey, "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: config.elevenTtsModel, voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.35, speed: 0.95 } }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!res?.ok) throw new VoiceUnavailableError(`ElevenLabs text-to-speech failed${res ? ` (HTTP ${res.status})` : ""}`);
  const audio = Buffer.from(await res.arrayBuffer());
  // Atomic: a half-written file is never served from the cache.
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await mkdir(dir, { recursive: true }).then(() => writeFile(tmp, audio)).then(() => rename(tmp, file)).catch(() => undefined);
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
