import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TrainerStore, roster, teamSnapshots, learnset } from '../profile.mjs';
import { MatchEngine } from '../engine.mjs';
import { pick } from './helpers.mjs';
import { validateTeam, moveInfo } from '../profile.mjs';
import { Dex } from '../deps.mjs';

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
      ...[
        [4, 'charmander'],
        [7, 'squirtle'],
      ].map(([speciesId, name], i) => ({
        companionId: 'caught-' + 'cd'[i],
        speciesId,
        name,
        nature: 'bold',
        rarity: 'common',
        finalStage: 0,
        graduatedAt: 125 + i,
        hatchedAt: 3 + i,
        line: [{ id: speciesId, name }],
      })),
    ],
  };
  writeFileSync(join(dir, 'collection.json'), JSON.stringify(collection));
  writeFileSync(
    join(dir, 'state.json'),
    JSON.stringify({ hatched: true, stage: 0, lifetimeTokens: 1000000000, spentTokens: 0 }),
  );
  return dir;
}
test('trainer identity and team persist without touching captures', (t) => {
  const dir = fixture(t),
    before = readFileSync(join(dir, 'collection.json'), 'utf8');
  const store = new TrainerStore(dir),
    id = store.get().trainerId;
  store.update({
    displayName: 'Ash <trainer>',
    avatarKey: 'greatball',
    team: [{ companionId: 'caught-b' }, { companionId: 'caught-c' }, { companionId: 'caught-d' }],
  });
  assert.equal(new TrainerStore(dir).get().trainerId, id);
  assert.deepEqual(
    store.get().team.map((m) => m.companionId),
    ['caught-b', 'caught-c', 'caught-d'],
  );
  assert.equal(roster(dir).length, 4);
  const snaps = teamSnapshots(dir, store.get().team);
  assert.equal(snaps.length, 3);
  assert.notDeepEqual(
    teamSnapshots(dir, [{ companionId: 'caught-a' }, { companionId: 'caught-c' }, { companionId: 'caught-d' }])[0]
      .set.ivs,
    snaps[0].set.ivs,
  );
  assert.equal(readFileSync(join(dir, 'collection.json'), 'utf8'), before);
  assert.throws(() => store.update({ displayName: 'x'.repeat(33) }));
  assert.throws(() => store.update({ avatarKey: 'https://bad/avatar' }));
  assert.throws(() => store.update({ team: [{ companionId: 'not-owned' }] }));
  assert.equal(JSON.stringify(snaps).includes('/private/'), false);
});
test('team rules: size, Species Clause and level-up moves only', (t) => {
  const dir = fixture(t),
    store = new TrainerStore(dir),
    ids = ['caught-a', 'caught-b', 'caught-c', 'caught-d'].map((companionId) => ({ companionId }));
  assert.throws(() => teamSnapshots(dir, ids.slice(2)), /at least 3/);
  assert.throws(() => store.update({ team: [ids[0], ids[1]] }), /Species Clause/);
  assert.throws(() => store.update({ team: [...ids, ...ids] }), /at most 6/);
  assert.throws(() => store.update({ team: [ids[0], ids[0]] }), /once/);
  // Surf is a TM in Gen 5, not a level-up move: outside "what it would have learned by its level".
  assert.throws(() => store.update({ team: [{ ...ids[0], moves: ['surf'] }] }), /cannot use that move/);
  assert.throws(() => store.update({ team: [{ ...ids[0], moves: ['fissure'] }] }));
  assert.throws(() => store.update({ team: [{ ...ids[0], moves: [] }] }));
  const list = learnset(dir, 'caught-a', []);
  assert.ok(list.moves.length > 4);
  assert.ok(list.moves.every((m) => m.learnedAt <= list.level));
  const pick = list.moves.slice(0, 2).map((m) => m.id);
  store.update({ team: [{ ...ids[0], moves: pick }, ids[2], ids[3]] });
  const set = teamSnapshots(dir, store.get().team)[0].set;
  assert.deepEqual(set.moves.map((m) => m.toLowerCase().replace(/[^a-z]/g, '')), pick);
});
test('full Gen 5 engine plays team preview, switches and forced switches deterministically', (t) => {
  const dir = fixture(t),
    team = ['caught-a', 'caught-c', 'caught-d'].map((companionId) => ({ companionId })),
    other = ['caught-b', 'caught-c', 'caught-d'].map((companionId) => ({ companionId }));
  const a = teamSnapshots(dir, team),
    b = teamSnapshots(dir, other);
  const before = JSON.stringify([a, b]);
  const one = new MatchEngine([a, b], [1, 2, 3, 4]),
    two = new MatchEngine([a, b], [1, 2, 3, 4]);
  assert.equal(one.phase(), 'teampreview');
  assert.deepEqual(one.needs(), [true, true]);
  assert.throws(() => one.apply(['move 1', 'team 123']));
  assert.throws(() => one.apply(['team 123', 'team 111']));
  let forced = 0;
  for (let n = 0; n < 400 && !one.view().finished; n++) {
    const needs = one.needs(),
      view = one.view(),
      actions = needs.map((need, i) => (need ? pick(view, i) : null));
    if (needs[0] !== needs[1]) forced++;
    one.apply(actions);
    two.apply(actions);
    assert.equal(one.digest(), two.digest());
  }
  assert.equal(one.view().finished, true);
  assert.ok(forced > 0, 'a Pokémon fainted and only its owner chose a replacement');
  assert.equal(JSON.stringify([a, b]), before);
  assert.throws(() => new MatchEngine([[{ ...a[0], set: { ...a[0].set, species: 'not-a-mon' } }, a[1], a[2]], b], [1, 2, 3, 4]));
});
test('a team preview pick brings only three Pokémon and the lead is the first pick', (t) => {
  const dir = fixture(t),
    team = (ids) => teamSnapshots(dir, ids.map((companionId) => ({ companionId }))),
    a = team(['caught-a', 'caught-c', 'caught-d']),
    b = team(['caught-b', 'caught-c', 'caught-d']);
  const e = new MatchEngine([a, b], [4, 3, 2, 1]);
  e.apply(['team 321', 'team 123']);
  const v = e.view();
  assert.equal(v.phase, 'battle');
  assert.equal(v.players[0].team.length, 3);
  assert.equal(v.players[0].name, 'Squirtle');
  assert.equal(v.players[1].name, 'Pikachu');
  assert.deepEqual(v.players[0].team.map((m) => m.active), [true, false, false]);
});

