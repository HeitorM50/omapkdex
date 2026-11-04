process.env.OMAPKDEX_BATTLE_OFFLINE = '1';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { request } from '../control.mjs';
import { save, teamOf } from './helpers.mjs';
const root = fileURLToPath(new URL('../', import.meta.url)),
  sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// A cold service loads the simulator first; on a busy machine that alone can take
// longer than the per-step waits below, so startup gets a wider budget.
async function wait(dir, predicate, label, tries = 100) {
  for (let n = 0; n < tries; n++) {
    try {
      const s = await request(dir, 'status', {}, 1500);
      if (predicate(s)) return s;
    } catch {}
    await sleep(50);
  }
  throw Error('Timeout ' + label);
}
const fixture = (folder, who) => save(folder, who);
test('two independent services complete a staked battle and recover the result after restart', async (t) => {
  const temp = mkdtempSync(join(tmpdir(), 'omapkdex-process-')),
    aBase = join(temp, 'h'),
    bBase = join(temp, 'g'),
    a = fixture(temp, 'h'),
    b = fixture(temp, 'g'),
    children = [];
  const launch = (base) => {
    const p = spawn(process.execPath, [join(root, 'service.mjs')], {
      env: { ...process.env, XDG_STATE_HOME: base },
      stdio: 'ignore',
    });
    children.push(p);
    return p;
  };
  t.after(async () => {
    for (const p of children) p.kill('SIGTERM');
    await sleep(200);
    rmSync(temp, { recursive: true, force: true });
  });
  launch(aBase);
  let guest = launch(bBase);
  await wait(a, (s) => s.profile, 'host service', 600);
  await wait(b, (s) => s.profile, 'guest service', 600);
  await request(a, 'profile', { displayName: 'Ash', team: teamOf('h') });
  await request(b, 'profile', { displayName: 'Misty', team: teamOf('g') });
  const h = await request(a, 'host', {
    host: '127.0.0.1',
    port: 0,
    stake: 50000000,
    trustedStakesAccepted: true,
  });
  await request(b, 'join', { host: '127.0.0.1', port: h.session.port });
  const host = await wait(a, (s) => s.session?.pairCode, 'host code'),
    client = await wait(b, (s) => s.session?.pairCode, 'guest code');
  assert.equal(host.session.pairCode, client.session.pairCode);
  await request(a, 'pair');
  await request(b, 'pair');
  await wait(b, (s) => s.session?.rules, 'rules');
  await request(a, 'ready', { trustedStakesAccepted: true });
  await request(b, 'ready', { trustedStakesAccepted: true });
  let sa = await wait(a, (s) => s.session?.phase === 'active', 'battle'),
    sb = await wait(b, (s) => s.session?.phase === 'active', 'battle');
  // Each side answers whatever the simulator is waiting on: preview, move or replacement.
  const answer = async (dir, s) => {
    const me = s.session.battle.players[s.session.role];
    if (s.session.phase !== 'active' || !me.request || s.session.waiting) return false;
    if (me.request === 'teampreview') await request(dir, 'team', { order: '123' });
    else if (me.request === 'switch') await request(dir, 'switch', { slot: me.team.find((m) => !m.fainted && !m.active).slot });
    else {
      const i = me.moves.findIndex((m) => !m.disabled && m.pp > 0);
      await request(dir, 'move', { slot: i < 0 ? 1 : i + 1 });
    }
    return true;
  };
  for (let n = 0; n < 2000 && sa.session.phase !== 'finished'; n++) {
    await answer(a, sa);
    await answer(b, sb);
    await sleep(30);
    sa = await request(a, 'status');
    sb = await request(b, 'status');
  }
  sa = await wait(a, (s) => s.session?.phase === 'finished', 'host finish');
  sb = await wait(b, (s) => s.session?.phase === 'finished', 'guest finish');
  assert.equal(sa.session.phase, 'finished');
  assert.equal(sb.session.phase, 'finished');
  assert.equal(sa.wallet.available + sb.wallet.available, 2000000000);
  assert.equal(sa.history.length, 1);
  const oldId = sa.session.matchId,
    oldBalance = sb.wallet.available;
  guest.kill('SIGTERM');
  await new Promise((r) => guest.once('exit', r));
  guest = launch(bBase);
  await wait(b, (s) => s.session?.phase === 'finished', 'restarted result', 600);
  await request(b, 'resume');
  await wait(a, (s) => s.session?.phase === 'finished', 'recovery');
  sb = await wait(b, (s) => s.session?.phase === 'finished', 'recovery');
  assert.equal(sb.session.matchId, oldId);
  assert.equal(sb.wallet.available, oldBalance);
  assert.equal(sb.history.length, 1);
  assert.equal(JSON.parse(readFileSync(join(a, 'state.json'))).tokensIntoStage, 777);
  assert.equal(JSON.parse(readFileSync(join(b, 'state.json'))).lifetimeTokens, 1000000000);
});
