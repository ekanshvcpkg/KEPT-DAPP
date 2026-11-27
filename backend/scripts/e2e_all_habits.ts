// Whole-workflow Devnet run for EVERY habit type: a photo habit and all nine live activities (push-ups, squats,
// jumping jacks, lunges, sit-ups, high knees, burpees, overhead presses, timed plank), through the real backend code,
// our program on Devnet and the verifier key:
//   create a solo native-SOL Oath on chain -> save its habit details -> for each habit: challenge (blockhash gesture,
//   server-picked freeze rep) -> proof (a photo, or a synthetic rep set filmed from a 3D body with the Freeze after the
//   server's rep) -> the server recounts the trace -> stand-in judge -> habit claim -> after the last habit the day is
//   recorded on chain -> audit: receipts re-hash to the on-chain proof_hash.
// Plus, per activity, a cheat set (half reps, one arm, quarter dips...) that the server's recount must refuse.
//
//   cd backend && npx tsx scripts/e2e_all_habits.ts
//
// The vision model is a local stand-in (everything passes unless the photo bytes contain "FAIL"); Supabase and
// ElevenLabs are switched off for the run so no synthetic data or voice credits leak. Needs backend/.env (program,
// verifier, mint, treasury), the local Postgres (infra/docker-compose.local.yml) and the Solana CLI keypair (funds a
// throwaway member).
import "dotenv/config";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { once } from "node:events";
import nacl from "tweetnacl";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { getAccount, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { checkinsFromLogs, claimSolIx, combinedHabitsHash, configPda, createOathSolIx, decodeConfig, decodeOath, decodeOathTerms, joinOathSolIx, receiptHashOf, startOathIx } from "../../packages/chain/src";
import { replayV3 } from "../src/shared/payout";
import { RepCounter, type Exercise, type RepEvent, type RepSample } from "../../packages/engine/src/reps";
import * as V from "../../packages/engine/src/reps3d.fixtures";
import { GESTURE_TEXT, type ChallengeGesture } from "../src/v4/rules";

const API_PORT = 3197, VISION_PORT = 3196;
const API = `http://127.0.0.1:${API_PORT}`;
const PROGRAM_ID = new PublicKey(process.env.KEEPER_PROGRAM_ID!);
const conn = new Connection(process.env.DEVNET_RPC_URL ?? "https://api.devnet.solana.com", "confirmed");
const cliKey = readFileSync(`${homedir()}/.config/solana/cli/config.yml`, "utf8").match(/^keypair_path:\s*(.+)$/m)![1]!.trim().replace(/^~/, homedir());
const funder = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(cliKey, "utf8"))));
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sha = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
let failures = 0;
const results: { habit: string; step: string; ok: boolean; detail: string }[] = [];
const check = (habit: string, step: string, ok: boolean, detail = "") => { if (!ok) failures++; results.push({ habit, step, ok, detail }); log(ok ? "PASS" : "FAIL", `[${habit}]`, step, detail); };

/** A JPEG-looking photo; with w/h it carries a SOF header of that size (the rep check compares it with the trace's aspect). */
function jpeg(tag: string, w?: number, h?: number): Buffer {
  const sof = w && h ? Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]) : Buffer.alloc(0);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), sof, Buffer.from([0xff, 0xe0]), Buffer.from(`${tag}-${Date.now()}-${Math.random()}`), Buffer.alloc(4000, 9)]);
}

function standInVision() {
  return createServer((req, res) => {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      const url: string = JSON.parse(body).messages[0].content[1].image_url.url;
      const bytes = Buffer.from(url.slice(url.indexOf(",") + 1), "base64").toString("latin1");
      const verdict = bytes.includes("FAIL")
        ? { objectPresent: false, objectConfidence: 0.05, gestureSeen: "none", gestureMatches: false, looksLikeScreenOrPrintout: true, reason: "This is a photo of a screen." }
        : { objectPresent: true, objectConfidence: 0.93, gestureSeen: "as asked", gestureMatches: true, looksLikeScreenOrPrintout: false, reason: "Real scene; the object and the move are clearly visible." };
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ model: "stand-in-vision", choices: [{ message: { content: JSON.stringify(verdict) } }] }));
    });
  }).listen(VISION_PORT, "127.0.0.1");
}

