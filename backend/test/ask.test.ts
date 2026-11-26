import test from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config.js';
import { answerQuestion, takeAskQuota, transcribe, MAX_ANSWER_CHARS, type AskContext } from '../src/v4/ask.js';
import { VoiceUnavailableError } from '../src/v4/voice.js';

const ctx: AskContext = { wallet: 'W', solBalance: 0.28, oaths: [{ name: 'Training', status: 'settled', solo: false, members: 2, day: '3 days', myKeptDays: 2, myMissedDays: 1, stakeSol: 0.07, payoutSol: 0.0704, claimed: true }], recentVerdicts: [{ when: '2026-11-26T05:20:50Z', pass: true, reason: 'bottle and thumbs up' }] };

test('transcribe sends the recording to ElevenLabs Speech to Text (scribe) as multipart', async () => {
  const old = { ...config };
  Object.assign(config, { elevenLabsApiKey: 'k', elevenSttModel: 'scribe_v3' });
  let sent: any;
  const f = (async (url: string, init: any) => { sent = { url, init }; return new Response(JSON.stringify({ text: ' How is my Oath going? ' }), { status: 200 }); }) as unknown as typeof fetch;
  try {
    assert.equal(await transcribe(Buffer.alloc(800, 1), 'audio/mp4', f), 'How is my Oath going?');
    assert.equal(sent.url, 'https://api.elevenlabs.io/v1/speech-to-text');
    assert.equal(sent.init.headers['xi-api-key'], 'k');
    const form = sent.init.body as FormData;
    assert.equal(form.get('model_id'), 'scribe_v3');
    assert.ok(form.get('file') instanceof Blob);
    await assert.rejects(transcribe(Buffer.alloc(800), 'audio/mp4', (async () => new Response('no', { status: 401 })) as unknown as typeof fetch), VoiceUnavailableError);
  } finally { Object.assign(config, old); }
});

test('answerQuestion grounds the model in the context, strips markdown and caps the length', async () => {
  const old = { ...config };
  Object.assign(config, { openApiKey: 'k', visionApiUrl: 'https://llm.test/v1/chat/completions', askModel: 'm' });
  let body: any;
  const reply = (content: string) => (async (_u: string, init: any) => { body = JSON.parse(init.body); return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 }); }) as unknown as typeof fetch;
  try {
    assert.equal(await answerQuestion('Did I get paid?', ctx, reply('**Indeed.** You were *paid* 0.0704 SOL.')), 'Indeed. You were paid 0.0704 SOL.');
    assert.equal(body.model, 'm');
    assert.match(body.messages[0].content, /Use ONLY the facts/);
    assert.match(body.messages[0].content, /cannot sign, send, stake, claim or move anything/);
    assert.match(body.messages[1].content, /"name":"Training"/);
    const long = await answerQuestion('q', ctx, reply('word '.repeat(200)));
    assert.ok(long.length <= MAX_ANSWER_CHARS && long.endsWith('…'));
    await assert.rejects(answerQuestion('q', ctx, reply('   ')), VoiceUnavailableError);
  } finally { Object.assign(config, old); }
});

test('takeAskQuota caps questions per wallet per day', () => {
  assert.equal(takeAskQuota('qa', 2), true); assert.equal(takeAskQuota('qa', 2), true); assert.equal(takeAskQuota('qa', 2), false);
});
