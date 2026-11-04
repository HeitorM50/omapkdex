import { Dex } from './deps.mjs';
import { validateTeam, defaultMoves, moveInfo, NATURES } from './profile.mjs';
const rarityOf = (species) => {
  const total = Object.values(species.baseStats).reduce((a, b) => a + b, 0);
  return total >= 540 ? 'rare' : total >= 480 ? 'uncommon' : 'common';
};
const dex = Dex.forGen(5);
const eff = (type, types) => (dex.getImmunity(type, types) ? 2 ** dex.getEffectiveness(type, types) : 0);
const bst = (species) => Object.values(species.baseStats).reduce((a, b) => a + b, 0);
// Best damage multiplier that `from`'s types (STAB) have on `to`.
const stabAgainst = (from, to) => Math.max(...from.map((t) => eff(t, to)));
const hpFraction = (p) => (p.maxhp ? p.hp / p.maxhp : 0);
// ---- Decisions --------------------------------------------------------------------
// Greedy and readable: expected damage with type effectiveness and STAB, a bit of
// noise, and a switch when the active Pokémon is clearly outmatched.
function scoreMove(mon, foe, m) {
  const info = moveInfo(m.id);
  if (info.category === 'Status') return foe.status || hpFraction(mon) < 0.35 ? 5 : 25;
  const stab = mon.getTypes().includes(info.type) ? 1.5 : 1,
    attack = info.category === 'Physical' ? mon.species.baseStats.atk : mon.species.baseStats.spa,
    defense = info.category === 'Physical' ? foe.species.baseStats.def : foe.species.baseStats.spd;
  return info.power * ((info.accuracy || 100) / 100) * stab * eff(info.type, foe.getTypes()) * (attack / defense);
}
function bestSwitch(side, foe) {
  let best = null;
  side.pokemon.forEach((p, i) => {
    if (p.fainted || p.isActive) return;
    const score = -stabAgainst(foe.getTypes(), p.getTypes()) + hpFraction(p) * 0.5 + stabAgainst(p.getTypes(), foe.getTypes()) * 0.25;
    if (!best || score > best.score) best = { slot: i + 1, score };
  });
  return best;
}
export function decide(engine, index, rng = Math.random) {
  const b = engine.battle,
    side = b.sides[index],
    foeSide = b.sides[1 - index],
    state = side.requestState;
  if (state === 'teampreview') {
    const ranked = side.pokemon
      .map((p, i) => ({
        slot: i + 1,
        score:
          bst(p.species) / 100 +
          foeSide.pokemon.reduce((sum, f) => sum + stabAgainst(p.getTypes(), f.getTypes()) - stabAgainst(f.getTypes(), p.getTypes()), 0) / foeSide.pokemon.length +
          rng() * 0.5,
      }))
      .sort((a, c) => c.score - a.score)
      .slice(0, 3);
    return 'team ' + ranked.map((r) => r.slot).join('');
  }
  const foe = foeSide.active[0];
  if (state === 'switch') return 'switch ' + bestSwitch(side, foe).slot;
  const mon = side.active[0],
    request = side.activeRequest.active[0],
    options = request.moves
      .map((m, i) => ({ m, slot: i + 1 }))
      .filter(({ m }) => !m.disabled && (m.pp === undefined || m.pp > 0 || m.id === 'struggle'))
      .map(({ m, slot }) => ({ slot, score: scoreMove(mon, foe, m) * (0.9 + rng() * 0.2) }))
      .sort((a, c) => c.score - a.score);
  const alt = !request.trapped && bestSwitch(side, foe);
  const outmatched = stabAgainst(foe.getTypes(), mon.getTypes()) >= 2 && (options[0]?.score ?? 0) < 60;
  if (alt && outmatched && alt.score > 0 && rng() < 0.6) return 'switch ' + alt.slot;
  return 'move ' + (options[0] ? options[0].slot : 1);
}
// ---- A CPU trainer's team -----------------------------------------------------------
const POOL = dex.species
  .all()
  .filter(
    (s) =>
      s.num >= 1 &&
      s.num <= 649 &&
      !s.forme &&
      !s.isNonstandard &&
      !s.evos.length &&
      !s.tags.length &&
      bst(s) >= 430 &&
      bst(s) <= 600,
  );
export function cpuTeam(level, rng = Math.random, size = 5) {
  const lvl = Math.max(5, Math.min(100, Math.round(level)));
  for (let attempt = 0; attempt < 20; attempt++) {
    const picked = new Map();
    while (picked.size < size) {
      const s = POOL[Math.floor(rng() * POOL.length)];
      picked.set(s.num, s);
    }
    const team = [...picked.values()].map((s, i) => {
      const abilities = Object.entries(s.abilities)
        .filter(([slot]) => slot !== 'H')
        .map(([, name]) => name);
      return {
        companionId: 'cpu-' + (i + 1),
        speciesId: s.num,
        originalLevel: lvl,
        rarity: rarityOf(s),
        set: {
          species: s.name,
          name: s.name,
          level: lvl,
          nature: NATURES[Math.floor(rng() * NATURES.length)],
          ability: abilities[Math.floor(rng() * abilities.length)],
          moves: defaultMoves(s, lvl),
          ivs: { hp: 20, atk: 20, def: 20, spa: 20, spd: 20, spe: 20 },
          evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
          shiny: false,
          gender: s.gender === 'F' ? 'F' : s.gender === 'N' ? '' : 'M',
        },
      };
    });
    try {
      return validateTeam(team);
    } catch {
      // A random pick that the validator dislikes (rare): draw another team.
    }
  }
  throw Error('Could not build a CPU team');
}
