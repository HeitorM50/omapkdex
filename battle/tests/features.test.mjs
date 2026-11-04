process.env.OMAPKDEX_BATTLE_OFFLINE = '1';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LanSession } from '../session.mjs';
import { wallet } from '../wallet.mjs';
import { MatchEngine } from '../engine.mjs';
import { cpuTeam, decide } from '../bot.mjs';
import { connectTLS, identity, Frames } from '../wire.mjs';
import { until, sleep, save, teamOf, pick, step, startMatch, playOut } from './helpers.mjs';

const seeded = (a) => () => {
  a |= 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
function pair(t, options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'omapkdex-feat-')),
    aDir = save(root, 'h'),
    bDir = save(root, 'g'),
    a = new LanSession(aDir, { discovery: false, ...options }),
    sessions = [a];
  let b = new LanSession(bDir, { discovery: false, ...options });
  sessions.push(b);
  t.after(async () => {
    for (const s of sessions) await s.shutdown();
    rmSync(root, { recursive: true, force: true });
  });
  return { root, aDir, bDir, a, b, add: (s) => sessions.push(s) };
}

test('the CPU bot finishes full games with only legal choices', () => {
  let forced = 0;
  for (let g = 0; g < 60; g++) {
    const rng = seeded(g + 1),
      e = new MatchEngine([cpuTeam(50 + g * 2, rng), cpuTeam(50 + g * 2, rng)], [g + 1, 2, 3, 4]);
    for (let n = 0; n < 800 && !e.battle.ended; n++) {
      const needs = e.needs(),
        view = e.view();
      if (needs[0] !== needs[1]) forced++;
      // A player must never be left without an action the UI can offer.
      needs.forEach((need, i) => {
        const me = view.players[i];
        if (need && me.request === 'move')
          assert.ok(me.moves.some((m) => !m.disabled && (m.pp === undefined || m.pp > 0)), 'a playable move exists');
        if (need && me.request === 'switch') assert.ok(me.team.some((m) => !m.fainted && !m.active), 'a replacement exists');
      });
      e.apply(needs.map((need, i) => (need ? decide(e, i, rng) : null)));
    }
    assert.equal(e.battle.ended, true, 'game ' + g + ' ended');
    e.destroy();
  }
  assert.ok(forced > 0);
});

test('practice against the CPU is local, plays to the end and survives a restart', async (t) => {
  const { aDir, a } = pair(t, { rng: seeded(7) });
  await a.command('profile', { team: teamOf('h') });
  const wallet = (await a.status()).wallet.available;
  await a.command('practice');
  assert.equal(a.s.practice, true);
  assert.equal((await a.status()).session.phase, 'active');
  assert.equal(a.engine.view().phase, 'teampreview');
  await a.command('team', { order: '123' });
  assert.equal(a.s.turns.length, 1, 'the CPU picked its team in the same round');
  for (let i = 0; i < 2 && !a.engine.battle.ended; i++) await a.command('choose', { choice: pick(a.engine.view(), 0) });
  const mid = a.engine.digest(),
    turns = a.s.turns.length;
  await a.shutdown();
  const b = new LanSession(aDir, { discovery: false, rng: seeded(7) });
  t.after(() => b.shutdown());
  assert.equal(b.s.phase, 'active', 'a practice battle needs no peer to resume');
  assert.equal(b.engine.digest(), mid);
  assert.equal(b.s.turns.length, turns);
  for (let n = 0; n < 300 && !b.engine.battle.ended; n++) {
    const choice = pick(b.engine.view(), 0);
    if (choice) await b.command('choose', { choice });
  }
  const done = await b.command('status');
  assert.equal(done.session.phase, 'finished');
  assert.ok(['win', 'loss', 'draw'].includes(done.session.outcome));
  assert.equal(done.history.length, 0, 'practice is not counted in the battle history');
  assert.equal(done.wallet.available, wallet);
  assert.equal(existsSync(join(aDir, 'battle-matches', b.s.matchId + '.json')), false);
  await b.command('close');
  assert.equal((await b.status()).session.phase, 'closed');
});