test('a locked-in move (Outrage) stays playable: its PP come from the slot and switching is blocked', () => {
  const snap = (id, num, name, moves) => ({
    companionId: id,
    speciesId: num,
    originalLevel: 100,
    set: {
      species: name,
      name,
      level: 100,
      nature: 'hardy',
      ability: Object.values(Dex.forGen(5).species.get(name).abilities)[0],
      moves,
      ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
      evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      shiny: false,
      gender: 'M',
    },
  });
  const a = validateTeam([
      snap('x1', 149, 'Dragonite', ['outrage', 'agility']),
      snap('x2', 130, 'Gyarados', ['thrash', 'bite']),
      snap('x3', 143, 'Snorlax', ['bodyslam', 'rest']),
    ]),
    b = validateTeam([
      snap('y1', 143, 'Snorlax', ['rest', 'bodyslam']),
      snap('y2', 130, 'Gyarados', ['thrash', 'bite']),
      snap('y3', 149, 'Dragonite', ['outrage', 'agility']),
    ]);
  const e = new MatchEngine([a, b], [1, 2, 3, 4]);
  e.apply(['team 123', 'team 123']);
  e.apply(['move 1', 'move 1']);
  const me = e.view().players[0];
  assert.equal(me.moves.length, 1);
  assert.equal(me.moves[0].id, 'outrage');
  assert.equal(me.trapped, true);
  assert.equal(typeof me.moves[0].pp, 'number', 'PP are filled in from the move slot');
  assert.ok(me.moves[0].pp > 0 && me.moves[0].maxpp >= me.moves[0].pp);
  assert.ok(e.defaultChoice(0).startsWith('move '));
  assert.throws(() => e.legal(0, 'switch 2'), /trapped/);
  e.apply(['move 1', 'move 1']);
  assert.equal(e.battle.ended || e.view().turn >= 3, true);
});

