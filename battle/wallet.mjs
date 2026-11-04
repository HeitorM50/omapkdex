import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join, basename } from 'node:path';
import { ROOT } from './storage.mjs';
const exec = promisify(execFile);
export async function wallet(dir, op = 'status', data = {}) {
  if (basename(dir) !== 'io.github.heitorm50.omapkdex' || basename(dirname(dir)) !== 'omarchy')
    throw Error('Invalid wallet state directory');
  const xdg = dirname(dirname(dir));
  try {
    const { stdout } = await exec(join(ROOT, 'bin/omapkdex-battle-wallet'), [op, JSON.stringify(data)], {
      env: { ...process.env, XDG_STATE_HOME: xdg },
      timeout: 12000,
      maxBuffer: 2 * 1024 * 1024,
    });
    return JSON.parse(stdout);
  } catch (e) {
    let message = 'Wallet operation failed';
    try {
      message = JSON.parse(e.stdout).error || message;
    } catch {}
    throw Error(message);
  }
}