test('surrendering a practice battle ends it as a loss', async (t) => {
  const { a } = pair(t, { rng: seeded(3) });
  await a.command('profile', { team: teamOf('h') });
  await a.command('practice');
  await a.command('team', { order: '123' });
  await a.command('forfeit');
  const s = await a.status();
  assert.equal(s.session.phase, 'finished');
  assert.equal(s.session.outcome, 'loss');
});

test('with a turn timer a silent side gets the default choice played for it', async (t) => {
  const { a, b } = pair(t, { clockMs: 40 });
  await a.command('profile', { team: teamOf('h') });
  await b.command('profile', { team: teamOf('g') });
  await startMatch(a, b, { timer: 1 });
  assert.equal(a.s.rules.timer, 1);
  assert.equal(b.s.rules.timer, 1);
  await until(() => a.s.turns.length === 1 && b.s.turns.length === 1, 'default team picks', 400);
  assert.deepEqual(a.s.turns[0].actions, ['team 123', 'team 123']);
  assert.equal(a.engine.digest(), b.engine.digest());
  const status = await a.status();
  assert.ok(status.session.deadline > 0);
  assert.equal(status.session.timer, 1);
});

test('a peer that never chooses can be timed out, and verifies the claim when it returns', async (t) => {
  const { bDir, a, b, add } = pair(t, { claimGraceMs: 100 });
  await a.command('profile', { team: teamOf('h') });
  await b.command('profile', { team: teamOf('g') });
  await startMatch(a, b, { timer: 1 });
  await a.command('team', { order: '123' });
  assert.equal(a.claimable(), false, 'inside the timer there is nothing to claim');
  await assert.rejects(() => a.command('claim'), /still has time/);
  await b.shutdown();
  await until(() => !a.peer, 'peer gone');
  await sleep(1300);
  assert.equal(a.claimable(), true);
  await a.command('claim');
  assert.equal(a.s.outcome, 'win');
  assert.deepEqual(a.s.forfeits, [false, true]);
  const back = new LanSession(bDir, { discovery: false });
  add(back);
  await back.command('resume', {});
  await until(() => a.s.phase === 'finished' && back.s.phase === 'finished', 'timeout settled ' + JSON.stringify([a.s.phase, back.s.phase, a.error, back.error]));
  assert.equal(back.s.outcome, 'loss');
  assert.equal(a.engine.digest(), back.engine.digest());
});

test('a claim is refused while the claimed side can still choose', async (t) => {
  const { a, b } = pair(t, { claimGraceMs: 100, clockMs: 100000 });
  await a.command('profile', { team: teamOf('h') });
  await b.command('profile', { team: teamOf('g') });
  await startMatch(a, b, { timer: 30 });
  // A forged early claim from a modified peer must not end the battle.
  a.send('timeout', { round: 0 });
  await until(() => b.error, 'claim rejected');
  assert.match(b.error, /too early|Invalid timeout/);
  assert.equal(b.engine.view().finished, false);
});

test('a restart during a forced switch resumes the same battle', async (t) => {
  const { bDir, a, b, add } = pair(t);
  await a.command('profile', { team: teamOf('h') });
  await b.command('profile', { team: teamOf('g') });
  await startMatch(a, b);
  let current = b;
  for (let n = 0; n < 800; n++) {
    await step(a, current);
    await sleep(10);
    if (a.s.phase === 'active' && current.s.phase === 'active' && a.s.verifiedTurns === a.s.turns.length) {
      const needs = a.engine.needs();
      if (needs[0] !== needs[1] && a.s.turns.length > 3) break;
    }
  }
  const needs = a.engine.needs();
  assert.notEqual(needs[0], needs[1], 'reached a forced-switch round');
  await current.shutdown();
  await until(() => !a.peer, 'disconnect');
  current = new LanSession(bDir, { discovery: false });
  add(current);
  await current.command('resume', {});
  await until(() => a.s.phase === 'active' && current.s.phase === 'active', 'resumed in the replacement round');
  assert.equal(a.engine.digest(), current.engine.digest());
  assert.deepEqual(current.engine.needs(), needs);
  await playOut(a, current);
  assert.equal(a.engine.digest(), current.engine.digest());
  assert.deepEqual(a.s.turns, current.s.turns);
});

