import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TrainerStore, roster, snapshot } from '../profile.mjs';
import { MatchEngine } from '../engine.mjs';

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'omapkdex-battle-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const collection = {
    entries: [
      {
        companionId: 'caught-a',
        speciesId: 25,
        name: 'pikachu',
        nature: 'adamant',
        rarity: 'common',
        finalStage: 0,
        graduatedAt: 123,
        hatchedAt: 1,
        line: [{ id: 25, name: 'pikachu', sprite: '/private/sprite.png' }],
      },
      {
        companionId: 'caught-b',
        speciesId: 25,
        name: 'pikachu',
        nature: 'timid',
        rarity: 'common',
        finalStage: 0,
        graduatedAt: 124,
        hatchedAt: 2,
        line: [{ id: 25, name: 'pikachu' }],
      },
    ],
  };
  writeFileSync(join(dir, 'collection.json'), JSON.stringify(collection));
  writeFileSync(
    join(dir, 'state.json'),
    JSON.stringify({ hatched: true, stage: 0, lifetimeTokens: 1000000000, spentTokens: 0 }),
  );
  return dir;
}
test('trainer identity and individual selection persist without touching captures', (t) => {
  const dir = fixture(t),
    before = readFileSync(join(dir, 'collection.json'), 'utf8');
  const store = new TrainerStore(dir),
    id = store.get().trainerId;
  store.update({ displayName: 'Ash <trainer>', avatarKey: 'greatball', selectedCompanionId: 'caught-b' });
  assert.equal(new TrainerStore(dir).get().trainerId, id);
  assert.equal(store.get().selectedCompanionId, 'caught-b');
  assert.equal(roster(dir).length, 2);
  assert.notDeepEqual(
    snapshot(dir, 'caught-a', 'level50').set.ivs,
    snapshot(dir, 'caught-b', 'level50').set.ivs,
  );
  assert.equal(readFileSync(join(dir, 'collection.json'), 'utf8'), before);
  assert.throws(() => store.update({ displayName: 'x'.repeat(33) }));
  assert.throws(() => store.update({ avatarKey: 'https://bad/avatar' }));
  assert.throws(() => snapshot(dir, 'not-owned', 'level50'));
  assert.equal(JSON.stringify(snapshot(dir, 'caught-a', 'level50')).includes('/private/'), false);
});
test('full Gen 5 engine is deterministic, preserves snapshots and finishes', (t) => {
  const dir = fixture(t),
    a = snapshot(dir, 'caught-a', 'level50'),
    b = snapshot(dir, 'caught-b', 'level50');
  const before = JSON.stringify([a, b]);
  const one = new MatchEngine([a, b], [1, 2, 3, 4]),
    two = new MatchEngine([a, b], [1, 2, 3, 4]);
  for (let n = 0; n < 300 && !one.view().finished; n++) {
    const moves = one.view().players.map((p) => p.moves.findIndex((m) => !m.disabled && m.pp > 0) + 1 || 1);
    one.turn(moves);
    two.turn(moves);
    assert.equal(one.digest(), two.digest());
  }
  assert.equal(one.view().finished, true);
  assert.equal(JSON.stringify([a, b]), before);
  assert.throws(() => new MatchEngine([{ ...a, set: { ...a.set, species: 'not-a-mon' } }, b], [1, 2, 3, 4]));
});
