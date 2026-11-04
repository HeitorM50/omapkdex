import {
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
  openSync,
  fsyncSync,
  closeSync,
  chmodSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const stateDir = () =>
  join(
    process.env.XDG_STATE_HOME || join(homedir(), '.local/state'),
    'omarchy',
    'io.github.heitorm50.omapkdex',
  );
export function readJSON(file, fallback) {
  try {
    const raw = readFileSync(file);
    if (raw.length > 8 * 1024 * 1024) throw Error('Local file too large');
    return JSON.parse(raw);
  } catch (e) {
    if (e.code === 'ENOENT') return structuredClone(fallback);
    throw Error(`Cannot read ${file.split('/').at(-1)}: ${e.message}`);
  }
}
export function writeJSON(file, value) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const tmp = file + '.tmp.' + randomUUID();
  writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  const fd = openSync(tmp, 'r');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, file);
  chmodSync(file, 0o600);
}
export function text(value, max = 32) {
  if (typeof value !== 'string' || !value.trim() || [...value].length > max || /[\x00-\x1f\x7f]/u.test(value))
    throw Error('Invalid text');
  return value.trim();
}
export function integer(value, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw Error('Invalid integer');
  return value;
}
export function id(value) {
  if (typeof value !== 'string' || !/^[-a-zA-Z0-9_]{1,80}$/.test(value)) throw Error('Invalid identifier');
  return value;
}
