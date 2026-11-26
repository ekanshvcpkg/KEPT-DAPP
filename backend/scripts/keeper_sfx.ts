// Generates KEPT's sound design with ElevenLabs Sound Effects, once, into the app's assets (frontend/assets/sfx).
//
//   cd backend && npx tsx scripts/keeper_sfx.ts
//
// Needs ELEVENLABS_API_KEY (Sound Effects access). The MP3s are committed and bundled with the app (no key on the phone).
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ELEVEN_API } from "../src/v4/voice";

const SOUNDS: Record<string, { text: string; seconds: number }> = {
  kept: { text: "A heavy brass stamp slams down on paper, followed by a short, satisfied low chime. Dry, close, no music.", seconds: 1.5 },
  rejected: { text: "A low wooden gavel knock and a short disapproving descending two-note buzz, dry and close.", seconds: 1.2 },
  payout: { text: "A small pile of gold coins pours onto a wooden table, then a cash register bell rings once. Crisp and short.", seconds: 2 },
  broken: { text: "A thick chain snaps and falls to a stone floor, followed by a deep ominous low boom. Short, cinematic.", seconds: 2 },
};

const key = process.env.ELEVENLABS_API_KEY;
if (!key) throw new Error("ELEVENLABS_API_KEY is not set");
const dir = join(process.cwd(), "..", "frontend", "assets", "sfx");
mkdirSync(dir, { recursive: true });
for (const [name, s] of Object.entries(SOUNDS)) {
  const res = await fetch(`${ELEVEN_API}/v1/sound-generation?output_format=mp3_44100_64`, {
    method: "POST", headers: { "xi-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({ text: s.text, duration_seconds: s.seconds, prompt_influence: 0.5, model_id: "eleven_text_to_sound_v3" }),
  });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status} ${await res.text()}`);
  const audio = Buffer.from(await res.arrayBuffer());
  writeFileSync(join(dir, `${name}.mp3`), audio);
  console.log(`${name}.mp3: ${audio.length} bytes`);
}
