import net from 'node:net';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { mkdirSync, lstatSync, chmodSync } from 'node:fs';
import { Frames } from './wire.mjs';
export function controlPath(dir) {
  const base = join(process.env.XDG_RUNTIME_DIR || tmpdir(), 'omapkdex-' + process.getuid());
  mkdirSync(base, { recursive: true, mode: 0o700 });
  const stat = lstatSync(base);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid())
    throw Error('Unsafe local control directory');
  chmodSync(base, 0o700);
  return join(base, createHash('sha256').update(dir).digest('hex').slice(0, 16) + '.sock');
}
export function request(dir, op, data = {}, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(controlPath(dir)),
      timer = setTimeout(() => {
        socket.destroy();
        reject(Error('Battle service timed out'));
      }, timeout);
    const frames = new Frames(socket, 2 * 1024 * 1024);
    frames.on('fault', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    frames.on('message', (m) => {
      clearTimeout(timer);
      socket.destroy();
      if (m.error) reject(Error(m.error));
      else resolve(m);
    });
    socket.on('connect', () => frames.send({ op, data }));
  });
}
