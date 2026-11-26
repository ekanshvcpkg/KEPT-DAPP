import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { config } from '../src/config.js';
import { keeperSpeech, takeVoiceQuota, VoiceUnavailableError } from '../src/v4/voice.js';

test('keeperSpeech calls ElevenLabs once per line, then serves the cached MP3', async () => {
  const old = { ...config };
  const dir = await mkdtemp(join(tmpdir(), 'kept-voice-'));
  Object.assign(config, { elevenLabsApiKey: 'k', keeperVoiceId: 'voice1', elevenTtsModel: 'eleven_flash_v2_5', proofStorageDir: dir });
  const calls: any[] = [];
  const f = (async (url: string, init: any) => { calls.push({ url, init }); return new Response(Buffer.from('ID3-mp3'), { status: 200 }); }) as unknown as typeof fetch;
  try {
    const a = await keeperSpeech('Kept. Barely.', f);
    assert.equal(a.cached, false); assert.equal(a.audio.toString(), 'ID3-mp3');
    assert.match(calls[0].url, /\/v1\/text-to-speech\/voice1\?output_format=mp3_44100_64$/);
    assert.equal(calls[0].init.headers['xi-api-key'], 'k');
    assert.deepEqual(JSON.parse(calls[0].init.body).model_id, 'eleven_flash_v2_5');
    const b = await keeperSpeech('Kept. Barely.', f);
    assert.equal(b.cached, true); assert.equal(calls.length, 1);
    Object.assign(config, { keeperVoiceId: '' });
    await assert.rejects(keeperSpeech('x', f), VoiceUnavailableError);
    Object.assign(config, { keeperVoiceId: 'voice1' });
    await assert.rejects(keeperSpeech('new line', (async () => new Response('no', { status: 401 })) as unknown as typeof fetch), VoiceUnavailableError);
  } finally { Object.assign(config, old); await rm(dir, { recursive: true, force: true }); }
});

test('takeVoiceQuota caps lines per wallet per day', () => {
  for (let i = 0; i < 3; i++) assert.equal(takeVoiceQuota('w-quota', 3), true);
  assert.equal(takeVoiceQuota('w-quota', 3), false);
  assert.equal(takeVoiceQuota('w-other', 3), true);
});
