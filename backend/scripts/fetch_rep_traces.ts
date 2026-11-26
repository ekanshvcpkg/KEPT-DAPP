// Downloads the newest rep-set pose traces from the private Supabase bucket (rep-traces) into docs/notes/real-sets/
// (gitignored), to tune the rep counter on real sets: npx tsx scripts/fetch_rep_traces.ts [count=20]
// Each file: { trace, exercise, target, repCount, phoneCount, pass, reason, storedAt } — keypoints only, no images.
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY, bucket = process.env.SUPABASE_REP_TRACES_BUCKET || "rep-traces";
if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are needed (backend/.env)");
const headers = { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" };
const limit = Number(process.argv[2] ?? 20);
const list = await (await fetch(`${url}/storage/v1/object/list/${bucket}`, { method: "POST", headers, body: JSON.stringify({ prefix: "traces/", limit, sortBy: { column: "created_at", order: "desc" } }) })).json() as { name: string }[];
const out = new URL("../../docs/notes/real-sets/", import.meta.url);
mkdirSync(out, { recursive: true });
for (const f of list) {
  const r = await fetch(`${url}/storage/v1/object/${bucket}/traces/${f.name}`, { headers });
  if (!r.ok) { console.log("skip", f.name, r.status); continue; }
  const text = await r.text();
  writeFileSync(new URL(f.name, out), text);
  const d = JSON.parse(text) as { exercise: string; repCount: number; target: number; pass: boolean };
  console.log(f.name, d.exercise, `${d.repCount}/${d.target}`, d.pass ? "pass" : "fail");
}
console.log(`${list.length} trace(s) in docs/notes/real-sets/`);
