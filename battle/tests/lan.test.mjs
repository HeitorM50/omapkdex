process.env.OMAPKDEX_BATTLE_OFFLINE = '1';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MatchEngine } from '../engine.mjs';
import { LanSession, hash } from '../session.mjs';
import { wallet } from '../wallet.mjs';
import { teamSnapshots } from '../profile.mjs';
import { until, save, teamOf, step, sleep } from './helpers.mjs';
const team = (who) => teamOf(who);
test('two TLS peers pair, reserve stakes, use committed moves, reconnect and settle once', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'omapkdex-lan-'));
  const aDir = save(root, 'host'),
    bDir = save(root, 'guest');
  const a = new LanSession(aDir, { discovery: false }),
    b = new LanSession(bDir, { discovery: false });
  t.after(async () => {
    await a.shutdown();
    await b.shutdown();
    rmSync(root, { recursive: true, force: true });
  });
  const beforeA = readFileSync(join(aDir, 'collection.json'), 'utf8');
  await a.command('profile', { displayName: 'Ash', team: team('host') });
  await b.command('profile', { displayName: 'Misty', team: team('guest') });
  await a.command('host', {
    host: '127.0.0.1',
    port: 0,
    stake: 100000000,
    trustedStakesAccepted: true,
  });
  await b.command('join', { host: '127.0.0.1', port: a.s.port });
  await until(() => a.code && b.code, 'pair code');
  assert.equal(a.code, b.code);
  assert.equal(a.s.ownOffer, undefined);
  assert.equal(b.s.theirOffer, undefined);
  await assert.rejects(() => a.command('ready', {}));
  await a.command('pair');
  await b.command('pair');
  await until(() => a.s.paired && b.s.rules, 'pairing');
  await a.command('ready', { trustedStakesAccepted: true });
  await b.command('ready', { trustedStakesAccepted: true });
  await until(() => a.s.phase === 'active' && b.s.phase === 'active', 'start');
  assert.equal((await a.status()).wallet.available, 900000000);
  assert.equal(a.engine.digest(), b.engine.digest());
  a.peer.close();
  await until(() => !a.peer && !b.peer, 'disconnect');
  assert.equal((await a.status()).wallet.available, 900000000);
  await b.command('resume', {});
  await until(() => a.s.phase === 'active' && b.s.phase === 'active', 'resume');
  assert.equal(a.engine.digest(), b.engine.digest());
  assert.equal(a.engine.view().phase, 'teampreview');
  await a.command('team', { order: '123' });
  assert.ok(a.s.choice);
  assert.equal(b.s.choice, undefined);
  await assert.rejects(() => a.command('move', { slot: 1 }));
  await b.command('team', { order: '321' });
  await until(() => a.s.turns.length === 1 && b.s.turns.length === 1 && a.s.phase === 'active' && b.s.phase === 'active', 'preview');
  assert.equal(a.engine.view().phase, 'battle');
  assert.equal(b.engine.view().players[1].team.length, 3);
  assert.equal(a.battleView().players[1].moves.length, 0, 'the opponent moves stay hidden');
  assert.ok(a.battleView().players[0].moves.length > 0);
  await step(a, b);
  await until(
    () =>
      a.s.phase === 'active' && b.s.phase === 'active' && a.s.turns.length === 2 && b.s.turns.length === 2,
    'first move round',
  );
  const replay = new MatchEngine(a.s.players, a.s.seed);
  for (const turn of a.s.turns) replay.apply(turn.actions);
  assert.equal(replay.digest(), a.s.turns.at(-1).hash);
  replay.destroy();
  if (!a.engine.view().finished) await a.command('forfeit');
  await until(() => a.s.phase === 'finished' && b.s.phase === 'finished', 'settlement');
  const total = (await a.status()).wallet.available + (await b.status()).wallet.available;
  assert.equal(total, 2000000000);
  assert.equal(a.trainer.history().length, 1);
  assert.equal(b.trainer.history().length, 1);
  assert.equal(readFileSync(join(aDir, 'collection.json'), 'utf8'), beforeA);
  assert.equal(a.engine.digest(), b.engine.digest());
});
test('staked cancellation refunds the ready peer and lets the host create another room', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'omapkdex-cancel-')),
    a = new LanSession(save(root, 'h'), { discovery: false }),
    b = new LanSession(save(root, 'g'), { discovery: false });
  t.after(async () => {
    await a.shutdown();
    await b.shutdown();
    rmSync(root, { recursive: true, force: true });
  });
  await a.command('profile', { team: team('h') });
  await b.command('profile', { team: team('g') });
  await a.command('host', { host: '127.0.0.1', port: 0, stake: 20000000, trustedStakesAccepted: true });
  await b.command('join', { host: '127.0.0.1', port: a.s.port });
  await until(() => a.code && b.code, 'codes');
  await a.command('pair');
  await b.command('pair');
  await until(() => b.s.rules, 'rules');
  await a.command('ready', { trustedStakesAccepted: true });
  await until(() => b.s.theirOffer, 'one offer');
  assert.equal((await a.status()).wallet.available, 980000000);
  await b.command('close');
  await until(() => a.s.settled && b.s.settled, 'mutual cancellation');
  assert.equal((await a.status()).wallet.available, 1000000000);
  assert.equal(a.trainer.history().length, 0);
  const old = a.s.matchId;
  await a.command('host', { host: '127.0.0.1', port: 0, stake: 0 });
  assert.notEqual(a.s.matchId, old);
  assert.equal(a.s.phase, 'waiting');
});
test('a committed move survives peer process state reload and is not replayed twice', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'omapkdex-resume-')),
    aDir = save(root, 'h'),
    bDir = save(root, 'g');
  const a = new LanSession(aDir, { discovery: false });
  let b = new LanSession(bDir, { discovery: false });
  t.after(async () => {
    await a.shutdown();
    await b.shutdown();
    rmSync(root, { recursive: true, force: true });
  });
  await a.command('profile', { team: team('h') });
  await b.command('profile', { team: team('g') });
  await a.command('host', { host: '127.0.0.1', port: 0 });
  await b.command('join', { host: '127.0.0.1', port: a.s.port });
  await until(() => a.code && b.code, 'codes');
  await a.command('pair');
  await b.command('pair');
  await until(() => b.s.rules, 'rules');
  await a.command('ready', {});
  await b.command('ready', {});
  await until(() => a.s.phase === 'active' && b.s.phase === 'active', 'started');
  await a.command('team', { order: '123' });
  await until(() => b.s.remoteCommit, 'commit');
  await b.shutdown();
  await until(() => !a.peer, 'disconnect');
  b = new LanSession(bDir, { discovery: false });
  await b.command('resume', {});
  await until(() => a.s.phase === 'active' && b.s.phase === 'active', 'reload resume');
  assert.ok(a.s.choice);
  await b.command('team', { order: '123' });
  await until(
    () =>
      a.s.turns.length === 1 && b.s.turns.length === 1 && a.s.phase === 'active' && b.s.phase === 'active',
    'resumed turn',
  );
  assert.equal(a.engine.digest(), b.engine.digest());
  await b.command('forfeit');
  await until(() => a.s.settled && b.s.settled, 'finished');
  assert.equal(a.trainer.history().length, 1);
});
test('a completed journal remains recoverable after another room has been created', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'omapkdex-archive-')),
    a = new LanSession(save(root, 'h'), { discovery: false }),
    b = new LanSession(save(root, 'g'), { discovery: false });
  t.after(async () => {
    await a.shutdown();
    await b.shutdown();
    rmSync(root, { recursive: true, force: true });
  });
  await a.command('profile', { team: team('h') });
  await b.command('profile', { team: team('g') });
  await a.command('host', { host: '127.0.0.1', port: 0, stake: 1000, trustedStakesAccepted: true });
  await b.command('join', { host: '127.0.0.1', port: a.s.port });
  await until(() => a.code && b.code, 'codes');
  await a.command('pair');
  await b.command('pair');
  await until(() => b.s.rules, 'rules');
  await a.command('ready', { trustedStakesAccepted: true });
  await b.command('ready', { trustedStakesAccepted: true });
  await until(() => a.s.phase === 'active' && b.s.phase === 'active', 'active');
  await a.command('forfeit');
  await until(() => a.s.phase === 'finished' && b.s.phase === 'finished', 'finished');
  const matchId = a.s.matchId,
    oldA = (await a.status()).wallet.available,
    oldB = (await b.status()).wallet.available;
  await a.command('host', { host: '127.0.0.1', port: 0 });
  await a.command('close');
  await until(() => !b.peer, 'old connection closes');
  await a.command('recover', { matchId });
  await b.command('resume', {});
  await until(() => a.s.phase === 'finished' && b.s.phase === 'finished', 'archived recovery');
  assert.equal((await a.status()).wallet.available, oldA);
  assert.equal((await b.status()).wallet.available, oldB);
  assert.equal(a.trainer.history().length, 1);
});

