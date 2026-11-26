// Pre-generates the Keeper's hype lines for live rep sets (ElevenLabs text-to-speech, the custom KEPT Keeper voice) into
// the app's assets, same model, output format and voice settings as keeper_count_voice.ts, so they sit at the same
// loudness as the counting. The lines (texts and ids) live in the app: frontend/src/features/keeper/hypeLines.ts.
// Idempotent: a clip already on disk is skipped (delete it to regenerate). Every run also rewrites
// frontend/src/features/keeper/voiceDurations.gen.json (each bundled Keeper clip's length in ms, from its size: the
// clips are 64 kbps CBR), which the app uses to never talk over its own counting.
//
//   cd backend && npx tsx scripts/keeper_hype_voice.ts            # generate the missing clips, then the durations
//   cd backend && npx tsx scripts/keeper_hype_voice.ts --durations # only rewrite the durations (no network, no key)
import { config } from "dotenv";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HYPE_LINES, HYPE_MAX_CHARS } from "../../frontend/src/features/keeper/hypeLines";

const ELEVEN_API = "https://api.elevenlabs.io"; // as in src/v4/voice.ts
const backend = join(dirname(fileURLToPath(import.meta.url)), "..");
const voiceDir = join(backend, "..", "frontend", "assets", "voice");
const hypeDir = join(voiceDir, "hype");
const durationsFile = join(backend, "..", "frontend", "src", "features", "keeper", "voiceDurations.gen.json");

/** Length of a 64 kbps CBR mp3 in ms: its bytes after the ID3 tag / 8. */
function mp3Ms(path: string): number {
  const buf = readFileSync(path);
  let start = 0;
  if (buf.length > 10 && buf.toString("latin1", 0, 3) === "ID3") {
    start = 10 + (((buf[6]! & 0x7f) << 21) | ((buf[7]! & 0x7f) << 14) | ((buf[8]! & 0x7f) << 7) | (buf[9]! & 0x7f));
  }
  return Math.round((buf.length - start) / 8);
}

function writeDurations(): void {
  const out: Record<string, number> = {};
  for (const f of readdirSync(voiceDir).filter((f) => f.endsWith(".mp3")).sort()) out[f.slice(0, -4)] = mp3Ms(join(voiceDir, f));
  if (existsSync(hypeDir)) {
    for (const f of readdirSync(hypeDir).filter((f) => f.endsWith(".mp3")).sort()) out[`hype/${f.slice(0, -4)}`] = mp3Ms(join(hypeDir, f));
  }
  writeFileSync(durationsFile, JSON.stringify(out, null, 2) + "\n");
  console.log(`durations for ${Object.keys(out).length} clips → ${durationsFile}`);
}

async function generate(): Promise<void> {
  config({ path: join(backend, ".env"), quiet: true } as Parameters<typeof config>[0]);
  const key = process.env.ELEVENLABS_API_KEY, voice = process.env.KEEPER_VOICE_ID;
  if (!key || !voice) throw new Error("ELEVENLABS_API_KEY and KEEPER_VOICE_ID must be set (backend/.env)");
  const tooLong = HYPE_LINES.filter((l) => l.text.length > HYPE_MAX_CHARS);
  if (tooLong.length) throw new Error(`lines over ${HYPE_MAX_CHARS} characters: ${tooLong.map((l) => l.id).join(", ")}`);
  mkdirSync(hypeDir, { recursive: true });
  let made = 0, skipped = 0, bytes = 0;
  for (const line of HYPE_LINES) {
    const file = join(hypeDir, `${line.id}.mp3`);
    if (existsSync(file) && statSync(file).size > 0) { skipped++; continue; }
    const res = await fetch(`${ELEVEN_API}/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_64`, {
      method: "POST", headers: { "xi-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({ text: line.text, model_id: "eleven_flash_v2_5", voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.3, speed: 1.1 } }),
    });
    if (!res.ok) throw new Error(`${line.id}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
    const audio = Buffer.from(await res.arrayBuffer());
    writeFileSync(file, audio);
    made++; bytes += audio.length;
  }
  console.log(`${made} clips made (${Math.round(bytes / 1024)} KB), ${skipped} already there → ${hypeDir}`);
}

try {
  if (!process.argv.includes("--durations")) await generate();
} finally {
  writeDurations();
}
