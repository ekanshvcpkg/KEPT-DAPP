import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { checkRepEvidence, jpegSize } from '../src/v4/repProof.js';

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
const challenge = { gesture: 'thumbs_up', issuedAt: new Date(1_000_000) };
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
  assert.deepEqual(r.receipt.freeze, { afterRep: 4, gesture: 'thumbs_up', t: 8550 });
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
rejects('another gesture', evidence({ freeze: { afterRep: 4, t: 8550, gesture: 'peace', sha256: sha } }), /gesture/);
rejects('no freeze', evidence({ trace: { ...trace, pauses: [] }, freeze: null }), /no freeze/);
rejects('a pause in a one-rep set', evidence(), /unexpected pause/, { habit: { exercise: 'pushup', target: 1 } });