test('a peer on the older protocol is refused cleanly', async (t) => {
  const { root, a } = pair(t);
  await a.command('profile', { team: teamOf('h') });
  await a.command('host', { host: '127.0.0.1', port: 0 });
  const socket = connectTLS(identity(join(root, 'old')), '127.0.0.1', a.s.port);
  t.after(() => socket.destroy());
  await new Promise((resolve, reject) => {
    socket.once('secureConnect', resolve);
    socket.once('error', reject);
  });
  const frames = new Frames(socket);
  frames.send({ v: 1, matchId: a.s.matchId, type: 'hello', seq: 1, payload: { protocol: 1, engine: 'gen5-pkmn-0.10.13-v1', matchId: null, resume: false } });
  await until(() => /Incompatible battle protocol/.test(a.error), 'old peer rejected');
  assert.equal(a.peer, null);
});

test('a saved battle that no longer replays does not stop the service from starting', async (t) => {
  const { aDir } = pair(t);
  writeFileSync(
    join(aDir, 'battle-session.json'),
    JSON.stringify({ schemaVersion: 2, matchId: 'broken', role: 0, phase: 'active', seed: [1, 2, 3, 4], players: [[], []], turns: [], forfeits: [false, false], rules: { version: 2, mode: 'natural', stake: 0, timer: 0 } }),
  );
  const s = new LanSession(aDir, { discovery: false });
  t.after(() => s.shutdown());
  assert.equal(s.s, null);
  assert.match(s.error, /could not be restored/);
  assert.equal((await s.status()).session, null);
});

test('a finished match can be replayed step by step and exported as a Showdown log', async (t) => {
  const { aDir, a, b } = pair(t);
  await a.command('profile', { displayName: 'Ash', team: teamOf('h') });
  await b.command('profile', { displayName: 'Misty', team: teamOf('g') });
  await startMatch(a, b);
  await playOut(a, b);
  const matchId = a.s.matchId,
    total = a.s.turns.length;
  let r = (await a.command('replay', { matchId, step: 0 })).replay;
  assert.equal(r.total, total);
  assert.equal(r.battle.phase, 'teampreview');
  assert.deepEqual(r.names, ['Ash', 'Misty']);
  assert.equal(r.battle.players[0].moves.length, 0, 'a replay shows no choices');
  r = (await a.command('replay', { matchId, step: 1 })).replay;
  assert.equal(r.battle.phase, 'battle');
  r = (await a.command('replay', { matchId, step: 9999 })).replay;
  assert.equal(r.step, total);
  assert.equal(r.battle.finished, true);
  assert.equal((await a.command('replay', {})).replay, null);
  const out = (await a.command('export', { matchId })).exportedReplay;
  assert.ok(out.startsWith(join(aDir, 'battle-replays')));
  const log = readFileSync(out, 'utf8');
  assert.match(log, /\|player\|p1\|Ash\|/);
  assert.match(log, /\|player\|p2\|Misty\|/);
  assert.match(log, /\|win\|/);
  assert.equal(log.includes('|split|'), false);
  assert.deepEqual(readdirSync(join(aDir, 'battle-replays')), [matchId + '.log']);
  await assert.rejects(() => a.command('replay', { matchId: '../../etc/passwd' }));
  await assert.rejects(() => a.command('replay', { matchId: 'nope' }), /cannot be replayed/);
});

test('abandoned token reservations expire locally after 7 days', async (t) => {
  const { aDir, a, b } = pair(t);
  await a.command('profile', { team: teamOf('h') });
  await b.command('profile', { team: teamOf('g') });
  await startMatch(a, b, { stake: 1000, trustedStakesAccepted: true });
  await b.shutdown();
  await until(() => !a.peer, 'peer disconnected');
  await assert.rejects(() => a.command('close'), /Reservation can be released/);
  const file = join(aDir, 'state.json');
  const state = JSON.parse(readFileSync(file, 'utf8'));
  state.battleEscrows[a.s.matchId].createdAt -= 7 * 24 * 3600 + 1;
  writeFileSync(file, JSON.stringify(state));
  await a.command('close');
  const after = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(a.s.phase, 'closed');
  assert.equal(a.s.expired, true);
  assert.deepEqual(after.battleEscrows, {});
  assert.equal(after.battleNet || 0, 0);
  assert.equal(after.lifetimeTokens, 1000000000);
  assert.equal(after.tokensIntoStage, 777);
});