async function api(path: string, body?: unknown, token?: string) {
  const r = await fetch(API + path, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: r.status, body: (await r.json().catch(() => ({}))) as any };
}

async function signIn(kp: Keypair): Promise<string> {
  const wallet = kp.publicKey.toBase58();
  const message: string = (await api("/api/auth/nonce", { wallet })).body.message;
  const signature = Buffer.from(nacl.sign.detached(Buffer.from(message, "utf8"), kp.secretKey)).toString("base64");
  const r = await api("/api/auth/verify", { wallet, message, signature });
  if (!r.body?.token) throw new Error(`sign-in failed: ${JSON.stringify(r.body)}`);
  return r.body.token as string;
}

// ── Synthetic rep sets: a 3D stick body filmed by a level camera, exactly the samples the phone's pose view sends ──
type Activity = { exercise: Exercise; target: number; text: string };
const STAND_CAM: V.Cam = { azimuth: 30, height: 0.8, distance: 2.7, landscape: false };
const FLOOR_CAM: V.Cam = { azimuth: 40, height: 0.15, distance: 2.3, landscape: true };
// A fresh noise seed per run: identical traces are refused as replays (a trace proves one set once).
const NOISE: V.Noise = { seed: 1 + (Date.now() % 100_000) };
function scene(ex: Exercise, cheat: boolean): { body: (e: number, i: number) => V.Body; cam: V.Cam; period: number } {
  switch (ex) {
    case "pushup": return { body: (e) => (cheat ? V.kneePushupBody(e) : V.pushupBody(e)), cam: FLOOR_CAM, period: 1600 };
    case "squat": return { body: (e) => (cheat ? V.goodMorningBody(e) : V.squatBody(e)), cam: STAND_CAM, period: 2000 };
    case "jumpingjack": return { body: (e) => V.jackBody(e, cheat ? { arms: 90 } : {}), cam: STAND_CAM, period: 1000 };
    case "lunge": return { body: V.alternate((e, l) => V.lungeBody(e, l, cheat ? { bottomY: 0.8 } : {})), cam: STAND_CAM, period: 2400 };
    case "situp": return { body: (e) => V.situpBody(e, cheat ? { top: 15 } : {}), cam: FLOOR_CAM, period: 2400 };
    case "highknee": return { body: V.alternate((e, l) => V.kneesBody(e, l, cheat ? { lift: 45 } : {})), cam: { ...STAND_CAM, azimuth: 0 }, period: 800 };
    case "burpee": return { body: (e) => V.burpeeBody(e, cheat ? { squatOnly: true } : {}), cam: STAND_CAM, period: 3200 };
    case "press": return { body: (e) => V.pressBody(e, cheat ? { half: true } : {}), cam: STAND_CAM, period: 1800 };
    case "plank": return { body: (e) => V.plankBody(e, cheat ? { sag: 0.25 } : {}), cam: FLOOR_CAM, period: 1000 };
  }
}

function replay(ex: Exercise, aspect: number, samples: RepSample[], pause: [number, number] | null): RepEvent[] {
  const c = new RepCounter(ex, aspect);
  const out: RepEvent[] = [];
  for (const s of samples) {
    if (pause && s.t >= pause[0] && s.t <= pause[1]) continue;
    out.push(...c.push(s));
  }
  return out;
}

/**
 * The evidence the app would upload for a set: the trace (samples from Start to the rep that completes the set, with the
 * Freeze as one pause window), the counted reps, and the freeze after rep `freezeAfter`. Cheat sets have no freeze.
 */
