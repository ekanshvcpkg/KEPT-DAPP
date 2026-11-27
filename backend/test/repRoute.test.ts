import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { issueSession } from '../src/auth.js';
import { prisma } from '../src/db.js';
import { programId } from '../src/solana.js';
import { keeper, type Judge } from '../src/v4/keeper.js';
import { freezeAfterRep } from '../src/v4/repProof.js';

// The golden vector "freeze-resume": 8 push-ups (16.95 s) with the freeze pause [7050, 10500] after rep 4.
const fr = JSON.parse(readFileSync(new URL('../../packages/engine/test-vectors/reps-vectors.json', import.meta.url), 'utf8')).vectors.find((v: { name: string }) => v.name === 'freeze-resume');
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
/** A JPEG-looking freeze frame, 640x480 like RepCounterView.capture(); `fill` makes each one unique. */
const frame = (fill: number) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0xe0, 0x02, 0x80, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]), Buffer.alloc(4000, fill)]);
/** The same, portrait (480x640): the standing activities' camera frame. */
const framePortrait = (fill: number) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x80, 0x01, 0xe0, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]), Buffer.alloc(4000, fill)]);
/**
 * The golden vector "jumping-jacks" (5 reps) with a 3 s freeze after rep 2: the samples after that rep's end move 3 s
 * later and the freeze holds the pose of its last sample (what the phone records while the person raises a hand).
 */
const jjTrace = (() => {
  const jj = JSON.parse(readFileSync(new URL('../../packages/engine/test-vectors/reps-vectors.json', import.meta.url), 'utf8')).vectors.find((v: { name: string }) => v.name === 'jumping-jacks').trace;
  const end = 2850, i0 = jj.t.indexOf(end);
  const t: number[] = [], p: number[] = [];
  for (let i = 0; i <= i0; i++) { t.push(jj.t[i]); p.push(...jj.p.slice(i * 36, i * 36 + 36)); }
  for (let x = end + 50; x <= end + 3000; x += 50) { t.push(x); p.push(...jj.p.slice(i0 * 36, i0 * 36 + 36)); }
  for (let i = i0 + 1; i < jj.t.length; i++) { t.push(jj.t[i] + 3000); p.push(...jj.p.slice(i * 36, i * 36 + 36)); }
  return { ...jj, t, p, pauses: [[end + 50, end + 3000]] };
})();

