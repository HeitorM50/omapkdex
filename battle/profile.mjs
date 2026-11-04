import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import { Dex, TeamValidator } from './deps.mjs';
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
const statNames = {
  hp: 'hp',
  attack: 'atk',
  defense: 'def',
  'special-attack': 'spa',
  'special-defense': 'spd',
  speed: 'spe',
};
const statLabels = { hp: 'HP', attack: 'Atk', defense: 'Def', 'special-attack': 'SpA', 'special-defense': 'SpD', speed: 'Spe' };
const matchupCache = new Map();
// Defensive multipliers per attacking type, plus the types the species' own
// types hit for double (STAB). Gen 5 chart, same engine that resolves battles.
function matchups(types) {
  const key = types.join('/');
  if (matchupCache.has(key)) return matchupCache.get(key);
  const all = dex.types.names(),
    out = { weak: [], resist: [], immune: [], strong: [] };
  for (const type of all) {
    if (!dex.getImmunity(type, types)) out.immune.push({ type, mult: 0 });
    else {
      const mod = dex.getEffectiveness(type, types);
      if (mod > 0) out.weak.push({ type, mult: 2 ** mod });
      else if (mod < 0) out.resist.push({ type, mult: 2 ** mod });
    }
    if (types.some((own) => dex.getImmunity(own, [type]) && dex.getEffectiveness(own, [type]) > 0))
      out.strong.push({ type, mult: 2 });
  }
  out.weak.sort((a, b) => b.mult - a.mult);
  out.resist.sort((a, b) => a.mult - b.mult);
  matchupCache.set(key, out);
  return out;
}
export const NATURES = P.NATURES;
export const RARITIES = ['common', 'uncommon', 'rare', 'legendary', 'mythical'];
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
        schemaVersion: 2,
        trainerId: randomUUID(),
        displayName: 'Trainer',
        avatarKey: 'pokeball',
        team: [],
        createdAt: Date.now(),
      };
      writeJSON(this.file, p);
    } else if (!Array.isArray(p.team)) {
      // Profiles saved before teams: the single battle Pokémon becomes the first slot.
      p.team = p.selectedCompanionId ? [{ companionId: p.selectedCompanionId, moves: null }] : [];
      delete p.selectedCompanionId;
      p.schemaVersion = 2;
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
    if (changes.team !== undefined) p.team = checkTeam(roster(this.dir), changes.team);
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
          current ? B.growthMultiplier(state, C.hasGraduatedLine(col, e.speciesId)) : 1,
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
        rarity: e.rarity || 'common',
        types: species.types,
        ability: abilityOf(species, e.companionId) || '',
        moves: defaultMoves(species, level).map(moveInfo),
        stats: P.statsFor(
          Object.fromEntries(Object.entries(statNames).map(([name, key]) => [name, species.baseStats[key]])),
          P.ivsFor(P.seedFor(e.companionId)),
          level,
          entry.nature || 'hardy',
        ).map((s) => ({ key: s.name, label: statLabels[s.name], base: s.base, value: s.value })),
        matchups: matchups(species.types),
        entry,
      };
    })
    .filter(Boolean);
}
// ---- Moves: what the Pokémon would have learned by its level ---------------
// Level-up moves of its own species and of the pre-evolutions it went through,
// Gen 5 data only. No TMs, tutors or egg moves.
const banned = (m) => !!m.ohko || m.id === 'doubleteam' || m.id === 'minimize';
function learnable(species, level) {
  const best = new Map();
  for (let s = species; s && s.exists; s = s.prevo ? dex.species.get(s.prevo) : null)
    for (const [name, sources] of Object.entries(Dex.data.Learnsets[s.id]?.learnset || {}))
      for (const source of sources) {
        if (!/^5L\d+$/.test(source)) continue;
        const at = Number(source.slice(2));
        if (at <= level && (!best.has(name) || at < best.get(name))) best.set(name, at);
      }
  return [...best]
    .filter(([name]) => !banned(dex.moves.get(name)))
    .map(([name, at]) => ({ name, level: at }))
    .sort((a, b) => a.level - b.level || (a.name < b.name ? -1 : 1));
}
export function defaultMoves(species, level) {
  const moves = learnable(species, level).slice(-4).map((m) => m.name);
  // A species with nothing before this level still gets the generation's base move.
  return moves.length ? moves : ['struggle'];
}
// ---- What a move does besides damage, in words --------------------------------------
// kind: "cost" (a drawback for the user), "bonus" (a perk) or "info" (a rule worth knowing).
const STAT = { atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe', accuracy: 'Acc', evasion: 'Eva' };
const STATUS = { brn: 'burn', par: 'paralysis', psn: 'poison', tox: 'bad poison', slp: 'sleep', frz: 'freeze' };
const pct = ([a, b]) => Math.round((100 * a) / b) + '%';
const boostText = (boosts) =>
  Object.entries(boosts)
    .map(([k, v]) => STAT[k] + ' ' + (v > 0 ? '+' : '−') + Math.abs(v))
    .join(', ');
const NOTES = {
  focuspunch: ['cost', 'Fails if you are hit before it moves'],
  suckerpunch: ['cost', 'Fails unless the target is about to attack'],
  fakeout: ['info', 'Only works on your first turn out'],
  bellydrum: ['cost', 'Costs half your HP to max out Atk'],
  rest: ['cost', 'You fall asleep for 2 turns (full heal)'],
  substitute: ['cost', 'Costs a quarter of your HP'],
  endeavor: ['info', 'Lowers the target to your HP'],
  counter: ['info', 'Returns double the physical damage taken'],
  mirrorcoat: ['info', 'Returns double the special damage taken'],
  destinybond: ['info', 'If it KOs you, the attacker faints too'],
  perishsong: ['cost', 'Every Pokémon faints in 3 turns unless it switches out'],
  lastresort: ['cost', 'Only works after using all your other moves'],
  dreameater: ['cost', 'Only works on a sleeping target'],
  snore: ['cost', 'Only works while you are asleep'],
  sleeptalk: ['cost', 'Only works while you are asleep'],
  healingwish: ['info', 'Fully heals the next Pokémon you send out'],
  lunardance: ['info', 'Fully heals the next Pokémon you send out'],
  wish: ['info', 'Heals half your HP next turn'],
  bide: ['cost', 'Stores damage for 2 turns, then hits back double'],
  curse: ['cost', 'On a Ghost: costs half your HP to curse the target'],
  memento: ['info', 'Sharply lowers the target’s Atk and SpA'],
  facade: ['bonus', 'Power doubles if you are burned, poisoned or paralyzed'],
  avalanche: ['info', 'Power doubles if you were hit first'],
  revenge: ['info', 'Power doubles if you were hit first'],
  payback: ['info', 'Power doubles if the target moved first'],
  brine: ['info', 'Power doubles if the target is below half HP'],
  flail: ['info', 'Stronger the lower your HP'],
  reversal: ['info', 'Stronger the lower your HP'],
  eruption: ['cost', 'Weaker as your HP drops'],
  waterspout: ['cost', 'Weaker as your HP drops'],
};
export function effectsOf(m) {
  const out = [],
    add = (kind, text) => out.push({ kind, text });
  const sign = (boosts, who, costOnly) => {
    const down = Object.fromEntries(Object.entries(boosts).filter(([, v]) => v < 0)),
      up = Object.fromEntries(Object.entries(boosts).filter(([, v]) => v > 0));
    if (Object.keys(down).length) add(who === 'you' ? 'cost' : 'info', boostText(down) + (who === 'you' ? ' to you' : ' to the target'));
    if (Object.keys(up).length && !costOnly) add(who === 'you' ? 'bonus' : 'info', boostText(up) + (who === 'you' ? ' to you' : ' to the target'));
  };
  if (m.self?.volatileStatus === 'lockedmove') add('cost', 'Locks you in for 2–3 turns, then confuses you');
  if (m.id === 'rollout' || m.id === 'iceball') add('cost', 'Locks you in for 5 turns (power doubles each turn)');
  if (m.id === 'uproar') add('cost', 'Locks you in for 3 turns; nobody can sleep');
  if (m.flags.recharge) add('cost', 'You must recharge next turn');
  if (m.flags.charge) add('cost', 'Charges first, then hits next turn');
  if (m.recoil) add('cost', 'Recoil: ' + pct(m.recoil) + ' of the damage');
  if (m.struggleRecoil) add('cost', 'Recoil: a quarter of your max HP');
  if (m.hasCrashDamage) add('cost', 'You take crash damage if it misses');
  if (m.selfdestruct) add('cost', m.selfdestruct === 'always' ? 'You faint' : 'You faint if it works');
  if (m.self?.boosts) sign(m.self.boosts, 'you');
  if (m.boosts) sign(m.boosts, m.target === 'self' ? 'you' : 'target');
  if (m.drain) add('bonus', 'Heals you ' + pct(m.drain) + ' of the damage dealt');
  if (m.heal) add('bonus', 'Heals you ' + pct(m.heal) + ' of your HP');
  if (m.status) add('info', 'Inflicts ' + (STATUS[m.status] || m.status));
  if (m.volatileStatus === 'confusion') add('info', 'Confuses the target');
  for (const s of m.secondaries || (m.secondary ? [m.secondary] : [])) {
    const chance = s.chance ? s.chance + '% to ' : '';
    if (s.status) add('bonus', chance + 'inflict ' + (STATUS[s.status] || s.status));
    else if (s.volatileStatus === 'flinch') add('bonus', chance + 'make the target flinch');
    else if (s.volatileStatus === 'confusion') add('bonus', chance + 'confuse the target');
    else if (s.boosts) add('bonus', (s.chance ? s.chance + '%: ' : '') + boostText(s.boosts) + ' to the target');
    else if (s.self?.boosts) add('bonus', (s.chance ? s.chance + '%: ' : '') + boostText(s.self.boosts) + ' to you');
  }
  if (m.forceSwitch) add('info', 'Forces the target to switch out');
  if (m.selfSwitch) add('info', m.selfSwitch === 'copyvolatile' ? 'Switches you out, passing stat changes' : 'Switches you out after hitting');
  if (m.priority > 0) add('info', '+' + m.priority + ' priority: moves first');
  if (m.priority < 0) add('cost', 'Priority −' + Math.abs(m.priority) + ': moves last');
  if (Array.isArray(m.multihit)) add('info', 'Hits ' + m.multihit.join('–') + ' times');
  else if (m.multihit) add('info', 'Hits ' + m.multihit + ' times');
  if (m.willCrit) add('info', 'Always a critical hit');
  else if (m.critRatio > 1) add('info', 'High critical-hit rate');
  if (m.stallingMove) add('info', 'Can fail if used again right away');
  if (NOTES[m.id]) add(...NOTES[m.id]);
  // Drawbacks first; keep the tags short enough to read at a glance.
  const rank = { cost: 0, bonus: 1, info: 2 };
  return out.sort((a, b) => rank[a.kind] - rank[b.kind]).slice(0, 5);
}
export function moveInfo(name) {
  const m = dex.moves.get(name);
  return {
    effects: effectsOf(m),
    id: m.id,
    name: m.name,
    type: m.type,
    category: m.category,
    power: m.basePower || 0,
    accuracy: m.accuracy === true ? 0 : m.accuracy,
    pp: m.pp,
  };
}
// Moves the editor offers for one Pokémon, with the picks currently in effect.
export function learnset(dir, companionId, team) {
  const r = roster(dir).find((r) => r.companionId === companionId);
  if (!r) throw Error('Choose a captured Pokémon');
  const species = dex.species.get(r.name),
    entry = team.find((t) => t.companionId === companionId);
  return {
    companionId,
    level: r.level,
    moves: learnable(species, r.level).map((m) => ({ ...moveInfo(m.name), learnedAt: m.level })),
    selected: (entry?.moves || defaultMoves(species, r.level)).map((n) => dex.moves.get(n).id),
    custom: !!entry?.moves,
  };
}
// ---- Teams -------------------------------------------------------------------
export const FORMAT =
  'gen5customgame@@@Picked Team Size = 3,Species Clause,Sleep Clause Mod,OHKO Clause,Evasion Moves Clause,Endless Battle Clause';
export const TEAM_MIN = 3,
  TEAM_MAX = 6,
  PICK = 3;
function checkTeam(list, team) {
  if (!Array.isArray(team) || team.length > TEAM_MAX) throw Error('A team has at most ' + TEAM_MAX + ' Pokémon');
  const seen = new Set(),
    species = new Set();
  return team.map((t) => {
    const r = list.find((r) => r.companionId === t?.companionId);
    if (!r) throw Error('Choose captured Pokémon');
    if (seen.has(r.companionId)) throw Error('Each Pokémon can join the team once');
    if (species.has(r.speciesId)) throw Error('Species Clause: one ' + r.name + ' per team');
    seen.add(r.companionId);
    species.add(r.speciesId);
    if (t.moves === undefined || t.moves === null) return { companionId: r.companionId, moves: null };
    if (!Array.isArray(t.moves) || t.moves.length < 1 || t.moves.length > 4)
      throw Error('Choose 1 to 4 moves for ' + r.name);
    const allowed = new Set(learnable(dex.species.get(r.name), r.level).map((m) => dex.moves.get(m.name).id)),
      ids = t.moves.map((n) => dex.moves.get(n).id);
    if (new Set(ids).size !== ids.length) throw Error('Repeated move for ' + r.name);
    for (const mid of ids) if (!allowed.has(mid)) throw Error(r.name + ' cannot use that move at Lv ' + r.level);
    return { companionId: r.companionId, moves: ids };
  });
}
// Frozen at readiness: reached species, deterministic IVs, nature, ability, gender,
// shiny flag, level and the chosen (or default) moves. No items, EVs at zero.
function abilityOf(species, companionId) {
  const abilities = Object.entries(species.abilities).map(([slot, name]) => ({
    name,
    slot: slot === 'H' ? 3 : Number(slot) + 1,
    isHidden: slot === 'H',
  }));
  return P.abilityFor(P.seedFor(companionId), abilities)?.name;
}
function build(r, chosen) {
  const species = dex.species.get(r.name),
    seed = P.seedFor(r.companionId),
    ivs = P.ivsFor(seed);
  const ability = abilityOf(species, r.companionId);
  const moves = chosen || defaultMoves(species, r.level);
  const gender = P.genderFor(
    seed,
    species.gender === 'N' ? -1 : Math.round((species.genderRatio?.F || 0) * 8),
  );
  const set = {
    species: species.name,
    name: species.name,
    level: r.level,
    nature: r.nature,
    ability,
    moves,
    shiny: r.shiny,
    gender: gender === 'genderless' ? '' : gender === 'female' ? 'F' : 'M',
    ivs: Object.fromEntries(Object.entries(statKeys).map(([name, key]) => [key, ivs[name]])),
    evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
  };
  return { companionId: r.companionId, speciesId: r.speciesId, originalLevel: r.level, rarity: r.rarity, set };
}
export function teamSnapshots(dir, team, list = roster(dir)) {
  const picks = checkTeam(list, team);
  if (picks.length < TEAM_MIN) throw Error('Build a team of at least ' + TEAM_MIN + ' Pokémon in Trainer');
  return validateTeam(picks.map((t) => build(list.find((r) => r.companionId === t.companionId), t.moves)));
}
export function validateTeam(team) {
  if (!Array.isArray(team) || team.length < TEAM_MIN || team.length > TEAM_MAX) throw Error('Invalid team size');
  const clean = team.map(validateSnapshot);
  if (new Set(clean.map((s) => s.companionId)).size !== clean.length) throw Error('Repeated Pokémon in team');
  const problems = TeamValidator.get(FORMAT).validateTeam(clean.map((s) => structuredClone(s.set)));
  if (problems) throw Error(problems[0]);
  return clean;
}
export function validateSnapshot(s) {
  if (!s || typeof s !== 'object' || typeof s.companionId !== 'string' || s.companionId.length > 80)
    throw Error('Invalid Pokémon snapshot');
  const set = s.set || {},
    species = dex.species.get(set.species);
  if (typeof set.species !== 'string' || typeof set.nature !== 'string' || typeof set.ability !== 'string')
    throw Error('Invalid team fields');
  if (!species.exists || species.gen > 5 || species.num !== s.speciesId || species.battleOnly)
    throw Error('Invalid Gen 5 species');
  if (!Number.isInteger(set.level) || set.level < 5 || set.level > 100) throw Error('Invalid level');
  if (!Number.isInteger(s.originalLevel) || s.originalLevel < 5 || s.originalLevel > 100 || set.level !== s.originalLevel)
    throw Error('Invalid original level');
  if (!P.NATURES.includes(String(set.nature).toLowerCase())) throw Error('Invalid nature');
  if (!Object.values(species.abilities).some((a) => dex.toID(a) === dex.toID(set.ability)))
    throw Error('Invalid ability');
  if (
    !Array.isArray(set.moves) ||
    !set.moves.length ||
    set.moves.length > 4 ||
    new Set(set.moves.map((n) => dex.toID(n))).size !== set.moves.length
  )
    throw Error('Invalid moves');
  const allowed = new Set(learnable(species, s.originalLevel).map((m) => dex.moves.get(m.name).id));
  for (const name of set.moves) {
    if (typeof name !== 'string' || name.length > 80) throw Error('Invalid move name');
    const m = dex.moves.get(name);
    if (!m.exists || m.gen > 5) throw Error('Invalid Gen 5 move');
    if (!allowed.has(m.id) && !(m.id === 'struggle' && !allowed.size))
      throw Error('Moves do not match this Pokémon’s Gen 5 level-up profile');
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
    // Cosmetic: shown to the opponent, never used by the simulator.
    rarity: RARITIES.includes(s.rarity) ? s.rarity : 'common',
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
