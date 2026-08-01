/**
 * check:durability-claims — the gate that keeps public durability copy from
 * outrunning the code (exploration 0418).
 *
 * The pricing page once advertised "99.9% best-effort availability" on a tier
 * whose `SlaLevel` resolved to no objective at all. That happened because the
 * number was hand-typed in `site/src/data/` next to a typed catalog nobody
 * checked it against. `site/` installs with `--ignore-workspace` and cannot
 * import `@xnetjs/*`, so the mirror is unavoidable — what is avoidable is the
 * mirror rotting silently.
 *
 * Two jobs:
 *
 *   1. **Regenerate the mirror** (`site/src/data/durability.ts`) from
 *      `@xnetjs/entitlements` and fail if the committed file differs. Run with
 *      `--write` to update it.
 *   2. **Scan site copy** for availability percentages that are not in the
 *      published allow-list, so a hand-typed "99.99% uptime" fails the build
 *      wherever it appears.
 *
 * Usage:
 *   tsx scripts/check-durability-claims.ts            # check (CI)
 *   tsx scripts/check-durability-claims.ts --write    # regenerate the mirror
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ALL_DURABILITY_SCOPES,
  DURABILITY_POSTURE,
  DURABILITY_SCOPE_LABELS,
  publishedAvailabilityFigures,
  publishedAvailabilityLabel,
  rpoLabel,
  rtoLabel
} from '../packages/entitlements/src/durability'
import { PLAN_ORDER } from '../packages/entitlements/src/plans'
import { sloForPlan } from '../packages/entitlements/src/slo'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const MIRROR = join(repoRoot, 'site/src/data/durability.ts')

/**
 * Surfaces that make *product* claims. Blog essays are deliberately out of
 * scope: they cite third-party statistics ("99% of people can be fingerprinted")
 * that are facts about the world, not promises about our service. Scanning them
 * would produce noise nobody can fix, and a gate that cannot go green teaches
 * everyone to ignore red.
 */
const SCANNED_DIRS = ['site/src/data', 'site/src/pages/cloud']
const SCANNED_FILES = ['site/src/pages/terms.astro', 'site/src/pages/status.astro']

/**
 * Per-line escape hatch, mirroring the Charter's `humane-ok:` idiom. A line
 * that *describes* a retired claim (a comment, a changelog entry) is not making
 * one. The reason is required — an exception without a written justification is
 * itself a violation.
 *
 *   // durability-ok: quotes the retired claim to explain why it was retired
 */
const OK_RE = /durability-ok:\s*\S+/

/** Files exempt from the percentage scan, with a reason. */
const SCAN_EXEMPT: Record<string, string> = {
  'site/src/data/durability.ts': 'the generated mirror — it IS the allow-list',
  'site/src/data/compare.ts': 'quotes third-party products’ own published figures',
  'site/src/data/surveillance.ts': 'third-party research statistics, not service claims',
  'site/src/data/changelog.ts': 'historical release notes, not a live claim'
}

// ---------------------------------------------------------------------------
// 1. Generate the mirror
// ---------------------------------------------------------------------------

function generateMirror(): string {
  const rows = PLAN_ORDER.map((plan) => {
    const p = DURABILITY_POSTURE[plan]
    const covered = p.covered.map((s) => `'${s}'`).join(', ')
    return `  ${plan}: {
    rpoSeconds: ${p.rpoSeconds},
    rtoMinutes: ${p.rtoMinutes},
    covered: [${covered}],
    publishedAvailability: ${p.publishedAvailability},
    publishedAvailabilityLabel: ${JSON.stringify(publishedAvailabilityLabel(plan))},
    rpoLabel: ${JSON.stringify(rpoLabel(plan))},
    rtoLabel: ${JSON.stringify(rtoLabel(plan))},
    objectiveLabel: ${JSON.stringify(sloForPlan(plan).label)},
    makeWhole: ${p.makeWhole}
  }`
  }).join(',\n')

  const scopeLabels = ALL_DURABILITY_SCOPES.map(
    (s) => `  '${s}': ${JSON.stringify(DURABILITY_SCOPE_LABELS[s])}`
  ).join(',\n')

  return `/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Mirrors packages/entitlements/src/durability.ts, the single source of truth
 * for every public durability claim (exploration 0418). \`site/\` installs with
 * \`--ignore-workspace\` and cannot import \`@xnetjs/*\`, so this mirror exists —
 * and \`pnpm check:durability-claims\` fails the build if it drifts.
 *
 * Regenerate:  pnpm check:durability-claims --write
 */

export type DurabilityScope = ${ALL_DURABILITY_SCOPES.map((s) => `'${s}'`).join(' | ')}

export interface SiteDurabilityPosture {
  rpoSeconds: number | null
  rtoMinutes: number | null
  covered: DurabilityScope[]
  publishedAvailability: number | null
  /** Pre-formatted so no page ever does percentage maths. */
  publishedAvailabilityLabel: string | null
  rpoLabel: string | null
  rtoLabel: string | null
  /** What the SLO layer holds us to, for the status surface. */
  objectiveLabel: string
  makeWhole: boolean
}

export type SitePlanId = ${PLAN_ORDER.map((p) => `'${p}'`).join(' | ')}

export const DURABILITY: Record<SitePlanId, SiteDurabilityPosture> = {
${rows}
}

export const SCOPE_LABELS: Record<DurabilityScope, string> = {
${scopeLabels}
}

export const ALL_SCOPES: DurabilityScope[] = [${ALL_DURABILITY_SCOPES.map((s) => `'${s}'`).join(', ')}]

/** Scopes a tier does NOT cover — the disclosure list the durability page renders. */
export function uncovered(plan: SitePlanId): DurabilityScope[] {
  return ALL_SCOPES.filter((s) => !DURABILITY[plan].covered.includes(s))
}

/** Every availability figure we publish anywhere. */
export const PUBLISHED_FIGURES: string[] = [${publishedAvailabilityFigures()
    .map((f) => JSON.stringify(f))
    .join(', ')}]
`
}

