// Designs the Keeper's voice with ElevenLabs Voice Design, once.
//
//   cd backend && npx tsx scripts/keeper_voice_design.ts            → generates previews, saves them as MP3s to listen to
//   cd backend && npx tsx scripts/keeper_voice_design.ts --pick 2   → saves preview 2 as the "KEPT Keeper" voice, prints KEEPER_VOICE_ID
//
// Needs ELEVENLABS_API_KEY in backend/.env (Voice Generation + Voices write). Put the printed KEEPER_VOICE_ID in .env.
import "dotenv/config";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ELEVEN_API } from "../src/v4/voice";

const DESCRIPTION = "An old reaper who is half prison warden, half bookmaker: a deep, dry, gravelly male voice, unhurried and wry, "
  + "faintly amused, close to the microphone, with a theatrical British accent. Never shouts; every line sounds like a verdict.";
const SAMPLE = "Everyone swears. I keep receipts. Your photo shows the bottle and the thumbs up, so the day is kept. Barely. "
  + "Miss tomorrow and the ones who kept will split your share, and I will be watching every second of it.";
const DIR = join(process.cwd(), ".keeper-voice");
const key = process.env.ELEVENLABS_API_KEY;
if (!key) throw new Error("ELEVENLABS_API_KEY is not set in backend/.env");
const headers = { "xi-api-key": key, "content-type": "application/json" };

async function main() {
  const pick = process.argv.includes("--pick") ? Number(process.argv[process.argv.indexOf("--pick") + 1]) : null;
  mkdirSync(DIR, { recursive: true });
  if (pick === null) {
    const res = await fetch(`${ELEVEN_API}/v1/text-to-voice/design?output_format=mp3_44100_128`, {
      method: "POST", headers, body: JSON.stringify({ voice_description: DESCRIPTION, text: SAMPLE, model_id: "eleven_multilingual_ttv_v2" }),
    });
    if (!res.ok) throw new Error(`Voice Design failed: HTTP ${res.status} ${await res.text()}`);
    const { previews } = (await res.json()) as { previews: { audio_base_64: string; generated_voice_id: string }[] };
    previews.forEach((p, i) => writeFileSync(join(DIR, `preview-${i + 1}.mp3`), Buffer.from(p.audio_base_64, "base64")));
    writeFileSync(join(DIR, "previews.json"), JSON.stringify(previews.map((p) => p.generated_voice_id)));
    console.log(`${previews.length} previews saved in ${DIR} (preview-1.mp3 …). Listen, then run with --pick <n>.`);
    return;
  }
  const ids = JSON.parse(readFileSync(join(DIR, "previews.json"), "utf8")) as string[];
  const generated = ids[pick - 1];
  if (!generated) throw new Error(`No preview ${pick}; there are ${ids.length}`);
  const res = await fetch(`${ELEVEN_API}/v1/text-to-voice`, {
    method: "POST", headers, body: JSON.stringify({ voice_name: "KEPT Keeper", voice_description: DESCRIPTION, generated_voice_id: generated, labels: { app: "kept" } }),
  });
  if (!res.ok) throw new Error(`Saving the voice failed: HTTP ${res.status} ${await res.text()}`);
  const { voice_id } = (await res.json()) as { voice_id: string };
  console.log(`Saved. Put this in backend/.env:\nKEEPER_VOICE_ID=${voice_id}`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
