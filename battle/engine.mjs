import { Battle, Dex } from './deps.mjs';
import { createHash } from 'node:crypto';
import { validateTeam, moveInfo, FORMAT } from './profile.mjs';
// The only choices a peer may send: pick the team at preview, a move, or a switch.
export const CHOICE = /^(team [1-6]{3}|move [1-4]|switch [1-6])$/;
const dex = Dex.forGen(5);
const VOLATILES = ['confusion', 'substitute', 'leechseed', 'taunt', 'encore', 'attract', 'curse', 'nightmare'];
const effectiveness = (type, types) => (dex.getImmunity(type, types) ? 2 ** dex.getEffectiveness(type, types) : 0);
const BOOSTS = ['atk', 'def', 'spa', 'spd', 'spe', 'accuracy', 'evasion'];
// One decision point of the battle is a "round": each side that the simulator is
// waiting on sends one choice (both at team preview and on a normal turn, just the
// side with a fainted Pokémon on a forced switch). The battle turn does not advance
// on every round, so the round index is the length of the saved choice history.
export class MatchEngine {
  constructor(teams, seed) {
    if (
      !Array.isArray(seed) ||
      seed.length !== 4 ||
      !seed.every((v) => Number.isInteger(v) && v >= 0 && v <= 65535)
    )
      throw Error('Invalid battle seed');
    if (!Array.isArray(teams) || teams.length !== 2) throw Error('Two teams are required');
    this.teams = teams.map(validateTeam);
    this.battle = new Battle({ formatid: FORMAT, seed: [...seed] });
    this.teams.forEach((team, i) =>
      this.battle.setPlayer('p' + (i + 1), {
        name: 'Player ' + (i + 1),
        team: team.map((s) => structuredClone(s.set)),
      }),
    );
  }
  needs() {
    if (this.battle.ended) return [false, false];
    return this.battle.sides.map((side) => !!side.requestState);
  }
  phase() {
    return this.battle.ended ? 'ended' : this.battle.requestState === 'teampreview' ? 'teampreview' : 'battle';
  }
  legal(index, choice) {
    if (typeof choice !== 'string' || !CHOICE.test(choice)) throw Error('Invalid choice');
    const side = this.battle.sides[index],
      state = side.requestState,
      [kind, arg] = choice.split(' ');
    if (!state) throw Error('Nothing to choose right now');
    if (state === 'teampreview') {
      if (kind !== 'team') throw Error('Pick your team first');
      const picks = [...arg];
      if (new Set(picks).size !== picks.length) throw Error('Repeated Pokémon in the pick');
      if (picks.some((n) => Number(n) > side.pokemon.length)) throw Error('No such Pokémon');
      return;
    }
    if (kind === 'team') throw Error('The team is already chosen');
    if (kind === 'move') {
      if (state !== 'move') throw Error('Choose a replacement first');
      const move = side.activeRequest?.active?.[0]?.moves?.[Number(arg) - 1];
      if (!move || move.disabled || (move.pp !== undefined && move.pp <= 0 && move.id !== 'struggle'))
        throw Error('Move unavailable');
      return;
    }
    const target = side.pokemon[Number(arg) - 1];
    if (!target || target.fainted || Number(arg) <= side.active.length) throw Error('Cannot switch to that Pokémon');
    if (state === 'move' && side.activeRequest?.active?.[0]?.trapped) throw Error('Your Pokémon is trapped');
  }
  // What the simulator itself would pick ("default"): used when the turn timer runs out.
  defaultChoice(index) {
    const side = this.battle.sides[index],
      state = side.requestState;
    if (state === 'teampreview')
      return 'team ' + side.pokemon.slice(0, 3).map((_, i) => i + 1).join('');
    if (state === 'switch')
      return 'switch ' + (side.pokemon.findIndex((p) => !p.fainted && !p.isActive) + 1);
    const moves = side.activeRequest.active[0].moves,
      i = moves.findIndex((m) => !m.disabled && (m.pp === undefined || m.pp > 0 || m.id === 'struggle'));
    return 'move ' + (i < 0 ? 1 : i + 1);
  }
  field() {
    const b = this.battle,
      weather = b.field.weather || '';
    return {
      weather: weather ? dex.conditions.get(weather).name : '',
      sides: b.sides.map((side) =>
        Object.entries(side.sideConditions).map(([id, value]) => ({
          id,
          name: dex.conditions.get(id).name,
          layers: value.layers || 0,
        })),
      ),
    };
  }
  // Moves each Pokémon has already used: the only move information that is public.
  revealed() {
    const map = new Map();
    for (const line of this.battle.log) {
      if (!line.startsWith('|move|')) continue;
      const [, , who, name] = line.split('|'),
        key = (who.startsWith('p1') ? 0 : 1) + ':' + who.slice(who.indexOf(': ') + 2);
      if (!map.has(key)) map.set(key, new Set());
      map.get(key).add(dex.moves.get(name).id);
    }
    return map;
  }
  // The best damage multiplier this Pokémon can have on the other side's active one,
  // from public information only: its types (STAB) and the moves it has already used.
  threatOn(sideIndex, p, revealed) {
    const foe = this.battle.sides[1 - sideIndex].active[0];
    if (!foe || foe.fainted || p.fainted) return { multiplier: 1, by: '' };
    const against = foe.getTypes();
    let best = { multiplier: 0, by: '' };
    for (const type of p.getTypes()) {
      const e = effectiveness(type, against);
      if (e > best.multiplier) best = { multiplier: e, by: type + ' type' };
    }
    for (const id of revealed.get(sideIndex + ':' + p.name) || []) {
      const m = dex.moves.get(id);
      if (m.category === 'Status' || !m.basePower) continue;
      const e = effectiveness(m.type, against);
      if (e > best.multiplier) best = { multiplier: e, by: m.name };
    }
    return best;
  }
  rarityOf(sideIndex, p) {
    return this.teams[sideIndex].find((s) => s.set.species === p.species.name)?.rarity || 'common';
  }
  member(side, p, index, revealed) {
    const sideIndex = this.battle.sides.indexOf(side),
      threat = this.threatOn(sideIndex, p, revealed);
    return {
      rarity: this.rarityOf(sideIndex, p),
      threat: threat.multiplier,
      threatBy: threat.by,
      slot: index + 1,
      name: p.species.name,
      speciesId: p.species.num,
      hp: p.hp,
      maxhp: p.maxhp,
      status: p.status || '',
      level: p.level,
      shiny: !!p.set.shiny,
      fainted: p.fainted,
      active: p.isActive,
      types: p.getTypes(),
    };
  }
  view() {
    const b = this.battle,
      needs = this.needs(),
      revealed = this.revealed();
    return {
      turn: b.turn,
      finished: b.ended,
      winner: b.ended ? (b.winner === 'Player 1' ? 0 : b.winner === 'Player 2' ? 1 : null) : null,
      phase: this.phase(),
      needs,
      field: this.field(),
      players: b.sides.map((side, i) => {
        const mon = side.active[0] || side.pokemon[0],
          request = side.activeRequest?.active?.[0],
          team = side.pokemon.map((p, n) => this.member(side, p, n, revealed)),
          threat = this.threatOn(i, mon, revealed);
        return {
          name: mon.species.name,
          speciesId: mon.species.num,
          hp: mon.hp,
          maxhp: mon.maxhp,
          status: mon.status || '',
          level: mon.level,
          shiny: !!mon.set.shiny,
          rarity: this.rarityOf(i, mon),
          threat: threat.multiplier,
          threatBy: threat.by,
          ability: mon.ability ? dex.abilities.get(mon.ability).name : '',
          types: mon.getTypes(),
          boosts: Object.fromEntries(BOOSTS.filter((k) => mon.boosts[k]).map((k) => [k, mon.boosts[k]])),
          volatiles: VOLATILES.filter((k) => mon.volatiles[k]),
          request: needs[i] ? side.requestState : '',
          team,
          moves: (request?.moves || []).map((m) => {
            const info = moveInfo(m.id),
              foe = b.sides[1 - i].active[0],
              // A locked-in move (Outrage, Thrash...) arrives without PP: read them from the slot.
              slot = mon.moveSlots.find((x) => x.id === m.id);
            return {
              name: m.move,
              id: m.id,
              type: info.type,
              category: info.category,
              effects: info.effects,
              power: info.power,
              accuracy: info.accuracy,
              // Damage multiplier against the opponent's active types; null for status moves.
              effect: foe && info.category !== 'Status' ? effectiveness(info.type, foe.getTypes()) : null,
              pp: m.pp ?? slot?.pp,
              maxpp: m.maxpp ?? slot?.maxpp,
              disabled: !!m.disabled,
            };
          }),
          trapped: !!request?.trapped,
        };
      }),
      log: this.log(),
    };
  }
  // The simulator logs each private/public pair behind a `|split|` marker; keep the
  // public line only, and drop wall-clock timestamps.
  log(limit = 120) {
    const out = [],
      lines = this.battle.log;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('|split|')) {
        i += 1;
        continue;
      }
      if (!lines[i].startsWith('|t:|')) out.push(lines[i]);
    }
    return limit ? out.slice(-limit) : out;
  }
  apply(actions) {
    const b = this.battle;
    if (b.ended) throw Error('Battle already finished');
    const needs = this.needs();
    if (!Array.isArray(actions) || actions.length !== 2) throw Error('Invalid round');
    actions.forEach((choice, i) => {
      if (!!choice !== needs[i]) throw Error('Unexpected or missing choice');
      if (choice) this.legal(i, choice);
    });
    const done = [];
    try {
      actions.forEach((choice, i) => {
        if (!choice) return;
        if (!b.choose('p' + (i + 1), choice)) throw Error('Choice rejected');
        done.push(i);
      });
    } catch (e) {
      done.forEach((i) => b.undoChoice('p' + (i + 1)));
      throw e;
    }
    if (b.turn > 300 && !b.ended) b.tie();
    return this.view();
  }
  forfeit(index) {
    if (!this.battle.ended) this.battle.win(this.battle.sides[1 - index]);
    return this.view();
  }
  digest() {
    const state = this.battle.toJSON();
    state.log = (state.log || []).filter((line) => !line.startsWith('|t:|'));
    return createHash('sha256').update(JSON.stringify(state)).digest('hex');
  }
  destroy() {
    this.battle.destroy();
  }
}
