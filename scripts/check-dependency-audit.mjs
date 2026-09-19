#!/usr/bin/env node
/**
 * Fail when a production dependency carries a high or critical advisory that
 * is NOT in the committed baseline (exploration 0463).
 *
 *   new         ✗ a high/critical advisory absent from
 *                 `scripts/dependency-audit-baseline.json`.
 *   unreadable  ✗ `pnpm audit` produced no parseable report, or the registry
 *                 answered with an error. A timeout is not a clean bill of
 *                 health, so this exits 2 rather than passing.
 *   resolved    ✓ (note) a baseline entry that no longer fires — shrink the
 *                 baseline with `--write-baseline` so the ratchet only tightens.
 *
 * Why a ratchet and not "zero advisories": the workspace had 85 distinct
 * high/critical production advisories on the day this gate was written. An absolute gate
 * could never go green, and a gate that cannot go green teaches everyone to
 * ignore red. This one holds the line where it is and lets the number fall.
 *
 * Named consumer: the repo owner, via the failed scheduled run of
 * `.github/workflows/dependency-audit.yml`. It is deliberately NOT a required
 * PR check — a new advisory published overnight would redden every unrelated
 * PR. It runs weekly, and on PRs that touch the lockfile (where a new finding
 * is the PR's own doing).
 *
 * Run: `node scripts/check-dependency-audit.mjs` (or `pnpm check:dependency-audit`).
 *      `node scripts/check-dependency-audit.mjs --write-baseline`
 *      `node scripts/check-dependency-audit.mjs --selftest`  (the negative
 *      control — a gate with none is unfalsifiable, exploration 0430).
 *
 * The self-test's fixtures are in memory, never on disk, so a control can never
 * leak into the real scan.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const GATED = new Set(['high', 'critical'])
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASELINE_PATH = join(root, 'scripts', 'dependency-audit-baseline.json')

/** One stable key per (advisory, package): the same GHSA can hit two modules. */
export function advisoryKey(a) {
  return `${a.github_advisory_id ?? `npm-${a.id}`}:${a.module_name}`
}

/**
 * Turn raw `pnpm audit --json` stdout into gated advisories.
 * Throws on anything that is not a readable report — "absent" and "unreadable"
 * must never collapse into an empty, passing list.
 */
export function parseAuditReport(stdout) {
  let report
  try {
    report = JSON.parse(stdout)
  } catch {
    throw new Error('pnpm audit did not print JSON')
  }
  if (report?.error) {
    throw new Error(
      `pnpm audit reported an error: ${report.error.code ?? ''} ${report.error.message ?? ''}`
    )
  }
  if (!report || typeof report.advisories !== 'object' || report.advisories === null) {
    throw new Error('pnpm audit JSON has no `advisories` object')
  }
  return Object.values(report.advisories)
    .filter((a) => GATED.has(a.severity))
    .map((a) => ({
      key: advisoryKey(a),
      severity: a.severity,
      module: a.module_name,
      patched: a.patched_versions,
      url: a.url
    }))
}

/** Pure comparison so --selftest exercises exactly what the scan runs. */
export function compareToBaseline(findings, baselineKeys) {
  const baseline = new Set(baselineKeys)
  const current = new Set(findings.map((f) => f.key))
  return {
    fresh: findings.filter((f) => !baseline.has(f.key)),
    resolved: [...baseline].filter((k) => !current.has(k)).sort()
  }
}

function runAudit() {
  const res = spawnSync('pnpm', ['audit', '--prod', '--json'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  })
  if (res.error) throw new Error(`could not run pnpm audit: ${res.error.message}`)
  // pnpm audit exits 1 whenever it finds anything; the JSON is the verdict.
  return parseAuditReport(res.stdout)
}

