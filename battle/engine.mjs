import { Battle } from './deps.mjs';
import { createHash } from 'node:crypto';
import { validateSnapshot } from './profile.mjs';
export class MatchEngine {
  constructor(snapshots, seed, mode = 'level50') {
    if (
      !Array.isArray(seed) ||
      seed.length !== 4 ||
      !seed.every((v) => Number.isInteger(v) && v >= 0 && v <= 65535)
    )
      throw Error('Invalid battle seed');
    this.snapshots = snapshots.map((s) => validateSnapshot(s, mode));
    this.battle = new Battle({ formatid: 'gen5customgame', seed: [...seed] });
    this.snapshots.forEach((s, i) =>
      this.battle.setPlayer('p' + (i + 1), { name: 'Player ' + (i + 1), team: [structuredClone(s.set)] }),
    );
    if (this.battle.requestState === 'teampreview') {
      this.battle.choose('p1', 'team 1');
      this.battle.choose('p2', 'team 1');
    }
  }
  view() {
    const b = this.battle;
    return {
      turn: b.turn,
      finished: b.ended,
      winner: b.ended ? (b.winner === 'Player 1' ? 0 : b.winner === 'Player 2' ? 1 : null) : null,
      players: b.sides.map((s, i) => {
        const mon = s.active[0] || s.pokemon[0],
          request = s.activeRequest?.active?.[0];
        return {
          name: mon.species.name,
          speciesId: mon.species.num,
          hp: mon.hp,
          maxhp: mon.maxhp,
          status: mon.status || '',
          level: mon.level,
          shiny: this.snapshots[i].set.shiny,
          moves: (request?.moves || []).map((m) => ({
            name: m.move,
            id: m.id,
            pp: m.pp,
            maxpp: m.maxpp,
            disabled: !!m.disabled,
          })),
          trapped: !!request?.trapped,
        };
      }),
      log: b.log.filter((s) => !s.startsWith('|split|') && !s.startsWith('|t:|')).slice(-80),
    };
  }
  turn(moves) {
    if (this.battle.ended) throw Error('Battle already finished');
    const view = this.view();
    moves.forEach((m, i) => {
      if (!Number.isInteger(m) || m < 1 || m > view.players[i].moves.length) throw Error('Invalid move slot');
      const move = view.players[i].moves[m - 1];
      if (move.disabled || (move.pp <= 0 && move.id !== 'struggle')) throw Error('Move unavailable');
    });
    if (!this.battle.choose('p1', 'move ' + moves[0])) throw Error('Player 1 choice rejected');
    if (!this.battle.choose('p2', 'move ' + moves[1])) {
      this.battle.undoChoice('p1');
      throw Error('Player 2 choice rejected');
    }
    if (this.battle.turn > 300 && !this.battle.ended) this.battle.tie();
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
