import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { config } from '../src/config.js';
import { canonicalJson, receiptHash, type Receipt } from '../src/v4/keeper.js';
import { publicReceiptUrl, publishReceipt } from '../src/v4/receiptStore.js';

const receipt = { v: 1, kind: 'oath', wallet: 'W', target: 'O', dayIndex: 0, habit: 0, photoSha256: 'p', expected: { object: 'mug', gesture: 'thumbs up' },
  challenge: { gesture: 'thumbs up', slot: 1, blockhash: 'b', issuedAt: null }, model: 'm', verdict: {} as Receipt['verdict'], pass: true, checkedAt: 't' } as Receipt;

test('publishReceipt uploads the canonical bytes, so the public file hashes to the receipt hash', async () => {
  const old = { ...config };
  Object.assign(config, { supabaseUrl: 'https://x.supabase.co', supabaseSecretKey: 'sk', receiptsBucket: 'keeper-receipts' });
  try {
    const hash = receiptHash(receipt);
    let seen: { url: string; body: string; headers: Record<string, string> } | null = null;
    const fake = (async (url: string, init: RequestInit) => { seen = { url, body: String(init.body), headers: init.headers as Record<string, string> }; return new Response('{}', { status: 200 }); }) as unknown as typeof fetch;
    const url = await publishReceipt(hash, receipt, fake);
    assert.equal(url, `https://x.supabase.co/storage/v1/object/public/keeper-receipts/receipts/${hash}.json`);
    assert.equal(seen!.url, `https://x.supabase.co/storage/v1/object/keeper-receipts/receipts/${hash}.json`);
    assert.equal(seen!.body, canonicalJson(receipt));
    assert.equal(createHash('sha256').update(seen!.body).digest('hex'), hash);
    assert.equal(seen!.headers['x-upsert'], 'true');
  } finally { Object.assign(config, old); }
});

test('publishReceipt is a no-op without Supabase config, and null on an upload failure', async () => {
  const old = { ...config };
  try {
    Object.assign(config, { supabaseUrl: '', supabaseSecretKey: '' });
    assert.equal(await publishReceipt('h', receipt, (() => { throw new Error('no call'); }) as unknown as typeof fetch), null);
    assert.equal(publicReceiptUrl('h'), null);
    Object.assign(config, { supabaseUrl: 'https://x.supabase.co', supabaseSecretKey: 'sk' });
    assert.equal(await publishReceipt('h', receipt, (async () => new Response('no', { status: 403 })) as unknown as typeof fetch), null);
    assert.equal(await publishReceipt('h', receipt, (async () => { throw new Error('offline'); }) as unknown as typeof fetch), null);
  } finally { Object.assign(config, old); }
});

test('broadcastOathChanged pings channel oath:<address> with the secret key, best effort', async () => {
  const { broadcastOathChanged } = await import('../src/v4/realtime.js');
  const old = { ...config };
  try {
    Object.assign(config, { supabaseUrl: 'https://x.supabase.co', supabaseSecretKey: 'sk' });
    let seen: { url: string; body: string } | null = null;
    const ok = await broadcastOathChanged('OATH1', 'checkin', 'W1', (async (url: string, init: RequestInit) => { seen = { url, body: String(init.body) }; return new Response('', { status: 202 }); }) as unknown as typeof fetch);
    assert.equal(ok, true);
    assert.equal(seen!.url, 'https://x.supabase.co/realtime/v1/api/broadcast');
    assert.deepEqual(JSON.parse(seen!.body), { messages: [{ topic: 'oath:OATH1', event: 'oath_changed', payload: { reason: 'checkin', wallet: 'W1' }, private: false }] });
    assert.equal(await broadcastOathChanged('O', 'proof', 'W', (async () => { throw new Error('offline'); }) as unknown as typeof fetch), false);
    Object.assign(config, { supabaseUrl: '' });
    assert.equal(await broadcastOathChanged('O', 'proof', 'W'), false);
  } finally { Object.assign(config, old); }
});

test('storeRepTrace keeps the pose trace in the private bucket, without the wallet', async () => {
  const { storeRepTrace } = await import('../src/v4/receiptStore.js');
  const old = { ...config };
  try {
    Object.assign(config, { supabaseUrl: 'https://x.supabase.co', supabaseSecretKey: 'sk', repTracesBucket: 'rep-traces' });
    let seen: { url: string; body: string; headers: Record<string, string> } | null = null;
    const ok = await storeRepTrace('h1', { trace: { t: [1], p: [] }, exercise: 'pushup', target: 10, repCount: 10, phoneCount: 10, pass: true, reason: 'ok' },
      (async (url: string, init: RequestInit) => { seen = { url, body: String(init.body), headers: init.headers as Record<string, string> }; return new Response('{}', { status: 200 }); }) as unknown as typeof fetch);
    assert.equal(ok, true);
    assert.equal(seen!.url, 'https://x.supabase.co/storage/v1/object/rep-traces/traces/h1.json');
    assert.equal(seen!.headers['cache-control'], undefined, 'not a public, cacheable object');
    const body = JSON.parse(seen!.body);
    assert.deepEqual(Object.keys(body).sort(), ['exercise', 'pass', 'phoneCount', 'reason', 'repCount', 'storedAt', 'target', 'trace']);
    Object.assign(config, { supabaseUrl: '' });
    assert.equal(await storeRepTrace('h', { trace: null, exercise: 'squat', target: 1, repCount: 0, phoneCount: null, pass: false, reason: '' }), false);
  } finally { Object.assign(config, old); }
});