test('moves list their side effects in words, drawbacks first', () => {
  const text = (name) => moveInfo(name).effects.map((e) => e.kind + ':' + e.text);
  assert.deepEqual(text('outrage'), ['cost:Locks you in for 2–3 turns, then confuses you']);
  assert.deepEqual(text('hyperbeam'), ['cost:You must recharge next turn']);
  assert.deepEqual(text('flareblitz'), ['cost:Recoil: 33% of the damage', 'bonus:10% to inflict burn']);
  assert.deepEqual(text('closecombat'), ['cost:Def −1, SpD −1 to you']);
  assert.deepEqual(text('explosion'), ['cost:You faint']);
  assert.ok(text('focuspunch').includes('cost:Fails if you are hit before it moves'));
  assert.ok(text('drainpunch').some((t) => t.startsWith('bonus:Heals you')));
  assert.deepEqual(text('thunderbolt').map((t) => t.split(':')[0]), ['bonus']);
  assert.deepEqual(moveInfo('tackle').effects, []);
});
test('the view carries move effects, and each Pokémon its rarity and types, for both sides', (t) => {
  const dir = fixture(t),
    team = (ids) => teamSnapshots(dir, ids.map((companionId) => ({ companionId }))),
    a = team(['caught-a', 'caught-c', 'caught-d']),
    b = team(['caught-b', 'caught-c', 'caught-d']);
  a[0].rarity = 'legendary';
  const e = new MatchEngine([a, b], [1, 2, 3, 4]);
  e.apply(['team 123', 'team 123']);
  const v = e.view();
  assert.equal(v.players[0].rarity, 'legendary');
  assert.equal(v.players[1].rarity, 'common');
  assert.ok(v.players.every((p) => p.team.every((m) => typeof m.rarity === 'string' && m.types.length > 0)));
  assert.ok(v.players[0].moves.every((m) => Array.isArray(m.effects)));
});

test('the opponent threat arrow comes from public information only: its types and moves already used', () => {
  const learned = (name) =>
    Object.entries(Dex.data.Learnsets[name].learnset)
      .filter(([, sources]) => sources.some((x) => /^5L\d+$/.test(x)))
      .map(([move]) => move);
  const snap = (id, num, name, moves) => ({
    companionId: id,
    speciesId: num,
    originalLevel: 100,
    rarity: 'common',
    set: {
      species: name,
      name,
      level: 100,
      nature: 'hardy',
      ability: Object.values(Dex.forGen(5).species.get(name).abilities)[0],
      moves,
      ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
      evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      shiny: false,
      gender: 'M',
    },
  });
  const mine = validateTeam([
    snap('a1', 149, 'Dragonite', ['outrage', 'agility']),
    snap('a2', 143, 'Snorlax', ['bodyslam', 'rest']),
    snap('a3', 130, 'Gyarados', ['bite', 'thrash']),
  ]);
  // Ice STAB is x4 against Dragon/Flying; Gyarados has no STAB that hurts it, but Twister (Dragon) does once used.
  const ice = validateTeam([
    snap('b1', 471, 'Glaceon', learned('glaceon').slice(0, 2)),
    snap('b2', 143, 'Snorlax', ['bodyslam', 'rest']),
    snap('b3', 130, 'Gyarados', ['twister', 'bite']),
  ]);
  let e = new MatchEngine([mine, ice], [1, 2, 3, 4]);
  e.apply(['team 123', 'team 123']);
  let v = e.view();
  assert.equal(v.players[1].threat, 4);
  assert.equal(v.players[1].threatBy, 'Ice type');
  assert.equal(v.players[0].threat, 1, 'Dragonite has nothing super effective on Glaceon');
  assert.ok(v.players[1].team.every((m) => typeof m.threat === 'number'));
  const gy = validateTeam([
    snap('c1', 130, 'Gyarados', ['twister', 'bite']),
    snap('c2', 143, 'Snorlax', ['bodyslam', 'rest']),
    snap('c3', 149, 'Dragonite', ['outrage', 'agility']),
  ]);
  e = new MatchEngine([mine, gy], [1, 2, 3, 4]);
  e.apply(['team 123', 'team 123']);
  assert.ok(e.view().players[1].threat < 2, 'before it shows a move, Gyarados is no threat to Dragonite');
  e.apply(['move 2', 'move 1']);
  v = e.view();
  assert.equal(v.players[1].threat, 2);
  assert.equal(v.players[1].threatBy, 'Twister');
});
