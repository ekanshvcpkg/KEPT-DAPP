import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { issueSession } from '../src/auth.js';
import { prisma } from '../src/db.js';
import { connection, programId } from '../src/solana.js';
import { canonicalJson, decodePhoto, keeper, receiptHash, slotChallenge, type Judge } from '../src/v4/keeper.js';
import { CheckUnavailableError } from '../src/v4/verdict.js';

const jpeg = (fill: number) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(4000, fill)]);
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

test('canonicalJson sorts keys at every level and drops undefined', () => {
  assert.equal(canonicalJson({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: null }, u: undefined }), '{"a":{"c":null,"d":[1,{"y":2,"z":1}]},"b":1}');
});

test('decodePhoto accepts JPEG/PNG camera-sized images only', () => {
  assert.ok('bytes' in decodePhoto(jpeg(1).toString('base64')));
  assert.ok('bytes' in decodePhoto('data:image/jpeg;base64,' + jpeg(1).toString('base64')));
  assert.ok('error' in decodePhoto(undefined));
  assert.ok('error' in decodePhoto(Buffer.alloc(4000, 7).toString('base64')), 'not an image');
  assert.ok('error' in decodePhoto(Buffer.from([0xff, 0xd8, 0xff, 1]).toString('base64')), 'too small');
});

test('slotChallenge derives the gesture from the blockhash, and falls back without RPC', async (t) => {
  const options = ['Thumb_Up', 'Victory', 'Open_Palm'];
  const mock = t.mock.method(connection, 'getLatestBlockhashAndContext', async () => ({ context: { slot: 4242 }, value: { blockhash: 'GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi', lastValidBlockHeight: 1 } }) as any);
  const c = await slotChallenge(options, () => 'Victory');
  const byte = createHash('sha256').update('GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi').digest()[0]!;
  assert.deepEqual(c, { gesture: options[byte % 3], slot: 4242, blockhash: 'GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi' });
  mock.mock.mockImplementation(async () => { throw new Error('rpc down'); });
  assert.deepEqual(await slotChallenge(options, () => 'Victory'), { gesture: 'Victory', slot: null, blockhash: null });
});

