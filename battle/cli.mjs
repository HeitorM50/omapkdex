#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { openSync, closeSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stateDir } from './storage.mjs';
import { request } from './control.mjs';
const dir = stateDir();
async function ensure() {
  try {
    return await request(dir, 'status', {}, 1500);
  } catch (e) {
    if (!['ENOENT', 'ECONNREFUSED'].includes(e.code)) throw e;
  }
  mkdirSync(join(dir, 'battle-private'), { recursive: true, mode: 0o700 });
  const log = openSync(join(dir, 'battle-private/service.log'), 'a', 0o600);
  const proc = spawn(process.execPath, [fileURLToPath(new URL('./service.mjs', import.meta.url))], {
    detached: true,
    stdio: ['ignore', log, log],
    env: process.env,
  });
  proc.unref();
  closeSync(log);
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
    try {
      return await request(dir, 'status', {}, 1500);
    } catch (e) {
      if (!['ENOENT', 'ECONNREFUSED'].includes(e.code) && e.message !== 'Battle service timed out') throw e;
    }
  }
  throw Error('Battle service did not start. Check Node dependencies and OpenSSL.');
}
try {
  const op = process.argv[2] || 'status',
    data = process.argv[3] ? JSON.parse(process.argv[3]) : {};
  const result = op === 'ensure' ? await ensure() : await request(dir, op, data);
  console.log(JSON.stringify(result));
} catch (e) {
  console.log(JSON.stringify({ error: e.message }));
  process.exitCode = 1;
}