function synthSet(a: Activity, freezeAfter: number, cheat: boolean) {
  const sc = scene(a.exercise, cheat);
  const aspect = V.aspectOf(sc.cam);
  const timed = a.exercise === "plank";
  const k = Math.max(1, freezeAfter);
  const script: V.Seg[] = timed
    ? [V.hold(1, (a.target + 6) * 1000 + 3800)]
    : cheat ? [V.hold(1, 1200), ...V.reps(a.target, sc.period), V.hold(1, 600)]
      : [V.hold(1, 1200), ...V.reps(k, sc.period), V.hold(1, 3800), ...V.reps(a.target - k, sc.period), V.hold(1, 800)];
  const samples = V.film(script, { kind: a.exercise, body: sc.body, cam: sc.cam, noise: NOISE });
  let pause: [number, number] | null = null;
  if (!cheat) {
    const reps0 = replay(a.exercise, aspect, samples, null).filter((e): e is Extract<RepEvent, { type: "rep" }> => e.type === "rep");
    const kth = reps0.find((e) => e.n === k);
    if (!kth) throw new Error(`${a.text}: the synthetic set never reached rep ${k}`);
    if (timed) {
      const t0 = samples.find((s) => s.t > kth.endT + 60)!.t;
      pause = [t0, samples.find((s) => s.t >= t0 + 3500)!.t];
    } else {
      const next = reps0.find((e) => e.n === k + 1);
      const a0 = samples.find((s) => s.t >= kth.endT + 250)!.t;
      const b0 = [...samples].reverse().find((s) => s.t <= (next ? next.startT : kth.endT + 4000) - 250)!.t;
      pause = [a0, Math.min(b0, a0 + 3600)];
    }
  }
  const events = replay(a.exercise, aspect, samples, pause);
  const reps = events.filter((e): e is Extract<RepEvent, { type: "rep" }> => e.type === "rep");
  const last = reps.find((e) => e.n === a.target) ?? reps.at(-1);
  const endT = last ? last.endT : samples.at(-1)!.t;
  const kept = samples.filter((s) => s.t <= endT);
  const trace = { v: 1, engine: "reps@1", exercise: a.exercise, aspect, t: kept.map((s) => s.t), p: kept.flatMap((s) => (s.p.length ? s.p : Array(36).fill(0))), pauses: pause ? [pause] : [] };
  const [w, h] = sc.cam.landscape ? [640, 480] : [480, 640];
  const photo = jpeg(`${a.exercise}${cheat ? "-cheat" : ""}`, w, h);
  const ft = pause ? kept.find((s) => s.t >= (pause![0] + pause![1]) / 2)!.t : 0;
  const evidence = {
    trace, reps: reps.slice(0, a.target).map((e) => ({ startT: e.startT, bottomT: e.bottomT, endT: e.endT })), phoneCount: Math.min(reps.length, a.target),
    freeze: pause ? { afterRep: k, promptT: reps.find((e) => e.n === k)?.endT ?? 0, t: ft, gesture: "hand_up", sha256: sha(photo) } : null,
    keyframes: [],
  };
  return { evidence, photo, counted: reps.length, durationMs: trace.t.at(-1)! - trace.t[0]! };
}

// ── The run ──
const OATHS: { name: string; habits: { name: string; proof: string }[] }[] = [
  { name: "All moves A", habits: [
    { name: "Read", proof: "book" }, { name: "Push-ups", proof: "10 push-ups" }, { name: "Squats", proof: "10 squats" }, { name: "Jacks", proof: "20 jumping jacks" },
    { name: "Lunges", proof: "10 lunges" }, { name: "Sit-ups", proof: "10 sit-ups" }, { name: "High knees", proof: "20 high knees" }, { name: "Burpees", proof: "5 burpees" },
  ] },
  { name: "All moves B", habits: [{ name: "Press", proof: "10 overhead presses" }, { name: "Plank", proof: "30-second plank" }, { name: "Hydrate", proof: "water bottle" }] },
];
const ACTIVITY: Record<string, Activity> = {
  "10 push-ups": { exercise: "pushup", target: 10, text: "10 push-ups" }, "10 squats": { exercise: "squat", target: 10, text: "10 squats" },
  "20 jumping jacks": { exercise: "jumpingjack", target: 20, text: "20 jumping jacks" }, "10 lunges": { exercise: "lunge", target: 10, text: "10 lunges" },
  "10 sit-ups": { exercise: "situp", target: 10, text: "10 sit-ups" }, "20 high knees": { exercise: "highknee", target: 20, text: "20 high knees" },
  "5 burpees": { exercise: "burpee", target: 5, text: "5 burpees" }, "10 overhead presses": { exercise: "press", target: 10, text: "10 overhead presses" },
  "30-second plank": { exercise: "plank", target: 30, text: "30-second plank" },
};

