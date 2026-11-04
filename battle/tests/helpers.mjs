import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function until(fn, label, tries = 400) {
  for (let n = 0; n < tries; n++) {
    if (await fn()) return;
    await sleep(20);
  }
  throw Error('Timeout: ' + label);
}
export const TEAMS = {
  h: [[25, 'pikachu'], [4, 'charmander'], [1, 'bulbasaur'], [133, 'eevee']],
  g: [[7, 'squirtle'], [143, 'snorlax'], [94, 'gengar'], [130, 'gyarados']],
};
// A save with several captured, graduated Pokémon (Lv 100). `who` seeds the ids.
export function save(root, who, mons = TEAMS[who[0]] || TEAMS.h) {
  const dir = join(root, who, 'omarchy/io.github.heitorm50.omapkdex');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'state.json'),
    JSON.stringify({ lifetimeTokens: 1000000000, spentTokens: 0, hatched: true, tokensIntoStage: 777 }),
  );
  writeFileSync(
    join(dir, 'collection.json'),
    JSON.stringify({
      entries: mons.map(([speciesId, name], i) => ({
        companionId: who + '-' + name,
        speciesId,
        name,
        nature: 'adamant',
        rarity: i === 0 ? 'rare' : 'common',
        finalStage: 0,
        graduatedAt: 1 + i,
        line: [{ id: speciesId, name }],
      })),
    }),
  );
  return dir;
}
export const teamOf = (who, n = 3) => (TEAMS[who[0]] || TEAMS.h).slice(0, n).map(([, name]) => ({ companionId: who + '-' + name }));
const AVOID = ['rest', 'sleeptalk', 'protect', 'detect', 'raindance', 'tailwhip', 'irondefense', 'growl', 'leer'];
// The next legal choice for one side of a battle view, or null when it is not choosing.
export function pick(view, role) {
  const me = view.players[role];
  if (!me.request) return null;
  if (me.request === 'teampreview') return 'team 123';
  if (me.request === 'switch') return 'switch ' + me.team.find((m) => !m.fainted && !m.active).slot;
  const usable = (m) => !m.disabled && (m.pp === undefined || m.pp > 0),
    i = me.moves.findIndex((m) => usable(m) && !AVOID.includes(m.id));
  return 'move ' + (i < 0 ? me.moves.findIndex(usable) + 1 || 1 : i + 1);
}
// Sends every pending choice of two LanSession objects once; resolves true if any was sent.
export async function step(a, b) {
  let sent = false;
  for (const s of [a, b]) {
    if (s.s.phase !== 'active' || s.s.choice || s.engine.view().finished) continue;
    const view = s.engine.view(),
      choice = pick(view, s.s.role);
    if (choice && s.s.verifiedTurns === s.s.turns.length) {
      await s.command('choose', { choice });
      sent = true;
    }
  }
  return sent;
}
// Host/join/pair/ready two LanSession objects with their teams already set.
export async function startMatch(a, b, hostData = {}) {
  await a.command('host', { host: '127.0.0.1', port: 0, ...hostData });
  await b.command('join', { host: '127.0.0.1', port: a.s.port });
  await until(() => a.code && b.code, 'codes');
  await a.command('pair');
  await b.command('pair');
  await until(() => b.s.rules, 'rules');
  await a.command('ready', { trustedStakesAccepted: !!hostData.stake });
  await b.command('ready', { trustedStakesAccepted: !!hostData.stake });
  await until(() => a.s.phase === 'active' && b.s.phase === 'active', 'active');
}
// Plays both sessions with legal choices until the battle is settled on both.
export async function playOut(a, b, rounds = 2000) {
  for (let n = 0; n < rounds && !(a.s.settled && b.s.settled); n++) {
    await step(a, b);
    await sleep(10);
  }
  await until(() => a.s.phase === 'finished' && b.s.phase === 'finished', 'finished');
}
