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

// Rótulos reais do Codex e do Copilot, e os plurais que a regex precisa aceitar.
equal('codex 720h window', Balance.limitDurationMinutes({ label: '720h window' }), 43200)
equal('monthly premium requests',
  Balance.limitDurationMinutes({ label: 'Premium requests (monthly)' }), 43200)
equal('plural hours', Balance.limitDurationMinutes({ label: '5 hours' }), 300)
equal('plural days', Balance.limitDurationMinutes({ label: '30 days' }), 43200)
equal('empty limits stay absent', Balance.shortestLimit({ limits: [] }), null)
equal('null percent is skipped', Balance.shortestLimit({
  limits: [{ label: 'Session (5-hour)', percent: null }, weekly]
}), weekly)
equal('order does not matter', Balance.shortestLimit({ limits: [weekly, session] }), session)
equal('a known window beats an unknown one', Balance.shortestLimit({
  limits: [{ label: 'Primary', percent: 0.9 }, weekly]
}), weekly)

process.exitCode = failures ? 1 : 0
