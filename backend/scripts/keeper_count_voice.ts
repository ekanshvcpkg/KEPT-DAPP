// Pre-generates the Keeper's rep-counting voice (ElevenLabs text-to-speech, the custom KEPT Keeper voice) into the app's
// assets, so counting along with live reps is instant and works offline. Re-run after changing KEEPER_VOICE_ID.
//
//   cd backend && npx tsx scripts/keeper_count_voice.ts                 # every clip
//   cd backend && npx tsx scripts/keeper_count_voice.ts --only freeze,done   # just these (then keeper_hype_voice.ts --durations)
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ELEVEN_API } from "../src/v4/voice";

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty"];
const say = (n: number) => (n < 20 ? WORDS[n]! : TENS[Math.floor(n / 10)]! + (n % 10 ? `-${WORDS[n % 10]}` : ""));
const LINES: Record<string, string> = {
  ...Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`count-${i + 1}`, `${say(i + 1)[0]!.toUpperCase()}${say(i + 1).slice(1)}.`])),
  // The freeze move is one raised hand (backend REP_FREEZE_GESTURE; the screen says "Freeze! Raise one hand"), never a
  // thumbs up. Ends on a hold so the photo (taken after it) still has the hand up.
  "freeze": "Freeze! One hand up. Hold it.",
  "half-rep": "That wasn't a rep. Go lower.",
  "go": "Begin. I'm counting.",
  // Before the verdict: the server still recounts and checks the Freeze photo, so never "kept" here.
  "done": "Done. Now I judge your set.",
  "lost": "I can't see you. Get back in frame.",
};
const key = process.env.ELEVENLABS_API_KEY, voice = process.env.KEEPER_VOICE_ID;
if (!key || !voice) throw new Error("ELEVENLABS_API_KEY and KEEPER_VOICE_ID must be set");
const dir = join(process.cwd(), "..", "frontend", "assets", "voice");
mkdirSync(dir, { recursive: true });
let total = 0;
const onlyArg = process.argv.indexOf("--only");
const only = onlyArg > 0 ? new Set((process.argv[onlyArg + 1] ?? "").split(",").filter(Boolean)) : null;
for (const [name, text] of Object.entries(LINES).filter(([n]) => !only || only.has(n))) {
  const res = await fetch(`${ELEVEN_API}/v1/text-to-speech/${voice}?output_format=mp3_44100_64`, {
    method: "POST", headers: { "xi-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({ text, model_id: "eleven_flash_v2_5", voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.3, speed: 1.1 } }),
  });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status} ${await res.text()}`);
  const audio = Buffer.from(await res.arrayBuffer());
  writeFileSync(join(dir, `${name}.mp3`), audio);
  total += audio.length;
}
console.log(`${only ? only.size : Object.keys(LINES).length} clips, ${Math.round(total / 1024)} KB → ${dir}`);
