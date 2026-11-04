import { createRequire } from 'node:module';
import { join } from 'node:path';
import { homedir } from 'node:os';
const require = createRequire(import.meta.url);
const cache = join(
  process.env.XDG_CACHE_HOME || join(homedir(), '.cache'),
  'omarchy/io.github.heitorm50.omapkdex/battle-runtime/package.json',
);
function dependency(name) {
  try {
    return require(name);
  } catch (e) {
    if (e.code !== 'MODULE_NOT_FOUND') throw e;
    try {
      return createRequire(cache)(name);
    } catch {
      throw Error('Battle runtime missing. Run node battle/setup.mjs to install the pinned simulator.');
    }
  }
}
export const { Dex, Battle, TeamValidator } = dependency('@pkmn/sim');
export const { Bonjour } = dependency('bonjour-service');
