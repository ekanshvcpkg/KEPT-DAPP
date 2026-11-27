import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { checkRepEvidence, freezeAfterRep, jpegSize, repFreezeObject } from '../src/v4/repProof.js';

// The golden vector "freeze-resume": 8 push-ups with a 3.5 s freeze pause [7050, 10500] after rep 4.
const vectors = JSON.parse(readFileSync(new URL('../../packages/engine/test-vectors/reps-vectors.json', import.meta.url), 'utf8'));
const fr = vectors.vectors.find((v: { name: string }) => v.name === 'freeze-resume');
const trace = fr.trace;

/** A JPEG header (SOI + SOF0) of the given size: all checkRepEvidence reads from the photo is its size and hash. */
function jpeg(w: number, h: number): Buffer {
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0, 0]), sof, Buffer.alloc(64)]);
}
const photo = jpeg(640, 480);
const sha = createHash('sha256').update(photo).digest('hex');
// The server picks the freeze rep from the challenge; this blockhash makes it rep 4, where the vector's freeze is.
const issued = new Date(1_000_000);
const blockhash = Array.from({ length: 200 }, (_, i) => `bh${i}`).find((bh) => freezeAfterRep({ blockhash: bh, issuedAt: issued }, 8) === 4)!;
const challenge = { gesture: 'Thumb_Up', issuedAt: issued, blockhash };
const now = 1_000_000 + 20_000;
const evidence = (over: Record<string, unknown> = {}) => ({
  trace, reps: 8, phoneCount: 8, freeze: { afterRep: 4, promptT: 6850, t: 8550, gesture: 'thumbs_up', sha256: sha }, keyframes: [], ...over,
});
const habit = { exercise: 'pushup' as const, target: 8 };

test('jpegSize reads the SOF dimensions', () => {
  assert.deepEqual(jpegSize(jpeg(640, 480)), { w: 640, h: 480 });
  assert.equal(jpegSize(Buffer.from('not a jpeg')), null);
});

test('an honest set passes, and the receipt records the server recount', () => {
  const r = checkRepEvidence(evidence(), habit, challenge, photo, now);
  assert.ok('receipt' in r, JSON.stringify(r));
  assert.equal(r.receipt.repCount, 8);
  assert.equal(r.receipt.target, 8);
  assert.deepEqual(r.receipt.freeze, { afterRep: 4, gesture: 'hand_up', t: 8550 });
  assert.equal(r.receipt.durationMs, 16950);
  assert.match(r.receipt.traceSha256, /^[0-9a-f]{64}$/);
});

test('the server count, not the phone count, decides', () => {
  const r = checkRepEvidence(evidence({ phoneCount: 20 }), { exercise: 'pushup', target: 10 }, challenge, photo, now);
  assert.deepEqual(r, { error: 'The Keeper counted 8 of 10' });
});

const rejects = (name: string, ev: unknown, msg: RegExp, opts: { photo?: Buffer; now?: number; habit?: typeof habit } = {}) =>
  test(`rejects: ${name}`, () => {
    const r = checkRepEvidence(ev, opts.habit ?? habit, challenge, opts.photo ?? photo, opts.now ?? now);
    assert.ok('error' in r, `expected an error, got ${JSON.stringify(r).slice(0, 200)}`);
    assert.match(r.error, msg);
  });