test('a crash after reserving funds recovers the prepared offer without a second debit', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'omapkdex-intent-')),
    dir = save(root, 'h');
  let controller = new LanSession(dir, { discovery: false });
  controller.trainer.update({ team: teamOf('h') });
  t.after(async () => {
    await controller.shutdown();
    rmSync(root, { recursive: true, force: true });
  });
  const rules = { version: 2, mode: 'natural', stake: 1000 },
    matchId = 'prepared-match';
  controller.s = {
    schemaVersion: 2,
    role: 0,
    host: '127.0.0.1',
    port: 47853,
    matchId,
    rules,
    phase: 'lobby',
    paired: true,
    peerFingerprint: 'b'.repeat(64),
    ownSeed: 'a'.repeat(32),
    turns: [],
    forfeits: [false, false],
    verifiedTurns: 0,
  };
  controller.s.reservationIntent = {
    trainer: controller.publicTrainer(),
    team: teamSnapshots(dir, teamOf('h')),
    rulesHash: hash(rules),
    seedCommit: hash(controller.s.ownSeed),
  };
  controller.save();
  await wallet(dir, 'reserve', { matchId, amount: 1000, rulesHash: hash(rules), opponent: 'b'.repeat(64) });
  await controller.shutdown();
  controller = new LanSession(dir, { discovery: false });
  const result = await controller.command('status');
  assert.equal(result.wallet.available, 999999000);
  assert.ok(controller.s.ownOffer);
  assert.equal(controller.s.reservationIntent, undefined);
  assert.equal(result.wallet.reserved, 1000);
  await assert.rejects(() => controller.command('close'));
});

