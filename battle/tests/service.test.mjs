process.env.OMAPKDEX_BATTLE_OFFLINE = '1';
import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { request, controlPath } from '../control.mjs';
import { Frames } from '../wire.mjs';
const exec = promisify(execFile),
  root = fileURLToPath(new URL('../', import.meta.url));
test('private local service and CLI persist a trainer without opening a LAN room', async (t) => {
  const temp = mkdtempSync(join(tmpdir(), 'omapkdex-cli-')),
    env = { ...process.env, XDG_STATE_HOME: temp },
    dir = join(temp, 'omarchy/io.github.heitorm50.omapkdex');
  mkdirSync(dir, { recursive: true });
  const proc = spawn(process.execPath, [join(root, 'service.mjs')], { env, stdio: 'ignore' });
  let stopped = false;
  proc.on('exit', () => {
    stopped = true;
  });
  t.after(async () => {
    proc.kill('SIGTERM');
    for (let i = 0; i < 50 && !stopped; i++) await new Promise((r) => setTimeout(r, 20));
    rmSync(temp, { recursive: true, force: true });
  });
  let result;
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 100));
    try {
      result = JSON.parse((await exec(process.execPath, [join(root, 'cli.mjs'), 'status'], { env })).stdout);
      break;
    } catch {}
  }
  assert.ok(result?.profile?.trainerId);
  assert.equal(result.session, null);
  const next = JSON.parse(
    (
      await exec(
        process.execPath,
        [join(root, 'cli.mjs'), 'profile', JSON.stringify({ displayName: 'Red' })],
        { env },
      )
    ).stdout,
  );
  assert.equal(next.profile.displayName, 'Red');
  assert.equal(next.profile.trainerId, result.profile.trainerId);
  const concurrent = await Promise.all(
    [1, 2].map(() => exec(process.execPath, [join(root, 'cli.mjs'), 'ensure'], { env })),
  );
  assert.ok(concurrent.every((r) => JSON.parse(r.stdout).profile.trainerId === result.profile.trainerId));
  assert.equal(statSync(join(dir, 'battle-private/key.pem')).mode & 0o777, 0o600);
});
test('a status that carries the last session error is still a response; a lone error is a failure', async (t) => {
  const temp = mkdtempSync(join(tmpdir(), 'omapkdex-control-')),
    dir = join(temp, 'state'),
    runtime = process.env.XDG_RUNTIME_DIR;
  process.env.XDG_RUNTIME_DIR = temp;
  const server = net.createServer((socket) => {
    const frames = new Frames(socket, 65536);
    frames.on('message', (m) =>
      socket.end(
        JSON.stringify(
          m.op === 'status' ? { profile: { trainerId: 't' }, error: 'Different match' } : { error: 'Unknown battle command' },
        ) + '\n',
      ),
    );
  });
  t.after(() => {
    server.close();
    if (runtime === undefined) delete process.env.XDG_RUNTIME_DIR;
    else process.env.XDG_RUNTIME_DIR = runtime;
    rmSync(temp, { recursive: true, force: true });
  });
  await new Promise((resolve) => server.listen(controlPath(dir), resolve));
  const status = await request(dir, 'status');
  assert.equal(status.profile.trainerId, 't');
  assert.equal(status.error, 'Different match');
  await assert.rejects(request(dir, 'nope'), /Unknown battle command/);
});
