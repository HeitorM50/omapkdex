import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import { Dex } from './deps.mjs';
import { ROOT, readJSON, writeJSON, text } from './storage.mjs';
function library(name) {
  const ctx = vm.createContext({});
  vm.runInContext(readFileSync(join(ROOT, name), 'utf8').replace(/^\.pragma library\s*/m, ''), ctx);
  return ctx;
}
const C = library('Collection.js'),
  P = library('Profile.js'),
  B = library('Balance.js'),
  dex = Dex.forGen(5);
const statKeys = {
  hp: 'hp',
  attack: 'atk',
  defense: 'def',
  'special-attack': 'spa',
  'special-defense': 'spd',
  speed: 'spe',
};
export const AVATARS = ['pokeball', 'greatball', 'ultraball'];
export class TrainerStore {
  constructor(dir) {
    this.dir = dir;
    this.file = join(dir, 'trainer.json');
    this.historyFile = join(dir, 'battle-history.json');
  }
  get() {
    let p = readJSON(this.file, null);
    if (!p) {
      p = {
        schemaVersion: 1,
        trainerId: randomUUID(),
        displayName: 'Trainer',
        avatarKey: 'pokeball',
        selectedCompanionId: '',
        createdAt: Date.now(),
      };
      writeJSON(this.file, p);
    }
    return p;
  }
  update(changes) {
    const p = this.get();
    if (changes.displayName !== undefined) p.displayName = text(changes.displayName);
    if (changes.avatarKey !== undefined) {
      if (!AVATARS.includes(changes.avatarKey)) throw Error('Choose a local avatar');
      p.avatarKey = changes.avatarKey;
    }
    if (changes.selectedCompanionId !== undefined) {
      if (!roster(this.dir).some((r) => r.companionId === changes.selectedCompanionId))
        throw Error('Choose a captured Pokémon');
      p.selectedCompanionId = changes.selectedCompanionId;
    }
    writeJSON(this.file, p);
    return p;
  }
  record(result) {
    const h = readJSON(this.historyFile, {});
    if (h[result.matchId]) return;
    h[result.matchId] = { ...result, at: Date.now() };
    writeJSON(this.historyFile, h);
  }
  history() {
    return Object.values(readJSON(this.historyFile, {})).sort((a, b) => b.at - a.at);
  }
  stats() {
    const h = this.history();
    return {
      wins: h.filter((r) => r.result === 'win').length,
      losses: h.filter((r) => r.result === 'loss').length,
      draws: h.filter((r) => r.result === 'draw').length,
    };
  }
}
export function roster(dir) {
  const col = readJSON(join(dir, 'collection.json'), { entries: [] }),
    state = readJSON(join(dir, 'state.json'), {}),
    comp = readJSON(join(dir, 'companion.json'), null);
  return C.entriesOf(col)
    .filter(
      (e) =>
        typeof e.companionId === 'string' &&
        e.companionId.length > 0 &&
        !e.releasedAt &&
        !(e.dittoDisguise && !e.dittoRevealed) &&
        !(e.companionId === comp?.companionId && !state.hatched),
    )
    .map((e) => {
      const forms = C.speciesReached(e),
        form = forms.at(-1);
      if (!form) return null;
      const current = e.companionId === comp?.companionId && !e.graduatedAt;
      const entry = { ...e, nature: current ? comp.nature : e.nature };
      const species = dex.species.get(form.name);
      if (!species.exists || species.num !== form.id || species.gen > 5) return null;
      const th = (e.line || []).map((_, i) =>
        B.phaseThreshold(
          e.rarity,
          e.line.length,
          i,
          state.difficulty || 1,
          current && C.hasGraduatedLine(col, e.speciesId) ? 2 : 1,
        ),
      );
      const level = P.levelFor({
        thresholds: th,
        stage: current ? state.stage : e.finalStage,
        tokensIntoStage: current ? state.tokensIntoStage : 0,
        graduated: !!e.graduatedAt,
      });
      return {
        companionId: e.companionId,
        speciesId: form.id,
        name: species.name,
        level,
        nature: entry.nature || 'hardy',
        shiny: C.visibleShiny(e),
        sprite: form.sprite || '',
        entry,
      };
    })
    .filter(Boolean);
}
export function snapshot(dir, companionId, mode) {
  if (!['level50', 'natural'].includes(mode)) throw Error('Unknown level format');
  const r = roster(dir).find((r) => r.companionId === companionId);
  if (!r) throw Error('Selected Pokémon is not available');
  const species = dex.species.get(r.name),
    seed = P.seedFor(companionId),
    ivs = P.ivsFor(seed);
  const abilities = Object.entries(species.abilities).map(([slot, name]) => ({
    name,
    slot: slot === 'H' ? 3 : Number(slot) + 1,
    isHidden: slot === 'H',
  }));
  const ability = P.abilityFor(seed, abilities)?.name;
  const learned = Object.entries(Dex.data.Learnsets[species.id]?.learnset || {}).flatMap(([name, sources]) =>
    sources.filter((s) => /^5L\d+$/.test(s)).map((s) => ({ name, level: Number(s.slice(2)) })),
  );
  const moves = P.movesFor(learned, r.level).map((m) => m.name);
  // Species with no Gen 5 level-up entry still get the generation's base move.
  if (!moves.length) moves.push('struggle');
  const gender = P.genderFor(
    seed,
    species.gender === 'N' ? -1 : Math.round((species.genderRatio?.F || 0) * 8),
  );
  const set = {
    species: species.name,
    name: species.name,
    level: mode === 'level50' ? 50 : r.level,
    nature: r.nature,
    ability,
    moves,
    shiny: r.shiny,
    gender: gender === 'genderless' ? '' : gender === 'female' ? 'F' : 'M',
    ivs: Object.fromEntries(Object.entries(statKeys).map(([name, key]) => [key, ivs[name]])),
    evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
  };
  return { companionId: r.companionId, speciesId: r.speciesId, originalLevel: r.level, set };
}
export function validateSnapshot(s, mode) {
  if (!s || typeof s !== 'object' || typeof s.companionId !== 'string' || s.companionId.length > 80)
    throw Error('Invalid Pokémon snapshot');
  const set = s.set || {},
    species = dex.species.get(set.species);
  if (typeof set.species !== 'string' || typeof set.nature !== 'string' || typeof set.ability !== 'string')
    throw Error('Invalid team fields');
  if (!species.exists || species.gen > 5 || species.num !== s.speciesId || species.battleOnly)
    throw Error('Invalid Gen 5 species');
  if (
    !Number.isInteger(set.level) ||
    set.level < 5 ||
    set.level > 100 ||
    (mode === 'level50' && set.level !== 50)
  )
    throw Error('Invalid level');
  if (
    !Number.isInteger(s.originalLevel) ||
    s.originalLevel < 5 ||
    s.originalLevel > 100 ||
    (mode === 'natural' && set.level !== s.originalLevel)
  )
    throw Error('Invalid original level');
  if (!P.NATURES.includes(String(set.nature).toLowerCase())) throw Error('Invalid nature');
  if (!Object.values(species.abilities).some((a) => dex.toID(a) === dex.toID(set.ability)))
    throw Error('Invalid ability');
  if (
    !Array.isArray(set.moves) ||
    !set.moves.length ||
    set.moves.length > 4 ||
    new Set(set.moves).size !== set.moves.length
  )
    throw Error('Invalid moves');
  const learned = Object.entries(Dex.data.Learnsets[species.id]?.learnset || {}).flatMap(([name, sources]) =>
    sources
      .filter((source) => /^5L\d+$/.test(source))
      .map((source) => ({ name, level: Number(source.slice(2)) })),
  );
  const expected = P.movesFor(learned, s.originalLevel).map((m) => m.name);
  if (!expected.length) expected.push('struggle');
  if (JSON.stringify(expected) !== JSON.stringify(set.moves))
    throw Error('Moves do not match this Pokémon’s Gen 5 level-up profile');
  for (const name of set.moves) {
    if (typeof name !== 'string' || name.length > 80) throw Error('Invalid move name');
    const m = dex.moves.get(name);
    if (!m.exists || m.gen > 5) throw Error('Invalid Gen 5 move');
  }
  for (const key of Object.values(statKeys))
    if (!Number.isInteger(set.ivs?.[key]) || set.ivs[key] < 0 || set.ivs[key] > 31 || set.evs?.[key] !== 0)
      throw Error('Invalid IVs/EVs');
  if (!['M', 'F', ''].includes(set.gender) || typeof set.shiny !== 'boolean')
    throw Error('Invalid appearance');
  // Rebuild an allowlisted team; never trust arbitrary simulator fields.
  return {
    companionId: s.companionId,
    speciesId: species.num,
    originalLevel: s.originalLevel,
    set: {
      species: species.name,
      name: species.name,
      level: set.level,
      nature: set.nature,
      ability: set.ability,
      moves: [...set.moves],
      ivs: Object.fromEntries(Object.values(statKeys).map((key) => [key, set.ivs[key]])),
      evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      shiny: set.shiny,
      gender: set.gender,
    },
  };
}