test('two peers play a full 3v3 through team preview and forced switches and agree on the result', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'omapkdex-full-')),
    a = new LanSession(save(root, 'h'), { discovery: false }),
    b = new LanSession(save(root, 'g'), { discovery: false });
  t.after(async () => {
    await a.shutdown();
    await b.shutdown();
    rmSync(root, { recursive: true, force: true });
  });
  await a.command('profile', { team: team('h') });
  await b.command('profile', { team: team('g') });
  await a.command('host', { host: '127.0.0.1', port: 0 });
  await b.command('join', { host: '127.0.0.1', port: a.s.port });
  await until(() => a.code && b.code, 'codes');
  await a.command('pair');
  await b.command('pair');
  await until(() => b.s.rules, 'rules');
  await a.command('ready', {});
  await b.command('ready', {});
  await until(() => a.s.phase === 'active' && b.s.phase === 'active', 'active');
  for (let n = 0; n < 1500 && !(a.s.settled && b.s.settled); n++) {
    await step(a, b);
    await sleep(10);
  }
  await until(() => a.s.phase === 'finished' && b.s.phase === 'finished', 'finished');
  assert.equal(a.engine.digest(), b.engine.digest());
  assert.deepEqual(a.s.turns, b.s.turns);
  assert.ok(a.s.turns.some((turn) => turn.actions.includes(null)), 'a forced switch round had one chooser');
  assert.ok(a.s.turns[0].actions.every((c) => /^team /.test(c)));
  assert.equal(a.trainer.history().length, 1);
  // The opponent's rarity and types come over the wire with each Pokémon.
  assert.deepEqual(b.s.theirOffer.team.map((m) => m.rarity), ['rare', 'common', 'common']);
  assert.equal(a.battleView().players[1].team.filter((m) => m.rarity === 'rare').length, 1, 'the view shows the opponent’s rarities');
});
