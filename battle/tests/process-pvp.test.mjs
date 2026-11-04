process.env.OMAPKDEX_BATTLE_OFFLINE = '1';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { request } from '../control.mjs';
import { Dex } from '../deps.mjs';
const root = fileURLToPath(new URL('../', import.meta.url)),
  sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wait(dir, predicate, label) {
  for (let n = 0; n < 100; n++) {
    try {
      const s = await request(dir, 'status', {}, 1500);
      if (predicate(s)) return s;
    } catch {}
    await sleep(50);
  }
  throw Error('Timeout ' + label);
}
function fixture(folder, id, species, name) {
  const dir = join(folder, 'omarchy/io.github.heitorm50.omapkdex');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'state.json'),
    JSON.stringify({ lifetimeTokens: 1000000000, spentTokens: 0, hatched: true, tokensIntoStage: 777 }),
  );
  writeFileSync(
    join(dir, 'collection.json'),
    JSON.stringify({
      entries: [
        {
          companionId: id,
          speciesId: species,
          name,
          nature: 'hardy',
          finalStage: 0,
          graduatedAt: 1,
          line: [{ id: species, name }],
        },
      ],
    }),
  );
  return dir;
}
test('two independent services complete a staked battle and recover the result after restart', async (t) => {
  const temp = mkdtempSync(join(tmpdir(), 'omapkdex-process-')),
    aBase = join(temp, 'a'),
    bBase = join(temp, 'b'),
    a = fixture(aBase, 'ash', 25, 'pikachu'),
    b = fixture(bBase, 'misty', 7, 'squirtle'),
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
  await wait(a, (s) => s.profile, 'host service');
  await wait(b, (s) => s.profile, 'guest service');
  await request(a, 'profile', { displayName: 'Ash', selectedCompanionId: 'ash' });
  await request(b, 'profile', { displayName: 'Misty', selectedCompanionId: 'misty' });
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
  const pick = (s) => {
    const moves = s.session.battle.players[s.session.role].moves;
    let result = 0,
      best = -1;
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      if (m.disabled || m.pp <= 0) continue;
      const power = Dex.forGen(5).moves.get(m.id).basePower || 0;
      if (power > best) {
        best = power;
        result = i;
      }
    }
    return result + 1;
  };
  for (let n = 0; n < 20 && sa.session.phase !== 'finished'; n++) {
    await request(a, 'move', { slot: pick(sa) });
    await request(b, 'move', { slot: pick(sb) });
    sa = await wait(
      a,
      (s) =>
        s.session?.phase === 'finished' ||
        (s.session?.phase === 'active' && s.session.battle.turn > sa.session.battle.turn),
      'host turn',
    );
    sb = await wait(
      b,
      (s) =>
        s.session?.phase === 'finished' ||
        (s.session?.phase === 'active' && s.session.battle.turn === sa.session.battle.turn),
      'guest turn',
    );
  }
  assert.equal(sa.session.phase, 'finished');
  assert.equal(sb.session.phase, 'finished');
  assert.equal(sa.wallet.available + sb.wallet.available, 2000000000);
  assert.equal(sa.history.length, 1);
  const oldId = sa.session.matchId,
    oldBalance = sb.wallet.available;
  guest.kill('SIGTERM');
  await new Promise((r) => guest.once('exit', r));
  guest = launch(bBase);
  await wait(b, (s) => s.session?.phase === 'finished', 'restarted result');
  await request(b, 'resume');
  await wait(a, (s) => s.session?.phase === 'finished', 'recovery');
  sb = await wait(b, (s) => s.session?.phase === 'finished', 'recovery');
  assert.equal(sb.session.matchId, oldId);
  assert.equal(sb.wallet.available, oldBalance);
  assert.equal(sb.history.length, 1);
  assert.equal(JSON.parse(readFileSync(join(a, 'state.json'))).tokensIntoStage, 777);
  assert.equal(JSON.parse(readFileSync(join(b, 'state.json'))).lifetimeTokens, 1000000000);
});