async function main() {
  const member = Keypair.generate();
  const group = [Keypair.generate(), Keypair.generate(), Keypair.generate()];
  const latecomer = Keypair.generate();
  const vision = standInVision();
  const server = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: new URL("..", import.meta.url).pathname, stdio: ["ignore", "pipe", "inherit"],
    env: {
      ...process.env, PORT: String(API_PORT), SGT_MOCK: "true", SGT_MOCK_ALLOWLIST: [member, ...group, latecomer].map((k) => k.publicKey.toBase58()).join(","),
      VISION_API_URL: `http://127.0.0.1:${VISION_PORT}/v1/chat/completions`, OPEN_API_KEY: "stand-in", VISION_MODEL: "stand-in-vision",
      SUPABASE_URL: "", SUPABASE_SECRET_KEY: "", ELEVENLABS_API_KEY: "",
    },
  });
  try {
    await once(server.stdout!, "data");
    log("backend up on", API, "| program", PROGRAM_ID.toBase58(), "| stand-in vision, no Supabase, no ElevenLabs");
    const cfg = decodeConfig((await conn.getAccountInfo(configPda(PROGRAM_ID)))!.data);
    const treasury = new PublicKey(cfg.treasury);
    const env = { programId: PROGRAM_ID, stakeMint: new PublicKey(cfg.stakeMint), treasury, treasuryAuthority: (await getAccount(conn, treasury, "confirmed", TOKEN_2022_PROGRAM_ID)).owner, tokenProgram: TOKEN_2022_PROGRAM_ID };
    await sendAndConfirmTransaction(conn, new Transaction().add(SystemProgram.transfer({ fromPubkey: funder.publicKey, toPubkey: member.publicKey, lamports: 40_000_000 })), [funder]);
    const token = await signIn(member);
    const wallet = member.publicKey.toBase58();

    for (const spec of OATHS) {
      const goal = spec.habits.map((h) => h.name).join(" · ");
      const { ix, oath } = createOathSolIx(env as any, { creator: member.publicKey, oathId: BigInt(Date.now()), goalText: goal, objectId: 1, numDays: 3, daySeconds: 86_400, tzOffsetMinutes: 0, stake: 5_000_000n, isSolo: true } as any);
      await sendAndConfirmTransaction(conn, new Transaction().add(ix), [member]);
      // A solo Oath is started right after it is created (the app does the same); its details are saved after that.
      await sendAndConfirmTransaction(conn, new Transaction().add(startOathIx(env as any, { oath, creator: member.publicKey })), [member]);
      const o = oath.toBase58();
      log(`Oath "${spec.name}" started (solo, ${spec.habits.length} habits)`, `https://explorer.solana.com/address/${o}?cluster=devnet`);
      // Wait until the RPC the backend reads has the new account (Devnet nodes lag a few seconds).
      for (let i = 0; i < 30 && !(await conn.getAccountInfo(oath, "confirmed")); i++) await sleep(1000);
      await sleep(4000);
      let saved = await api("/api/oaths/details", { oath: o, goalText: goal, habits: spec.habits.map((h) => h.name), habitObjects: spec.habits.map((h) => h.proof) }, token);
      for (let i = 0; i < 6 && saved.status === 404; i++) { await sleep(3000); saved = await api("/api/oaths/details", { oath: o, goalText: goal, habits: spec.habits.map((hb) => hb.name), habitObjects: spec.habits.map((hb) => hb.proof) }, token); }
      check(spec.name, "habit details saved on an Active solo Oath (first save)", saved.status === 201, `HTTP ${saved.status} ${saved.body.error ?? ""}`);
      const watch = await fetch(`${API}/api/oaths/watch`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ oath: o }) });
      check(spec.name, "Oath registered for the server's jobs", watch.status === 204, `HTTP ${watch.status}`);

      let lastSignature: string | undefined;
      for (const [h, habit] of spec.habits.entries()) {
        const label = habit.proof;
        const act = ACTIVITY[habit.proof];
        const ch = await api("/api/proof/challenge", { oath: o, dayIndex: 0, habit: h }, token);
        check(label, "challenge names the habit's own proof", ch.status === 200 && ch.body.object === habit.proof, ch.status === 200 ? `object ${ch.body.object}, gesture ${ch.body.gesture}${act ? `, freeze after ${ch.body.freezeAfter}` : ""}` : `HTTP ${ch.status}: ${ch.body.error}`);
        if (ch.status !== 200) continue;
        const expectedGesture = GESTURE_TEXT[ch.body.gesture as ChallengeGesture];
        const issued = Date.now();
        let verify;
        if (act) {
          // The cheat first: the server's recount must refuse it (and it costs no model call).
          const cheat = synthSet(act, ch.body.freezeAfter ?? 1, true);
          await sleep(Math.max(0, cheat.durationMs - 4000 - (Date.now() - issued)));
          const refused = await api("/proof/verify", { photo: cheat.photo.toString("base64"), expectedObject: ch.body.object, expectedGesture, oath: o, dayIndex: 0, habit: h, reps: cheat.evidence }, token);
          check(label, "a cheat set is refused by the server's recount", refused.status === 422 || (refused.status === 200 && refused.body.pass === false), `HTTP ${refused.status}: ${refused.body.error ?? refused.body.reason} (phone counted ${cheat.counted})`);
          const honest = synthSet(act, ch.body.freezeAfter ?? 1, false);
          await sleep(Math.max(0, honest.durationMs - 4000 - (Date.now() - issued)));
          verify = await api("/proof/verify", { photo: honest.photo.toString("base64"), expectedObject: ch.body.object, expectedGesture, oath: o, dayIndex: 0, habit: h, reps: honest.evidence }, token);
          check(label, `honest set (${honest.counted} counted, ${Math.round(honest.durationMs / 1000)} s) passes the recount and the judge`, verify.status === 200 && verify.body.pass === true, `HTTP ${verify.status}: ${verify.body.error ?? verify.body.reason ?? ""}`);
          if (verify.status === 200) {
            const rec = await api(`/keeper/receipts/${verify.body.receiptHash}`);
            check(label, "receipt carries the server's recount", rec.body.receipt?.reps?.repCount >= act.target && rec.body.receipt?.reps?.exercise === act.exercise, `recount ${rec.body.receipt?.reps?.repCount}/${act.target}, freeze after ${rec.body.receipt?.reps?.freeze?.afterRep}`);
          }
        } else {
          verify = await api("/proof/verify", { photo: jpeg("photo").toString("base64"), expectedObject: ch.body.object, expectedGesture, oath: o, dayIndex: 0, habit: h }, token);
          check(label, "photo passes the judge with a public receipt", verify.status === 200 && verify.body.pass === true && /^[a-f0-9]{64}$/.test(verify.body.receiptHash ?? ""), `HTTP ${verify.status}`);
        }
        if (verify?.status !== 200 || !verify.body.verificationId) continue;
        const claim = await api("/api/proof/habit", { oath: o, dayIndex: 0, habit: h, verificationId: verify.body.verificationId }, token);
        const lastHabit = h === spec.habits.length - 1;
        check(label, lastHabit ? "last habit: the day is recorded on chain" : "habit claimed for today", claim.status === 201 && claim.body.dayKept === lastHabit, lastHabit ? `https://explorer.solana.com/tx/${claim.body.signature}?cluster=devnet` : `done ${JSON.stringify(claim.body.done)}`);
        if (lastHabit) lastSignature = claim.body.signature;
      }

      // Audit: every receipt re-hashes to its hash, and their combination is the on-chain proof_hash.
      const day = await api(`/keeper/oaths/${o}/days/0?wallet=${wallet}`);
      const hashes: string[] = day.body.receiptHashes ?? [];
      let rehashed = hashes.length === spec.habits.length;
      for (const hh of hashes) { const r = await api(`/keeper/receipts/${hh}`); rehashed &&= receiptHashOf(r.body.receipt) === hh; }
      check(spec.name, "every public receipt re-hashes to its published hash", rehashed, `${hashes.length} receipts`);
      let onChain: string | undefined;
      for (let i = 0; i < 25 && !onChain && lastSignature; i++) {
        const tx = await conn.getTransaction(lastSignature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
        onChain = checkinsFromLogs(tx?.meta?.logMessages ?? []).find((e) => e.member === wallet && e.dayIndex === 0)?.proofHash;
        if (!onChain) await sleep(1000);
      }
      check(spec.name, "on-chain proof_hash equals the combined receipt hashes", !!onChain && onChain === combinedHabitsHash(hashes), `chain ${onChain}`);
    }
    await groupRun(env, group, latecomer);
    const passed = results.filter((r) => r.ok).length;
    log(failures ? `${failures} of ${results.length} checks FAILED` : `ALL ${passed} CHECKS PASSED`);
  } finally {
    server.kill();
    vision.close();
  }
  process.exit(failures ? 1 : 0);
}