function runScan() {
  let findings
  try {
    findings = runAudit()
  } catch (err) {
    console.error(`✗ dependency audit unreadable — ${err.message}`)
    console.error('  This is a failure, not a pass: no report means no evidence.')
    return 2
  }

  if (process.argv.includes('--write-baseline')) {
    const keys = [...new Set(findings.map((f) => f.key))].sort()
    writeFileSync(BASELINE_PATH, JSON.stringify(keys, null, 2) + '\n')
    console.log(`✓ wrote ${keys.length} baseline entries to scripts/dependency-audit-baseline.json`)
    return 0
  }

  const baselineKeys = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
  const { fresh, resolved } = compareToBaseline(findings, baselineKeys)

  if (resolved.length > 0) {
    console.log(
      `note: ${resolved.length} baseline entr${resolved.length === 1 ? 'y' : 'ies'} no longer fire.`
    )
    console.log(
      '      Shrink the baseline: node scripts/check-dependency-audit.mjs --write-baseline'
    )
  }

  if (fresh.length > 0) {
    console.error(
      `✗ ${fresh.length} new high/critical production advisor${fresh.length === 1 ? 'y' : 'ies'}:`
    )
    for (const f of fresh) {
      console.error(`  ${f.severity.padEnd(8)} ${f.module}  → ${f.patched}  ${f.url}`)
    }
    console.error(
      '\nUpgrade the dependency. Only baseline an advisory you have read and judged unreachable.'
    )
    return 1
  }

  console.log(
    `✓ no new high/critical production advisories (${findings.length} known, ${baselineKeys.length} in baseline)`
  )
  return 0
}

function runSelfTest() {
  const report = (advisories) => JSON.stringify({ advisories, metadata: {} })
  const adv = (id, severity, module_name = 'planted-pkg') => ({
    github_advisory_id: id,
    severity,
    module_name,
    patched_versions: '>=9.9.9',
    url: `https://example.invalid/${id}`
  })
  const throws = (fn) => {
    try {
      fn()
      return false
    } catch {
      return true
    }
  }

  const cases = [
    {
      label: 'a planted critical advisory outside the baseline is flagged',
      pass: () =>
        compareToBaseline(
          parseAuditReport(report({ 1: adv('GHSA-selftest-0001', 'critical') })),
          []
        ).fresh.length === 1
    },
    {
      label: 'a planted high advisory outside the baseline is flagged',
      pass: () =>
        compareToBaseline(parseAuditReport(report({ 1: adv('GHSA-selftest-0002', 'high') })), [])
          .fresh.length === 1
    },
    {
      label: 'the same advisory inside the baseline passes',
      pass: () =>
        compareToBaseline(parseAuditReport(report({ 1: adv('GHSA-selftest-0003', 'high') })), [
          'GHSA-selftest-0003:planted-pkg'
        ]).fresh.length === 0
    },
    {
      label: 'a baselined advisory on a DIFFERENT package is still flagged',
      pass: () =>
        compareToBaseline(
          parseAuditReport(report({ 1: adv('GHSA-selftest-0003', 'high', 'other-pkg') })),
          ['GHSA-selftest-0003:planted-pkg']
        ).fresh.length === 1
    },
    {
      label: 'moderate and low advisories are not gated',
      pass: () =>
        parseAuditReport(report({ 1: adv('GHSA-a', 'moderate'), 2: adv('GHSA-b', 'low') }))
          .length === 0
    },
    {
      label: 'a baseline entry that stopped firing is reported as resolved',
      pass: () => compareToBaseline([], ['GHSA-gone:pkg']).resolved.length === 1
    },
    {
      label: 'empty stdout is unreadable, not clean',
      pass: () => throws(() => parseAuditReport(''))
    },
    {
      label: 'a registry error is unreadable, not clean',
      pass: () =>
        throws(() =>
          parseAuditReport(JSON.stringify({ error: { code: 'ERR_PNPM_AUDIT_BAD_RESPONSE' } }))
        )
    },
    {
      label: 'JSON without an advisories object is unreadable, not clean',
      pass: () => throws(() => parseAuditReport('{}'))
    }
  ]

  let failures = 0
  for (const c of cases) {
    if (c.pass()) {
      console.log(`  ✓ ${c.label}`)
    } else {
      failures++
      console.error(`  ✗ ${c.label}`)
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} self-test(s) failed.`)
    return 1
  }
  console.log(`\n✓ dependency-audit self-test passed (${cases.length} cases)`)
  return 0
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]).endsWith('check-dependency-audit.mjs')
if (invokedDirectly) {
  process.exit(process.argv.includes('--selftest') ? runSelfTest() : runScan())
}