test('POST /proof/verify for a rep habit: the server recounts the trace and judges the freeze frame', async () => {
  const wallet = '11111111111111111111111111111111';
  const oath = programId.toBase58();
  const old = { ...config };
  Object.assign(config, { sessionSecret: 'rep-test', sgtMock: true, sgtMockAllowlist: [wallet], devnetRpcUrl: 'https://api.devnet.solana.com', verifierSecretKey: '', supabaseUrl: '', supabaseSecretKey: '' });
  const originalJudge = keeper.judge;
  const asked: { object: string; gesture: string }[] = [];
  const judge: Judge = async (_p, e) => { asked.push(e); return { verdict: { objectPresent: true, objectConfidence: 0.9, gestureSeen: 'thumbs up', gestureMatches: true, looksLikeScreenOrPrintout: false, reason: 'mid push-up, thumb up' }, model: 'test-model' }; };
  keeper.judge = judge;

  const rows = new Map<string, any>();
  let nextId = 1;
  const restore: Array<() => void> = [];
  const stub = (obj: any, key: string, fn: any) => { const original = obj[key]; obj[key] = fn; restore.push(() => { obj[key] = original; }); };
  stub(prisma.sessionSeat, 'upsert', async () => ({}));
  stub(prisma.proofSession, 'findUnique', async () => null);
  // The set started 20 s after its challenge: past the 2-minute photo window's start, inside the rep window.
  const issuedAt = new Date(Date.now() - 20_000);
  // A blockhash for which the server's freeze pick is rep 4, where the vector's freeze is.
  // ...and, for the jumping-jack set below (5 reps), rep 2.
  const blockhash = Array.from({ length: 400 }, (_, i) => `bh${i}`).find((bh) => freezeAfterRep({ blockhash: bh, issuedAt }, 8) === 4 && freezeAfterRep({ blockhash: bh, issuedAt }, 5) === 2)!;
  stub(prisma.gestureChallenge, 'findFirst', async () => ({ gesture: 'Thumb_Up', issuedAt, slot: 777, blockhash }));
  let savedObjects: string[] | null = null; // the Oath's saved habit objects (null: none saved)
  stub(prisma.oathDetails, 'findUnique', async () => (savedObjects ? { habitObjects: savedObjects } : null));
  stub(prisma.proofVerification, 'create', async ({ data }: any) => { const r = { id: String(nextId++), status: 'PENDING', usedAt: null, oath: null, dayIndex: null, habit: null, createdAt: new Date(), ...data }; rows.set(r.id, r); return r; });
  stub(prisma.proofVerification, 'count', async () => 0);
  stub(prisma.proofVerification, 'update', async ({ where, data }: any) => { const r = { ...rows.get(where.id), ...data }; rows.set(where.id, r); return r; });
  stub(prisma.proofVerification, 'findFirst', async ({ where }: any) => [...rows.values()].find((r) => Object.entries(where).every(([k, v]: [string, any]) =>
    k === 'receipt' ? r.receipt?.reps?.traceSha256 === v.equals : r[k] === v)) ?? null);
  stub(prisma.proofVerification, 'findUnique', async ({ where }: any) => [...rows.values()].find((r) => (where.receiptHash ? r.receiptHash === where.receiptHash : r.id === where.id)) ?? null);

  const server = createApp().listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const verify = async (photo: Buffer, reps: unknown, expectedObject = '8 push-ups') => {
    const r = await fetch(base + '/proof/verify', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${issueSession(wallet)}` },
      body: JSON.stringify({ oath, dayIndex: 0, habit: 0, expectedObject, expectedGesture: 'thumbs up', photo: photo.toString('base64'), ...(reps === undefined ? {} : { reps }) }) });
    return { status: r.status, body: await r.json() as any };
  };
  const evidence = (photo: Buffer, over: object = {}) => ({ trace: fr.trace, reps: 8, phoneCount: 8, freeze: { afterRep: 4, promptT: 6850, t: 8550, gesture: 'Thumb_Up', sha256: sha(photo) }, keyframes: [{ kind: 'final', t: 16950, jpeg: frame(9).toString('base64'), sha256: sha(frame(9)) }], ...over });
  try {
    // A check for another object than the habit's saved one (a stale challenge, as when a solo Oath's details were
    // missing and the server fell back to "dumbbell") is refused before any model call, as a challenge to renew.
    savedObjects = ['8 push-ups'];
    const stale = await verify(frame(5), undefined, 'dumbbell');
    assert.equal(stale.status, 409); assert.equal(stale.body.habitChanged, true); assert.equal(stale.body.expected.object, '8 push-ups');
    assert.equal(asked.length, 0);
    savedObjects = null;

    // A rep habit needs the set: a photo alone is refused.
    const bare = await verify(frame(1), undefined);
    assert.equal(bare.status, 422); assert.equal(bare.body.reps, true);
    assert.equal(asked.length, 0, 'no model call for a set that does not count');

    // The phone's count is ignored: a 10-rep habit with this 8-rep trace fails even if the phone says 10.
    const short = await verify(frame(2), evidence(frame(2), { phoneCount: 10 }), '10 push-ups');
    assert.equal(short.status, 422); assert.match(short.body.error, /counted 8 of 10/);

    // The honest set passes: the vision model is asked about the freeze frame, and the receipt carries the recount.
    const photo = frame(3);
    const ok = await verify(photo, evidence(photo));
    assert.equal(ok.status, 200, JSON.stringify(ok.body)); assert.equal(ok.body.pass, true);
    assert.match(asked.at(-1)!.object, /push-up/); assert.match(asked.at(-1)!.gesture, /hand raised/);
    const receipt = (await (await fetch(`${base}/keeper/receipts/${ok.body.receiptHash}`)).json() as any).receipt;
    assert.equal(receipt.reps.repCount, 8); assert.equal(receipt.reps.target, 8); assert.equal(receipt.reps.exercise, 'pushup');
    assert.deepEqual(receipt.reps.freeze, { afterRep: 4, gesture: 'hand_up', t: 8550 });

    // The same set again (new photo, same trace) is refused: a trace proves one set once.
    rows.get(ok.body.verificationId).receipt = receipt;
    const replay = await verify(frame(4), evidence(frame(4)));
    assert.equal(replay.status, 409); assert.match(replay.body.error, /already used/);
    assert.equal(receipt.reps.keyframes[0].sha256, sha(frame(9)));
    // `expected` is what the vision model was asked (the freeze move); the habit itself is in `reps`.
    assert.match(receipt.expected.object, /push-up/); assert.match(receipt.expected.gesture, /hand raised/);

    // Every live activity takes the same route: a jumping-jack set, judged as a jumping-jack freeze frame.
    const jPhoto = framePortrait(6);
    const jEvidence = { trace: jjTrace, phoneCount: 5, freeze: { afterRep: 2, promptT: 2850, t: 4400, gesture: 'Thumb_Up', sha256: sha(jPhoto) }, keyframes: [] };
    const jj = await verify(jPhoto, jEvidence, '5 jumping jacks');
    assert.equal(jj.status, 200, JSON.stringify(jj.body)); assert.equal(jj.body.pass, true);
    assert.match(asked.at(-1)!.object, /jumping-jack/); assert.match(asked.at(-1)!.gesture, /hand raised/);
    const jr = (await (await fetch(`${base}/keeper/receipts/${jj.body.receiptHash}`)).json() as any).receipt;
    assert.equal(jr.reps.exercise, 'jumpingjack'); assert.equal(jr.reps.repCount, 5); assert.equal(jr.reps.target, 5);
    assert.deepEqual(jr.reps.freeze, { afterRep: 2, gesture: 'hand_up', t: 4400 });
    // Short of the habit's count: refused before any model call.
    const before = asked.length;
    const jShort = await verify(framePortrait(7), { ...jEvidence, freeze: { ...jEvidence.freeze, sha256: sha(framePortrait(7)) } }, '6 jumping jacks');
    assert.equal(jShort.status, 422); assert.match(jShort.body.error, /counted 5 of 6/); assert.equal(asked.length, before);
  } finally {
    server.closeAllConnections(); await new Promise<void>((r) => server.close(() => r()));
    restore.forEach((fn) => fn()); keeper.judge = originalJudge; Object.assign(config, old);
  }
});