// ---------------------------------------------------------------------------
// 2. Scan for unbacked availability claims
// ---------------------------------------------------------------------------

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      walk(full, out)
    } else if (/\.(ts|astro|md|mdx)$/.test(entry)) {
      out.push(full)
    }
  }
  return out
}

/**
 * Availability-shaped percentages: two or more nines, optionally with decimals
 * (99%, 99.9%, 99.95%). Deliberately narrow — "50% faster" is not a claim about
 * uptime, and flagging it would train people to ignore this gate.
 */
const AVAILABILITY_RE = /\b(99(?:\.\d+)?)\s*%/g

/**
 * A percentage only counts as an availability claim when it sits near a word
 * that makes it one. Precision matters more than recall here: the failure this
 * gate exists to prevent is a *promise*, and promises are phrased.
 */
const AVAILABILITY_CONTEXT = /uptime|availab|SLA|downtime|service level/i

/** Every file the scan covers, de-duplicated and exemption-filtered. */
function scannedFiles(): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const consider = (abs: string): void => {
    const rel = relative(repoRoot, abs)
    if (seen.has(rel) || SCAN_EXEMPT[rel]) return
    seen.add(rel)
    out.push(abs)
  }
  for (const dir of SCANNED_DIRS) for (const f of walk(join(repoRoot, dir))) consider(f)
  for (const f of SCANNED_FILES) consider(join(repoRoot, f))
  return out
}

function scanClaims(allowed: Set<string>): string[] {
  const problems: string[] = []

  for (const file of scannedFiles()) {
    const rel = relative(repoRoot, file)
    const lines = readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, i) => {
      if (OK_RE.test(line)) return
      if (!AVAILABILITY_CONTEXT.test(line)) return
      for (const match of line.matchAll(AVAILABILITY_RE)) {
        const figure = `${Number(match[1])}%`
        if (!allowed.has(figure)) {
          problems.push(
            `${rel}:${i + 1} — publishes "${match[0].trim()}" as an availability ` +
              `claim, which no plan's DURABILITY_POSTURE backs.\n    ${line.trim()}`
          )
        }
      }
    })
  }
  return problems
}

/**
 * "best-effort" and a numeric availability figure are opposite claims. The
 * original drift ("99.9% best-effort availability") was exactly this shape, so
 * catch the phrase directly rather than only its numbers.
 */
function scanSelfCancelling(): string[] {
  const problems: string[] = []
  for (const file of scannedFiles()) {
    const rel = relative(repoRoot, file)
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (OK_RE.test(line)) return
        if (/\d\s*%[^\n]{0,24}best[-\s]?effort|best[-\s]?effort[^\n]{0,24}\d\s*%/i.test(line)) {
          problems.push(
            `${rel}:${i + 1} — pairs a numeric availability figure with ` +
              `"best-effort"; those are opposite claims.\n    ${line.trim()}`
          )
        }
      })
  }
  return problems
}

// ---------------------------------------------------------------------------

function main(): void {
  const write = process.argv.includes('--write')
  const generated = generateMirror()
  const failures: string[] = []

  if (write) {
    writeFileSync(MIRROR, generated)
    console.log(`wrote ${relative(repoRoot, MIRROR)}`)
  } else {
    let current: string | null = null
    try {
      current = readFileSync(MIRROR, 'utf8')
    } catch {
      current = null
    }
    if (current === null) {
      failures.push(
        `${relative(repoRoot, MIRROR)} is missing. ` +
          `Run: pnpm check:durability-claims --write`
      )
    } else if (current !== generated) {
      failures.push(
        `${relative(repoRoot, MIRROR)} is out of sync with ` +
          `packages/entitlements/src/durability.ts.\n` +
          `    Run: pnpm check:durability-claims --write`
      )
    }
  }

  const allowed = new Set(publishedAvailabilityFigures())
  failures.push(...scanClaims(allowed))
  failures.push(...scanSelfCancelling())

  if (failures.length > 0) {
    console.error('\ndurability-claim violations:\n')
    for (const f of failures) console.error(`  ✗ ${f}`)
    console.error(
      `\n${failures.length} violation(s). Public copy may only state a durability ` +
        `figure that DURABILITY_POSTURE backs — see exploration 0418.\n`
    )
    process.exit(1)
  }

  console.log(
    `✓ durability claims consistent (${allowed.size} published figure(s): ` +
      `${[...allowed].join(', ')})`
  )
}

main()