rejects('no trace', { ...evidence(), trace: undefined }, /missing or malformed/);
rejects('another exercise', evidence(), /different exercise/, { habit: { exercise: 'squat', target: 8 } as never });
rejects('a set longer than its challenge allows', evidence(), /longer than its challenge/, { now: 1_000_000 + 5_000 });
rejects('a gap in the samples', evidence({ trace: { ...trace, t: trace.t.map((x: number, i: number) => (i > 100 ? x + 3000 : x)) } }), /gap/);
rejects('a sample rate far off live capture', evidence({ trace: { ...trace, t: trace.t.map((x: number) => x * 4) } }), /longer than|sample rate|gap/, { now: 1_000_000 + 80_000 });
rejects('a photo whose shape is not the trace frame', evidence(), /frame shape/, { photo: jpeg(480, 640) });
rejects('a freeze photo that is not the uploaded photo', evidence({ freeze: { afterRep: 4, t: 8550, gesture: 'thumbs_up', sha256: 'f'.repeat(64) } }), /isn't the freeze frame/);
rejects('a freeze outside its pause', evidence({ freeze: { afterRep: 4, t: 12_000, gesture: 'thumbs_up', sha256: sha } }), /during the freeze/);
rejects('a freeze not between the reps it names', evidence({ freeze: { afterRep: 6, t: 8550, gesture: 'thumbs_up', sha256: sha } }), /between two reps/);
rejects('a freeze at a rep the server did not pick', evidence(), /wrong rep/, { habit: { exercise: 'pushup', target: 7 } });

test('the app label for the gesture is not compared (the vision model checks the photo for the challenge gesture)', () => {
  const r = checkRepEvidence(evidence({ freeze: { afterRep: 4, t: 8550, gesture: 'anything', sha256: sha } }), habit, challenge, photo, now);
  assert.ok('receipt' in r); assert.equal(r.receipt.freeze!.gesture, 'hand_up');
});

test('freezeAfterRep stays between 30% and 70% of the set and varies with the challenge', () => {
  for (const target of [2, 3, 10, 20, 50]) {
    const picks = new Set(Array.from({ length: 64 }, (_, i) => freezeAfterRep({ blockhash: `b${i}`, issuedAt: issued }, target)));
    for (const k of picks) { assert.ok(k >= 1 && k <= Math.max(1, target - 1), `${target}: ${k}`); assert.ok(k >= Math.ceil(target * 0.3) && k <= Math.max(Math.ceil(target * 0.3), Math.floor(target * 0.7))); }
    if (target >= 10) assert.ok(picks.size > 1);
  }
  assert.equal(freezeAfterRep({ blockhash: 'x', issuedAt: issued }, 1), 0);
});
rejects('no freeze', evidence({ trace: { ...trace, pauses: [] }, freeze: null }), /no freeze/);
rejects('a pause in a one-rep set', evidence(), /unexpected pause/, { habit: { exercise: 'pushup', target: 1 } });

test('every activity has its own freeze description for the vision model (the plank holds a plank)', () => {
  const all = ['pushup', 'squat', 'jumpingjack', 'lunge', 'situp', 'highknee', 'burpee', 'press', 'plank'] as const;
  const texts = all.map((ex) => repFreezeObject(ex));
  assert.equal(new Set(texts).size, all.length);
  for (const t of texts) assert.match(t, /^a person .*\(one hand may be raised\)$/);
  assert.equal(repFreezeObject('plank'), 'a person holding a plank on the floor (one hand may be raised)');
  assert.match(repFreezeObject('jumpingjack'), /jumping-jack/);
  assert.match(repFreezeObject('pushup'), /push-up/);
});

test('a short plank says how many seconds the Keeper counted', () => {
  const r = checkRepEvidence(evidence({ trace: { ...trace, exercise: 'plank' } }), { exercise: 'plank', target: 179 }, challenge, photo, now);
  assert.ok('error' in r);
  assert.match(r.error, /^The Keeper counted \d+ of 179 seconds$/);
});

test('a plank goes through the same checks in seconds: the golden vector "plank-freeze" (8 s, freeze after second 5)', () => {
  const pf = vectors.vectors.find((v: { name: string }) => v.name === 'plank-freeze');
  const bh = Array.from({ length: 400 }, (_, i) => `pl${i}`).find((b) => freezeAfterRep({ blockhash: b, issuedAt: issued }, 8) === 5)!;
  const [a, b] = pf.trace.pauses[0] as [number, number];
  const ev = { trace: pf.trace, phoneCount: 8, freeze: { afterRep: 5, t: a + 1500, gesture: 'hand_up', sha256: sha }, keyframes: [] };
  const r = checkRepEvidence(ev, { exercise: 'plank', target: 8 }, { ...challenge, blockhash: bh }, photo, now);
  assert.ok('receipt' in r, JSON.stringify(r));
  assert.equal(r.receipt.exercise, 'plank'); assert.equal(r.receipt.repCount, 8);
  assert.deepEqual(r.receipt.freeze, { afterRep: 5, gesture: 'hand_up', t: a + 1500 });
  assert.ok(b - a >= 1500);
  // Held a second short of a 9-second target: refused, in seconds.
  const short = checkRepEvidence(ev, { exercise: 'plank', target: 9 }, { ...challenge, blockhash: bh }, photo, now);
  assert.deepEqual(short, { error: 'The Keeper counted 8 of 9 seconds' });
  // The plank's sag cheat counts nothing.
  const sag = vectors.vectors.find((v: { name: string }) => v.name === 'cheat-plank-sag');
  assert.match((checkRepEvidence({ ...ev, trace: sag.trace }, { exercise: 'plank', target: 8 }, { ...challenge, blockhash: bh }, photo, now) as { error: string }).error, /counted 0 of 8 seconds|no freeze/);
});

test('a frozen trace (one pose repeated, as a replayed still) is refused; real jitter passes', async () => {
  const { longestFrozenRun, MAX_FROZEN_SAMPLES } = await import('../src/v4/repProof.js');
  const n = trace.t.length;
  assert.ok(longestFrozenRun(trace.p, n) <= MAX_FROZEN_SAMPLES, 'the honest golden vector moves');
  const still = trace.p.slice(36 * 40, 36 * 41);
  const frozen = { ...trace, p: Array.from({ length: n }, () => still).flat() };
  assert.ok(longestFrozenRun(frozen.p, n) > MAX_FROZEN_SAMPLES);
  const r = checkRepEvidence(evidence({ trace: frozen }), habit, challenge, photo, now);
  assert.ok('error' in r); assert.match((r as { error: string }).error, /frozen/);
  assert.equal(longestFrozenRun(Array(36 * 30).fill(0), 30), 0, 'empty samples (no pose) are not a frozen run');
});