const ageEscrow = (dir, matchId) => {
  const file = join(dir, 'state.json'),
    state = JSON.parse(readFileSync(file, 'utf8'));
  state.battleEscrows[matchId].createdAt -= 7 * 24 * 3600 + 1;
  writeFileSync(file, JSON.stringify(state));
  return file;
};

test('a staked 1v1 match saved by the older protocol can still release its stake', async (t) => {
  const { aDir } = pair(t);
  const rules = { version: 1, mode: 'level50', stake: 5000, timer: 0 };
  await wallet(aDir, 'reserve', { matchId: 'v1-match', amount: 5000, rulesHash: 'a'.repeat(64), opponent: 'b'.repeat(64) });
  writeFileSync(
    join(aDir, 'battle-session.json'),
    JSON.stringify({ schemaVersion: 1, matchId: 'v1-match', role: 0, phase: 'active', paired: true, rules, ownOffer: { rulesHash: 'a'.repeat(64) }, turns: [], forfeits: [false, false] }),
  );
  const s = new LanSession(aDir, { discovery: false });
  t.after(() => s.shutdown());
  assert.equal(s.s.legacy, true);
  assert.match(s.error, /older version/);
  assert.equal((await s.status()).wallet.reserved, 5000);
  await assert.rejects(() => s.command('resume', {}), /cannot be resumed/);
  await assert.rejects(() => s.command('close'), /Reservation can be released/);
  const file = ageEscrow(aDir, 'v1-match');
  await s.command('close');
  const after = JSON.parse(readFileSync(file, 'utf8'));
  assert.deepEqual(after.battleEscrows, {});
  assert.equal(after.battleNet || 0, 0);
  assert.equal(s.s.phase, 'closed');
});

test('an opponent that already committed its choice cannot be timed out', async (t) => {
  const { a, b } = pair(t, { claimGraceMs: 100, clockMs: 100000 });
  await a.command('profile', { team: teamOf('h') });
  await b.command('profile', { team: teamOf('g') });
  await startMatch(a, b, { stake: 1000, trustedStakesAccepted: true, timer: 1 });
  await b.command('team', { order: '123' });
  await until(() => a.s.remoteCommit, 'opponent committed');
  // A modified client commits, sees the opponent's reveal and withholds its own.
  a.reveal = () => {};
  await a.command('team', { order: '123' });
  await until(() => a.s.remoteChoice, 'opponent revealed');
  await b.shutdown();
  await until(() => !a.peer, 'peer gone');
  await sleep(1300);
  assert.equal(a.claimable(), false, 'the opponent chose in time');
  await assert.rejects(() => a.command('claim'), /still has time/);
  assert.equal((await a.status()).wallet.net, 0);
});

test('the claim clock restarts with the service, not with the saved round', async (t) => {
  const { aDir, a, b, add } = pair(t, { claimGraceMs: 100, clockMs: 100000 });
  await a.command('profile', { team: teamOf('h') });
  await b.command('profile', { team: teamOf('g') });
  await startMatch(a, b, { timer: 1 });
  await a.command('team', { order: '123' });
  await b.shutdown();
  await a.shutdown();
  // The round started long ago while this side was asleep or stopped.
  const file = join(aDir, 'battle-session.json'),
    saved = JSON.parse(readFileSync(file, 'utf8'));
  saved.roundAt -= 3600 * 1000;
  writeFileSync(file, JSON.stringify(saved));
  const back = new LanSession(aDir, { discovery: false, claimGraceMs: 100, clockMs: 100000 });
  add(back);
  assert.equal(back.claimable(), false, 'no claim right after a restart');
  await sleep(1300);
  assert.equal(back.claimable(), true);
});
