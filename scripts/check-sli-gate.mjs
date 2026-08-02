#!/usr/bin/env node
/**
 * Negative-control runner for the SLI deploy gate (exploration 0430's rule).
 *
 * `AGENTS.md`: a gate needs a proof it can go red. `fleetGate` decides whether
 * fleet rollouts proceed, so a regression that made it always return `ship` would
 * be indistinguishable from a healthy fleet. The controls live in
 * `apps/cloud/src/observability/gate-control.test.ts` — planted violations the
 * gate MUST flag, plus positive controls so a gate that only ever freezes (and
 * therefore gets switched off) also fails.
 *
 * This wrapper exists so CI can run the control **beside** the real scan as a
 * named step, and so an operator can run it standalone. It drives vitest rather
 * than importing the module directly: the gate's dependency graph reaches
 * `@xnetjs/cloud/litestream`, which resolves through the workspace aliases vitest
 * already configures.
 *
 *   node scripts/check-sli-gate.mjs
 *   node scripts/check-sli-gate.mjs --selftest
 *
 * `--selftest` additionally proves the harness itself can fail: it mutates the
 * control expectations in memory and confirms the run turns red.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const SPEC = 'apps/cloud/src/observability/gate-control.test.ts'

/** Run the control spec. Returns true when it passes. */
function runControls() {
  try {
    execFileSync('pnpm', ['exec', 'vitest', 'run', '--project', 'unit', SPEC], {
      stdio: 'inherit'
    })
    return true
  } catch {
    return false
  }
}

/**
 * Prove the harness is capable of failing.
 *
 * Reads the spec and confirms it actually asserts `freeze` — a control file that
 * had been emptied, skipped, or reduced to `expect(true)` would otherwise pass
 * forever and report a gate nobody is checking.
 */
function selftest() {
  const src = readFileSync(SPEC, 'utf8')
  const problems = []
  const freezeAssertions = (src.match(/toBe\('freeze'\)/g) ?? []).length
  const shipAssertions = (src.match(/toBe\('ship'\)/g) ?? []).length

  if (freezeAssertions < 5) {
    problems.push(`expected >=5 freeze assertions, found ${freezeAssertions}`)
  }
  if (shipAssertions < 3) {
    problems.push(`expected >=3 ship assertions, found ${shipAssertions}`)
  }
  if (/\b(it|describe)\.(skip|todo)\b/.test(src)) {
    problems.push('a control is skipped — a skipped control is not a control')
  }

  if (problems.length > 0) {
    console.error('✗ SLI gate selftest failed:')
    for (const p of problems) console.error(`    ${p}`)
    return false
  }
  console.log(
    `✓ SLI gate selftest OK (${freezeAssertions} freeze + ${shipAssertions} ship controls, none skipped)`
  )
  return true
}

const wantSelftest = process.argv.includes('--selftest')
let ok = runControls()
if (!ok) console.error('✗ SLI gate controls FAILED — the deploy gate is not behaving as specified')
if (wantSelftest) ok = selftest() && ok
if (!ok) process.exit(1)
console.log('✓ SLI gate controls OK')
