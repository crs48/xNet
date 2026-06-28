/**
 * Build-time validation for site/src/data/siteMetrics.ts.
 *
 * Runs as part of `pnpm build` (before astro build) so CI fails if a marketing
 * number is *overstated* (real < stated) or has gone *stale* (real has grown
 * past the stated floor by more than ~25%). The stated figures are conservative
 * floors rendered with a "+", so a few new tests never break the build — only a
 * real lie or meaningful drift does. This is what keeps "30 packages / 6,000
 * tests / 10-panel devtools" from ever happening again.
 */

import { readdirSync, readFileSync, statSync, type Dirent } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { siteMetrics } from '../src/data/siteMetrics'

// site/scripts/validate-metrics.ts → repo root is two levels up.
const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

const IGNORE_DIRS = new Set(['node_modules', 'dist', '.astro', '.git', 'coverage', '.turbo'])

/** Count immediate subdirectories of a directory (0 if it does not exist). */
function countSubdirs(dir: string): number {
  try {
    return readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).length
  } catch {
    return 0
  }
}

/** Files + directories under `dir` ([] if it does not exist). */
function readDir(dir: string): Dirent[] {
  try {
    return readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() || e.isFile())
  } catch {
    return []
  }
}

/** True for hidden or ignored directory names we never descend into. */
function isSkipped(name: string): boolean {
  return IGNORE_DIRS.has(name) || (name.startsWith('.') && name !== '.changeset')
}

/** Walk `dir`, invoking `onFile` for every file path (skipping IGNORE_DIRS). */
function walk(dir: string, onFile: (path: string) => void): void {
  for (const entry of readDir(dir)) {
    if (isSkipped(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, onFile)
    else onFile(full)
  }
}

/** Real number of it()/test() blocks across packages/ and apps/ test files. */
function countTestCases(): number {
  const re = /\b(?:it|test)(?:\.(?:only|skip|each|concurrent|todo|fails))?\s*[(`]/g
  let total = 0
  for (const root of ['packages', 'apps']) {
    walk(join(repoRoot, root), (path) => {
      if (!/\.test\.tsx?$/.test(path)) return
      const src = readFileSync(path, 'utf8')
      total += src.match(re)?.length ?? 0
    })
  }
  return total
}

interface Check {
  label: string
  stated: number
  real: number
  /** Allowed staleness above the floor before we force a refresh. */
  tolerance: number
}

const realPackages = countSubdirs(join(repoRoot, 'packages'))
const realPanels = countSubdirs(join(repoRoot, 'packages', 'devtools', 'src', 'panels'))
const realTests = countTestCases()

const checks: Check[] = [
  { label: 'packages', stated: siteMetrics.packages, real: realPackages, tolerance: 0.25 },
  { label: 'devtoolsPanels', stated: siteMetrics.devtoolsPanels, real: realPanels, tolerance: 0.3 },
  { label: 'tests', stated: siteMetrics.tests, real: realTests, tolerance: 0.25 }
]

const errors: string[] = []
for (const c of checks) {
  if (c.real < c.stated) {
    errors.push(
      `${c.label}: page states ${c.stated} but repo has only ${c.real} — overstated, lower it`
    )
  } else if (c.real > Math.ceil(c.stated * (1 + c.tolerance))) {
    errors.push(
      `${c.label}: page states ${c.stated} but repo has ${c.real} — stale by >${Math.round(
        c.tolerance * 100
      )}%, bump siteMetrics.${c.label}`
    )
  }
}

if (statSync(join(repoRoot, 'packages')).isDirectory() && realPackages === 0) {
  errors.push('packages: could not enumerate packages/ — refusing to validate against 0')
}

if (errors.length > 0) {
  console.error(`siteMetrics validation failed with ${errors.length} error(s):`)
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}

console.log(
  `siteMetrics OK: ${checks.map((c) => `${c.label} ${c.stated} (real ${c.real})`).join(', ')}`
)
