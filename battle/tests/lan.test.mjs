process.env.OMAPKDEX_BATTLE_OFFLINE = '1';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MatchEngine } from '../engine.mjs';
import { LanSession, hash } from '../session.mjs';
import { wallet } from '../wallet.mjs';
import { snapshot } from '../profile.mjs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, label) {
  for (let n = 0; n < 300; n++) {
    if (await fn()) return;
    await sleep(20);
  }
  throw Error('Timeout: ' + label);
}
function save(root, who, species, name) {
  const dir = join(root, who, 'omarchy/io.github.heitorm50.omapkdex');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'state.json'),
    JSON.stringify({ lifetimeTokens: 1000000000, spentTokens: 0, hatched: true }),
  );
  writeFileSync(
    join(dir, 'collection.json'),
    JSON.stringify({
      entries: [
        {
          companionId: who,
          speciesId: species,
          name,
          nature: 'adamant',
          rarity: 'common',
          finalStage: 0,
          graduatedAt: 1,
          line: [{ id: species, name }],
        },
      ],
    }),
  );
  return dir;
}
test('two TLS peers pair, reserve stakes, use committed moves, reconnect and settle once', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'omapkdex-lan-'));
  const aDir = save(root, 'host', 25, 'pikachu'),
    bDir = save(root, 'guest', 7, 'squirtle');
  const a = new LanSession(aDir, { discovery: false }),
    b = new LanSession(bDir, { discovery: false });
  t.after(async () => {
    await a.shutdown();
    await b.shutdown();
    rmSync(root, { recursive: true, force: true });
  });
  const beforeA = readFileSync(join(aDir, 'collection.json'), 'utf8');
  await a.command('profile', { displayName: 'Ash', selectedCompanionId: 'host' });
  await b.command('profile', { displayName: 'Misty', selectedCompanionId: 'guest' });
  await a.command('host', {
    host: '127.0.0.1',
    port: 0,
    mode: 'level50',
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
  const attack = (s) => {
    const moves = s.engine.view().players[s.s.role].moves;
    return (
      Math.max(
        0,
        moves.findIndex(
          (m) =>
            !m.disabled &&
            m.pp > 0 &&
            !['rest', 'sleeptalk', 'protect', 'raindance', 'tailwhip', 'irondefense'].includes(m.id),
        ),
      ) + 1
    );
  };
  await a.command('move', { slot: attack(a) });
  assert.ok(a.s.choice);
  assert.equal(b.s.choice, undefined);
  await b.command('move', { slot: attack(b) });
  await until(
    () =>
      a.s.phase !== 'verifying' &&
      b.s.phase !== 'verifying' &&
      a.s.turns.length === 1 &&
      b.s.turns.length === 1,
    'first turn',
  );
  const replay = new MatchEngine(a.s.players, a.s.seed, a.s.rules.mode);
  for (const turn of a.s.turns) replay.turn(turn.actions);
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
    a = new LanSession(save(root, 'h', 25, 'pikachu'), { discovery: false }),
    b = new LanSession(save(root, 'g', 7, 'squirtle'), { discovery: false });
  t.after(async () => {
    await a.shutdown();
    await b.shutdown();
    rmSync(root, { recursive: true, force: true });
  });
  await a.command('profile', { selectedCompanionId: 'h' });
  await b.command('profile', { selectedCompanionId: 'g' });
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
    aDir = save(root, 'h', 25, 'pikachu'),
    bDir = save(root, 'g', 7, 'squirtle');
  const a = new LanSession(aDir, { discovery: false });
  let b = new LanSession(bDir, { discovery: false });
  t.after(async () => {
    await a.shutdown();
    await b.shutdown();
    rmSync(root, { recursive: true, force: true });
  });
  await a.command('profile', { selectedCompanionId: 'h' });
  await b.command('profile', { selectedCompanionId: 'g' });
  await a.command('host', { host: '127.0.0.1', port: 0 });
  await b.command('join', { host: '127.0.0.1', port: a.s.port });
  await until(() => a.code && b.code, 'codes');
  await a.command('pair');
  await b.command('pair');
  await until(() => b.s.rules, 'rules');
  await a.command('ready', {});
  await b.command('ready', {});
  await until(() => a.s.phase === 'active' && b.s.phase === 'active', 'started');
  await a.command('move', { slot: 1 });
  await until(() => b.s.remoteCommit, 'commit');
  await b.shutdown();
  await until(() => !a.peer, 'disconnect');
  b = new LanSession(bDir, { discovery: false });
  await b.command('resume', {});
  await until(() => a.s.phase === 'active' && b.s.phase === 'active', 'reload resume');
  assert.ok(a.s.choice);
  await b.command('move', { slot: 1 });
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
    a = new LanSession(save(root, 'h', 25, 'pikachu'), { discovery: false }),
    b = new LanSession(save(root, 'g', 7, 'squirtle'), { discovery: false });
  t.after(async () => {
    await a.shutdown();
    await b.shutdown();
    rmSync(root, { recursive: true, force: true });
  });
  await a.command('profile', { selectedCompanionId: 'h' });
  await b.command('profile', { selectedCompanionId: 'g' });
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
    dir = save(root, 'h', 25, 'pikachu');
  let controller = new LanSession(dir, { discovery: false });
  t.after(async () => {
    await controller.shutdown();
    rmSync(root, { recursive: true, force: true });
  });
  const rules = { version: 1, mode: 'level50', stake: 1000 },
    matchId = 'prepared-match';
  controller.s = {
    schemaVersion: 1,
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
    snapshot: snapshot(dir, 'h', 'level50'),
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
  // After the TTL a missing opponent no longer locks the stake or the room.
  const file = join(dir, 'state.json'),
    state = JSON.parse(readFileSync(file, 'utf8'));
  state.battleEscrows[matchId].createdAt -= 7 * 24 * 3600 + 1;
  writeFileSync(file, JSON.stringify(state));
  const closed = await controller.command('close');
  assert.equal(closed.wallet.reserved, 0);
  assert.equal(closed.wallet.available, 1000000000);
  assert.equal(closed.wallet.net, 0);
  assert.equal(controller.s.phase, 'closed');
  await controller.shutdown();
});
