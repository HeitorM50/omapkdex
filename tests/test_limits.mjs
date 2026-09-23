#!/usr/bin/env node
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const dir = mkdtempSync(join(tmpdir(), 'omapkdex-limits-'))
const shim = join(dir, 'balance.mjs')
writeFileSync(shim,
  readFileSync(join(root, 'Balance.js'), 'utf8').replace(/^\.pragma library\s*/m, '')
  + '\nexport { limitDurationMinutes, shortestLimit, tightestLimit };\n')
const Balance = await import(shim)

let failures = 0
function equal(label, got, wanted) {
  const ok = JSON.stringify(got) === JSON.stringify(wanted)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${JSON.stringify(got)}`)
}

const session = { label: 'Session (5-hour)', percent: 0.08 }
const weekly = { label: 'Weekly (7-day)', percent: 0.91 }
const record = { limits: [session, weekly] }

equal('5-hour duration', Balance.limitDurationMinutes(session), 300)
equal('weekly duration', Balance.limitDurationMinutes(weekly), 10080)
equal('compact prefers the short session', Balance.shortestLimit(record), session)
equal('details can still select the tightest limit', Balance.tightestLimit(record), weekly)
equal('unknown durations retain provider order', Balance.shortestLimit({
  limits: [{ label: 'Primary', percent: 0.2 }, { label: 'Secondary', percent: 0.8 }]
}).label, 'Primary')
equal('missing limits stay absent', Balance.shortestLimit({}), null)

process.exitCode = failures ? 1 : 0