test('POST /proof/verify: the Keeper judges the uploaded photo; the client verdict is ignored', async (t) => {
  const wallet = '11111111111111111111111111111111';
  const oath = programId.toBase58();
  const old = { ...config };
  const other = '11111111111111111111111111111112';
  Object.assign(config, { sessionSecret: 'keeper-test', sgtMock: true, sgtMockAllowlist: [wallet, other], devnetRpcUrl: 'https://api.devnet.solana.com', verifierSecretKey: '' });
  const originalJudge = keeper.judge;
  let judge: Judge = async () => ({ verdict: { objectPresent: true, objectConfidence: 0.9, gestureSeen: 'thumbs up', gestureMatches: true, looksLikeScreenOrPrintout: false, reason: 'ok' }, model: 'test-model' });
  keeper.judge = (p, e) => judge(p, e);

  // An in-memory ProofVerification table.
  const rows = new Map<string, any>();
  let nextId = 1;
  const restore: Array<() => void> = [];
  const stub = (obj: any, key: string, fn: any) => { const original = obj[key]; obj[key] = fn; restore.push(() => { obj[key] = original; }); };
  stub(prisma.sessionSeat, 'upsert', async () => ({}));
  stub(prisma.proofSession, 'findUnique', async () => null);
  const issuedAt = new Date(Date.now() - 5_000);
  let challengeRow: any = { gesture: 'Thumb_Up', issuedAt, slot: 777, blockhash: 'bh' };
  stub(prisma.gestureChallenge, 'findFirst', async () => challengeRow);
  stub(prisma.oathDetails, 'findUnique', async () => null);
  stub(prisma.proofVerification, 'create', async ({ data }: any) => { const r = { id: String(nextId++), status: 'PENDING', usedAt: null, oath: null, dayIndex: null, habit: null, createdAt: new Date(), ...data }; rows.set(r.id, r); return r; });
  stub(prisma.proofVerification, 'count', async ({ where }: any) => [...rows.values()].filter((r) => r.wallet === where.wallet && (!where.status || r.status === where.status)).length);
  stub(prisma.proofVerification, 'update', async ({ where, data }: any) => { const r = { ...rows.get(where.id), ...data }; rows.set(where.id, r); return r; });
  stub(prisma.proofVerification, 'delete', async ({ where }: any) => { const r = rows.get(where.id); rows.delete(where.id); return r; });
  stub(prisma.proofVerification, 'findFirst', async ({ where }: any) => [...rows.values()].find((r) => Object.entries(where).every(([k, v]) => r[k] === v)) ?? null);
  stub(prisma.proofVerification, 'findUnique', async ({ where }: any) => [...rows.values()].find((r) => (where.receiptHash ? r.receiptHash === where.receiptHash : r.id === where.id)) ?? null);

  const server = createApp().listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const verify = async (body: object, as = wallet) => {
    const r = await fetch(base + '/proof/verify', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${issueSession(as)}` }, body: JSON.stringify({ oath, dayIndex: 0, habit: 0, expectedObject: 'water bottle', expectedGesture: 'thumbs up', ...body }) });
    return { status: r.status, body: await r.json() as any };
  };
  try {
    // The audit's forgery: a made-up passing verdict and a random hash, no photo. It must get nothing.
    const forged = await verify({ proofHash: 'a'.repeat(64), objectPresent: true, objectConfidence: 1, gestureSeen: 'thumbs up', gestureMatches: true, looksLikeScreenOrPrintout: false, reason: 'trust me' });
    assert.equal(forged.status, 400); assert.equal(forged.body.photoRequired, true); assert.equal(forged.body.verificationId, undefined); assert.equal(rows.size, 0);

    // A real photo the Keeper rejects: the client's "pass" fields change nothing.
    judge = async () => ({ verdict: { objectPresent: false, objectConfidence: 0.1, gestureSeen: 'none', gestureMatches: false, looksLikeScreenOrPrintout: true, reason: 'a photo of a screen' }, model: 'test-model' });
    const rejected = await verify({ photo: jpeg(2).toString('base64'), objectPresent: true, objectConfidence: 1, gestureMatches: true, looksLikeScreenOrPrintout: false });
    assert.equal(rejected.status, 200); assert.equal(rejected.body.pass, false); assert.equal(rejected.body.verificationId, null);
    assert.equal(rejected.body.looksLikeScreenOrPrintout, true);

    // A passing photo: the receipt is public and its SHA-256 is the hash that would go on chain.
    judge = async () => ({ verdict: { objectPresent: true, objectConfidence: 0.92, gestureSeen: 'thumbs up', gestureMatches: true, looksLikeScreenOrPrintout: false, reason: 'bottle and thumb visible' }, model: 'test-model' });
    const photo = jpeg(3);
    const ok = await verify({ photo: photo.toString('base64') });
    assert.equal(ok.status, 200); assert.equal(ok.body.pass, true); assert.ok(ok.body.verificationId);
    assert.equal(ok.body.proofHash, sha(photo), 'proofHash is the server-computed photo hash');
    assert.equal(ok.body.slot, 777);
    const fetched = await (await fetch(`${base}/keeper/receipts/${ok.body.receiptHash}`)).json() as any;
    assert.equal(sha(canonicalJson(fetched.receipt)), ok.body.receiptHash, 'anyone can re-hash the receipt and get the on-chain hash');
    assert.equal(receiptHash(fetched.receipt), ok.body.receiptHash);
    assert.equal(fetched.receipt.photoSha256, sha(photo));
    assert.deepEqual(fetched.receipt.challenge, { gesture: 'Thumb_Up', slot: 777, blockhash: 'bh', issuedAt: issuedAt.toISOString() });
    assert.equal(fetched.receipt.wallet, wallet); assert.equal(fetched.receipt.target, oath); assert.equal(fetched.receipt.pass, true);

    // Retrying the very same check (recording failed, the verification is unused) returns it without a new model call.
    let calls = 0; const counting = judge; judge = async (p, e) => { calls++; return counting(p, e); };
    const again = await verify({ photo: photo.toString('base64') });
    assert.equal(again.status, 200); assert.equal(again.body.verificationId, ok.body.verificationId); assert.equal(again.body.retry, true); assert.equal(calls, 0);
    // Once used, or from another wallet, or for another habit, the same photo is refused.
    assert.equal((await verify({ photo: photo.toString('base64') }, other)).status, 409);
    assert.equal((await verify({ photo: photo.toString('base64'), habit: 1 })).status, 409);
    rows.get(ok.body.verificationId).usedAt = new Date();
    assert.equal((await verify({ photo: photo.toString('base64') })).status, 409);

    // The gesture must be the current challenge's, and the challenge must still be usable.
    const wrong = await verify({ photo: jpeg(7).toString('base64'), expectedGesture: 'victory sign (index and middle finger in a V)' });
    assert.equal(wrong.status, 400);
    challengeRow = { ...challengeRow, issuedAt: new Date(Date.now() - 60 * 60_000) };
    const expired = await verify({ photo: jpeg(8).toString('base64') });
    assert.equal(expired.status, 409); assert.equal(expired.body.challengeExpired, true);
    challengeRow = { ...challengeRow, issuedAt };

    // Model down: 503, and the attempt does not count toward the daily limit.
    const before = rows.size;
    judge = async () => { throw new CheckUnavailableError('down'); };
    const down = await verify({ photo: jpeg(4).toString('base64') });
    assert.equal(down.status, 503); assert.equal(down.body.error, 'check_unavailable'); assert.equal(rows.size, before);
    // An answer the model gave but that isn't a verdict was a paid call: it counts toward the daily limit.
    const { UnusableVerdictError } = await import('../src/v4/keeper.js');
    judge = async () => { throw new UnusableVerdictError('gibberish'); };
    const unusable = await verify({ photo: jpeg(6).toString('base64') });
    assert.equal(unusable.status, 503); assert.equal(rows.size, before + 1); assert.equal([...rows.values()].at(-1).status, 'UNAVAILABLE');

    assert.equal((await fetch(`${base}/keeper/receipts/${'0'.repeat(64)}`)).status, 404);
    assert.equal((await fetch(`${base}/keeper/receipts/nothex`)).status, 400);
  } finally {
    server.closeAllConnections(); await new Promise<void>((r) => server.close(() => r()));
    restore.forEach((fn) => fn()); keeper.judge = originalJudge; Object.assign(config, old);
  }
});

test('visionJudge sends the photo to the configured model and parses its JSON verdict', async (t) => {
  const { visionJudge } = await import('../src/v4/keeper.js');
  const old = { ...config };
  Object.assign(config, { openApiKey: 'k', visionModel: 'm', visionApiUrl: 'https://vision.test/v1/chat/completions', visionTimeoutMs: 2000 });
  let sent: any;
  const f = t.mock.method(globalThis, 'fetch', async (url: any, init: any) => {
    sent = { url, body: JSON.parse(init.body), auth: init.headers.authorization };
    return new Response(JSON.stringify({ model: 'm-1', choices: [{ message: { content: '```json\n{"objectPresent":true,"objectConfidence":0.8,"gestureSeen":"V","gestureMatches":true,"looksLikeScreenOrPrintout":false,"reason":"fine"}\n```' } }] }), { status: 200 });
  });
  try {
    const r = await visionJudge({ bytes: jpeg(5), mime: 'image/jpeg' }, { object: 'book', gesture: 'victory sign' });
    assert.equal(r.model, 'm-1'); assert.equal(r.verdict.objectConfidence, 0.8); assert.equal(r.verdict.gestureMatches, true);
    assert.equal(sent.url, 'https://vision.test/v1/chat/completions'); assert.equal(sent.auth, 'Bearer k'); assert.equal(sent.body.model, 'm');
    assert.match(sent.body.messages[0].content[1].image_url.url, /^data:image\/jpeg;base64,/);
    assert.match(sent.body.messages[0].content[0].text, /"book"/);
    f.mock.mockImplementation(async () => new Response('nope', { status: 500 }));
    await assert.rejects(visionJudge({ bytes: jpeg(5), mime: 'image/jpeg' }, { object: 'book', gesture: 'v' }), CheckUnavailableError);
    f.mock.mockImplementation(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'I think it passes' } }] }), { status: 200 }));
    await assert.rejects(visionJudge({ bytes: jpeg(5), mime: 'image/jpeg' }, { object: 'book', gesture: 'v' }), CheckUnavailableError);
    Object.assign(config, { openApiKey: '' });
    await assert.rejects(visionJudge({ bytes: jpeg(5), mime: 'image/jpeg' }, { object: 'book', gesture: 'v' }), CheckUnavailableError);
  } finally { Object.assign(config, old); }
});

test('GET /keeper/oaths/:oath/days/:day lists the receipt hashes and their combined on-chain hash', async () => {
  const wallet = '11111111111111111111111111111111', oath = programId.toBase58();
  const h = ['1'.repeat(64), '2'.repeat(64)];
  const restore: Array<() => void> = [];
  const stub = (obj: any, key: string, fn: any) => { const original = obj[key]; obj[key] = fn; restore.push(() => { obj[key] = original; }); };
  stub(prisma.habitProof, 'findMany', async () => [{ habit: 0, proofHash: h[0] }, { habit: 1, proofHash: h[1] }]);
  stub(prisma.oathProof, 'findUnique', async () => ({ status: 'RECORDED', signature: 'sig123', proofHash: 'x' }));
  const server = createApp().listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  try {
    const r = await (await fetch(`${base}/keeper/oaths/${oath}/days/2?wallet=${wallet}`)).json() as any;
    assert.deepEqual(r.receiptHashes, h);
    assert.equal(r.dayHash, sha(Buffer.concat(h.map((x) => Buffer.from(x, 'hex')))));
    assert.equal(r.signature, 'sig123');
    assert.equal((await fetch(`${base}/keeper/oaths/${oath}/days/2`)).status, 400);
  } finally {
    server.closeAllConnections(); await new Promise<void>((r) => server.close(() => r()));
    restore.forEach((fn) => fn());
  }
});

test('no new photo challenge in the last seconds of a day (120 s demo days and 24 h days)', async () => {
  const { dayClosing } = await import('../src/v4/rules.js');
  // 120 s days: the cutoff is 30 s.
  assert.equal(dayClosing({ startTs: 1000, daySeconds: 120, day: 0, now: 1000 + 89 }), false);
  assert.equal(dayClosing({ startTs: 1000, daySeconds: 120, day: 0, now: 1000 + 91 }), true);
  assert.equal(dayClosing({ startTs: 1000, daySeconds: 120, day: 1, now: 1000 + 125 }), false);
  // 24 h days: only the last 30 s.
  assert.equal(dayClosing({ startTs: 0, daySeconds: 86400, day: 0, now: 86400 - 31 }), false);
  assert.equal(dayClosing({ startTs: 0, daySeconds: 86400, day: 0, now: 86400 - 29 }), true);
});