// ── A group Oath through its whole life: 3 of 4 seats, start, a miss, automatic settlement, claims ──
const DAY = 120; // the program accepts 2-minute days for testing
const MARKS = [["k", "k", "k"], ["k", "k", "m"], ["k", "k", "k"]]; // day x member: kept / missed (C misses day 2)
async function groupRun(env: any, members: Keypair[], latecomer: Keypair) {
  const G = "group";
  const STAKE = 5_000_000n;
  const fund = new Transaction();
  for (const m of [...members, latecomer]) fund.add(SystemProgram.transfer({ fromPubkey: funder.publicKey, toPubkey: m.publicKey, lamports: 25_000_000 }));
  await sendAndConfirmTransaction(conn, fund, [funder]);
  const tokens = await Promise.all(members.map((m) => signIn(m)));
  const { ix, oath } = createOathSolIx(env, { creator: members[0]!.publicKey, oathId: BigInt(Date.now()), goalText: "Read", objectId: 1, numDays: 3, daySeconds: DAY, tzOffsetMinutes: 0, stake: STAKE, isSolo: false } as any);
  await sendAndConfirmTransaction(conn, new Transaction().add(ix), [members[0]!]);
  const o = oath.toBase58();
  for (let i = 0; i < 30 && !(await conn.getAccountInfo(oath, "confirmed")); i++) await sleep(1000);
  await sleep(3000);
  const saved = await api("/api/oaths/details", { oath: o, goalText: "Read", habits: ["Read"], habitObjects: ["book"] }, tokens[0]);
  check(G, "creator saves the habit while the Oath is open", saved.status === 201, `HTTP ${saved.status}`);
  for (const m of members.slice(1)) await sendAndConfirmTransaction(conn, new Transaction().add(joinOathSolIx(env, { oath, member: m.publicKey })), [m]);
  check(G, "two friends joined (3 of 4 seats)", decodeOath((await conn.getAccountInfo(oath, "confirmed"))!.data).members.length === 3);
  await sendAndConfirmTransaction(conn, new Transaction().add(startOathIx(env, { oath, creator: members[0]!.publicKey })), [members[0]!]);
  const started = decodeOath((await conn.getAccountInfo(oath, "confirmed"))!.data);
  check(G, "the creator starts it with 3 members (no need to fill all 4 seats)", started.status === "active" || (started as any).status === 1, `status ${started.status}`);
  let lateJoined = true;
  try { await sendAndConfirmTransaction(conn, new Transaction().add(joinOathSolIx(env, { oath, member: latecomer.publicKey })), [latecomer]); } catch { lateJoined = false; }
  check(G, "a 4th wallet can't join after the start", !lateJoined);
  const watch = await fetch(`${API}/api/oaths/watch`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${tokens[1]}` }, body: JSON.stringify({ oath: o }) });
  check(G, "a member registers it for the server's jobs", watch.status === 204);
  log("group Oath", `https://explorer.solana.com/address/${o}?cluster=devnet`, "| 3 days of 2 minutes");

  for (let d = 0; d < MARKS.length; d++) {
    const dayStart = started.startTs + d * DAY;
    while (Date.now() / 1000 < dayStart + 3) await sleep(1000);
    for (const [i, m] of members.entries()) {
      if (MARKS[d]![i] !== "k") continue;
      const who = `${G} day ${d + 1} member ${"ABC"[i]}`;
      const ch = await api("/api/proof/challenge", { oath: o, dayIndex: d, habit: 0 }, tokens[i]);
      if (ch.status !== 200) { check(who, "challenge", false, `HTTP ${ch.status}: ${ch.body.error}`); continue; }
      const v = await api("/proof/verify", { photo: jpeg(`g${d}${i}`).toString("base64"), expectedObject: ch.body.object, expectedGesture: GESTURE_TEXT[ch.body.gesture as ChallengeGesture], oath: o, dayIndex: d, habit: 0 }, tokens[i]);
      const claim = v.status === 200 && v.body.verificationId ? await api("/api/proof/habit", { oath: o, dayIndex: d, habit: 0, verificationId: v.body.verificationId }, tokens[i]) : { status: 0, body: {} as any };
      check(who, "proves and the day is recorded on chain", claim.status === 201 && claim.body.dayKept === true, `HTTP ${claim.status} ${claim.body.error ?? ""}`);
    }
  }
  const masks = members.map((_, i) => MARKS.reduce((acc, day, d) => (day[i] === "k" ? acc | (1 << d) : acc), 0));
  const onChain = decodeOath((await conn.getAccountInfo(oath, "confirmed"))!.data);
  check(G, "on-chain days kept match (C missed day 2)", members.every((m, i) => onChain.members.find((x) => x.wallet === m.publicKey.toBase58())!.daysKept === masks[i]), JSON.stringify(onChain.members.map((x) => x.daysKept)));

  // The server's scheduler (every 60 s) settles a finished Oath by itself, as it does for real users.
  const end = started.startTs + MARKS.length * DAY;
  log("waiting for the Oath to end and the server to settle it…");
  let settled = onChain;
  for (let i = 0; i < 80 && settled.status !== "settled" && (settled as any).status !== 2; i++) { await sleep(5000); settled = decodeOath((await conn.getAccountInfo(oath, "confirmed"))!.data); }
  check(G, "the server settled the Oath on its own after it ended", settled.status === "settled" || (settled as any).status === 2, `status ${settled.status}, ${Math.round(Date.now() / 1000 - end)} s after the end`);
  const terms = decodeOathTerms((await conn.getAccountInfo(oath, "confirmed"))!.data)!;
  const expected = replayV3(STAKE, terms.missBps, false, masks, MARKS.length)!;
  members.forEach((m, i) => {
    const got = BigInt(settled.members.find((x) => x.wallet === m.publicKey.toBase58())!.payout);
    check(G, `payout ${"ABC"[i]} matches the rules engine`, got === expected.payouts[i], `chain ${got} lamports, expected ${expected.payouts[i]}`);
  });
  check(G, "conservation: payouts + treasury + held = all stakes", expected.payouts.reduce((a, b) => a + b, 0n) + expected.toTreasury + expected.held === STAKE * 3n);
  for (const [i, m] of members.entries()) {
    let ok = true;
    try { await sendAndConfirmTransaction(conn, new Transaction().add(claimSolIx(env, { oath, member: m.publicKey })), [m]); } catch { ok = false; }
    check(G, `member ${"ABC"[i]} claims the payout`, ok);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
