import test from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config.js';
import { askAgent } from '../src/v4/ask.js';
import { currentDay, hpOf, oathDetails, runTool, summarizeOath, type AgentDeps, type AgentOath } from '../src/v4/keeperAgent.js';

const ME = 'EnD2dXFruNSTBTrZsmVT2wtDuewATAvo2hfoNqwun6hg';
const FRIEND = '3uABCRqpotixFrePkRWvWpYYW1tYR3kregNcJf9qR8Et';
const T0 = 1_800_000_000;
// A group Oath, 3 days of 24 h, now in day 2: day 1 I kept and my friend missed; today I proved habit 1, my friend nothing.
const group: AgentOath = {
  address: 'Oath1111111111111111111111111111111111111111', name: 'Excercise',
  chain: { status: 1, isSolo: false, startTs: T0, daySeconds: 86_400, numDays: 3, members: [ME, FRIEND], daysKept: { [ME]: 0b1, [FRIEND]: 0 }, stakeAmount: '70000000', payouts: {}, claimed: {} },
  details: { goalText: 'Pushups · Squats', habits: ['Pushups', 'Squats'], habitObjects: ['10 push-ups', '10 squats'] },
  proofs: [{ wallet: ME, dayIndex: 0, habit: 0 }, { wallet: ME, dayIndex: 0, habit: 1 }, { wallet: ME, dayIndex: 1, habit: 0 }],
};
const NOW = T0 + 86_400 + 3 * 3600; // day 2, 21 h left

test('facts: current day, HP after a missed day, habits with rep targets, today per member, money', () => {
  assert.equal(currentDay(group.chain, NOW), 1);
  assert.deepEqual(hpOf(group.chain, NOW), { hp: 90, broken: false, closedDays: 1 }); // 100 - 20 + 10
  const s = summarizeOath(group, ME, NOW);
  assert.equal(s.name, 'Excercise'); assert.equal(s.day, 'day 2 of 3'); assert.equal(s.timeLeftToday, '21h 0m');
  assert.equal(s.myToday, '1 of 2 habits proven today'); assert.equal(s.friends, 1); assert.equal(s.friendsKeptToday, 0);
  assert.deepEqual(s.habits, ['Pushups: a live set of 10 push-ups', 'Squats: a live set of 10 squats']);
  const d = oathDetails(group, ME, NOW);
  assert.equal(d.habits[0]!.repTarget, 10); assert.equal(d.habits[1]!.exercise, 'squat');
  const me = d.members.find((m) => m.who === 'you')!, friend = d.members.find((m) => m.who !== 'you')!;
  assert.equal(me.daysKept, 1); assert.equal(me.daysMissed, 0); assert.match(me.today!, /proved habit 1 of 2/);
  assert.equal(friend.who, 'friend with wallet 3uAB…R8Et'); assert.equal(friend.daysMissed, 1); assert.equal(friend.today, 'nothing proven yet today');
  assert.deepEqual(d.money, { stakePerMemberSol: 0.07, potSol: 0.14, costOfAMissSol: 0.01, myMissesSoFar: 0, whereMissesGo: d.money.whereMissesGo });
});

test('HP breaks at 0 and solo misses cost 35', () => {
  const solo = { ...group.chain, isSolo: true, members: [ME], daysKept: { [ME]: 0 }, numDays: 7 };
  assert.deepEqual(hpOf(solo, T0 + 2 * 86_400 + 10), { hp: 50, broken: false, closedDays: 2 }); // 100-35+10=75, 75-35+10=50
  assert.equal(hpOf(solo, T0 + 7 * 86_400 + 10).broken, true);
});

test('tools: details by id or prefix, receipts are 1-based, unknown ids and tools answer with an error', async () => {
  const deps: AgentDeps = { wallet: ME, now: () => NOW, oaths: async () => [group], balanceSol: async () => 0.56,
    receipts: async () => [{ day: 1, habit: 0, pass: true, reason: 'ok', when: 'x', reps: { exercise: 'pushup', counted: 10, target: 10 } }] };
  assert.equal(((await runTool('get_oath_details', { oath_id: 'Oath1111' }, deps, [group])) as { name: string }).name, 'Excercise');
  assert.deepEqual(await runTool('get_oath_details', { oath_id: 'nope' }, deps, [group]), { error: "No Oath with that id among the user's Oaths" });
  assert.deepEqual(await runTool('get_my_receipts', { oath_id: group.address }, deps, [group]), [{ day: 2, habit: 1, pass: true, reason: 'ok', when: 'x', reps: { exercise: 'pushup', counted: 10, target: 10 } }]);
  assert.deepEqual(await runTool('get_wallet_balance', {}, deps, [group]), { sol: 0.56 });
  assert.match(((await runTool('get_rules', { topic: 'rep_sets' }, deps, [group])) as { text: string }).text, /raise one hand/);
  assert.deepEqual(await runTool('rm_rf', {}, deps, [group]), { error: 'Unknown tool rm_rf' });
});

test('askAgent: the model calls a tool, gets the facts, answers in speakable text; a failed loop falls back', async () => {
  const old = { ...config };
  Object.assign(config, { openApiKey: 'k', askModel: 'anthropic/claude-haiku-5.5', visionApiUrl: 'https://llm.test/chat' });
  try {
    const deps: AgentDeps = { wallet: ME, now: () => NOW, oaths: async () => [group], balanceSol: async () => 0.56, receipts: async () => [] };
    const bodies: any[] = [];
    let round = 0;
    const fake = (async (_u: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)); bodies.push(body);
      const reply = round++ === 0
        ? { choices: [{ message: { content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'get_oath_details', arguments: JSON.stringify({ oath_id: group.address }) } }] } }] }
        : { choices: [{ message: { content: '**Ten** push-ups done, ten squats to go. Your friend ending in R8Et has proven nothing today.' } }] };
      return new Response(JSON.stringify(reply), { status: 200 });
    }) as unknown as typeof fetch;
    const answer = await askAgent('what do I still have to do today and how is my friend doing?', deps, fake);
    assert.equal(answer, 'Ten push-ups done, ten squats to go. Your friend ending in R8Et has proven nothing today.');
    assert.equal(bodies[0].model, 'anthropic/claude-haiku-5.5');
    assert.ok(bodies[0].tools.some((t: any) => t.function.name === 'get_oath_details'));
    assert.match(bodies[0].messages[1].content, /Excercise/);
    const toolMsg = bodies[1].messages.find((m: any) => m.role === 'tool');
    assert.equal(toolMsg.tool_call_id, 'c1'); assert.match(toolMsg.content, /live set of 10 squats/); assert.match(toolMsg.content, /3uAB…R8Et/);

    // The tool loop fails (HTTP 500): the one-shot answer from the summary is used instead.
    let n = 0;
    const flaky = (async () => (n++ === 0 ? new Response('no', { status: 500 }) : new Response(JSON.stringify({ choices: [{ message: { content: 'Day 2 of 3, HP 90.' } }] }), { status: 200 }))) as unknown as typeof fetch;
    assert.equal(await askAgent('how am I doing?', deps, flaky), 'Day 2 of 3, HP 90.');
  } finally { Object.assign(config, old); }
});
