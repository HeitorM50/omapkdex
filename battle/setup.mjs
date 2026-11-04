#!/usr/bin/env node
import { mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const here = fileURLToPath(new URL('.', import.meta.url)),
  dir = join(
    process.env.XDG_CACHE_HOME || join(homedir(), '.cache'),
    'omarchy/io.github.heitorm50.omapkdex/battle-runtime',
  );
try {
  mkdirSync(dir, { recursive: true });
  for (const name of ['package.json', 'package-lock.json']) copyFileSync(join(here, name), join(dir, name));
  writeFileSync(join(dir, '.npmrc'), 'ignore-scripts=true\nfund=false\n');
  const r = spawnSync('npm', ['ci', '--ignore-scripts', '--omit=optional', '--no-fund'], {
    cwd: dir,
    encoding: 'utf8',
    timeout: 180000,
  });
  if (r.status !== 0) throw Error((r.stderr || r.error?.message || 'Dependency install failed').slice(-1000));
  console.log(JSON.stringify({ installed: true }));
} catch (e) {
  console.log(JSON.stringify({ error: e.message }));
  process.exitCode = 1;
}
