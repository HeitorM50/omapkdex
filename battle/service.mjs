import net from 'node:net';
import { chmodSync, lstatSync, unlinkSync } from 'node:fs';
import { LanSession } from './session.mjs';
import { stateDir } from './storage.mjs';
import { Frames } from './wire.mjs';
import { controlPath, request } from './control.mjs';
const dir = stateDir(),
  path = controlPath(dir);
let previous = null;
try {
  previous = lstatSync(path);
  if (!previous.isSocket() || previous.uid !== process.getuid()) throw Error('Unsafe local socket');
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}
try {
  await request(dir, 'status', {}, 1500);
  process.exit(0);
} catch (e) {
  if (!['ENOENT', 'ECONNREFUSED'].includes(e.code)) {
    console.error(e.message);
    process.exit(1);
  }
  if (previous) {
    try {
      const now = lstatSync(path);
      if (now.ino !== previous.ino) process.exit(0);
      unlinkSync(path);
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
  }
}
let controller,
  clients = 0,
  readyResolve;
const ready = new Promise((resolve) => {
  readyResolve = resolve;
});
const server = net.createServer((socket) => {
  if (++clients > 12) {
    clients--;
    socket.destroy();
    return;
  }
  socket.on('close', () => clients--);
  socket.setTimeout(20000, () => socket.destroy());
  const frames = new Frames(socket, 65536);
  let handled = false;
  frames.on('fault', () => {});
  frames.on('message', async (m) => {
    if (handled) {
      socket.destroy();
      return;
    }
    handled = true;
    try {
      if (typeof m?.op !== 'string' || !m.data || typeof m.data !== 'object' || Array.isArray(m.data))
        throw Error('Invalid command');
      await ready;
      if (m.op === 'stop') {
        await controller.command('close', {});
        socket.end(JSON.stringify({ stopped: true }) + '\n');
        setTimeout(stop, 30);
        return;
      }
      const result = await controller.command(m.op, m.data);
      socket.end(JSON.stringify(result) + '\n');
    } catch (e) {
      socket.end(JSON.stringify({ error: e.message }) + '\n');
    }
  });
});
server.on('error', (e) => {
  if (e.code !== 'EADDRINUSE') console.error(e.message);
  process.exit(e.code === 'EADDRINUSE' ? 0 : 1);
});
// Binding is the singleton lock; no identity or save is mutated before we own it.
server.listen(path, () => {
  chmodSync(path, 0o600);
  try {
    controller = new LanSession(dir);
    readyResolve();
  } catch (e) {
    console.error(e.message);
    server.close();
    try {
      unlinkSync(path);
    } catch {}
    process.exit(1);
  }
});
async function stop() {
  server.close();
  await controller?.shutdown();
  try {
    unlinkSync(path);
  } catch {}
  process.exit(0);
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
