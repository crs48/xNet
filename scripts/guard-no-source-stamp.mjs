#!/usr/bin/env node
/**
 * Guard: the point-and-change source stamp must never reach production
 * (exploration 0399).
 *
 * The dev build stamps `data-xnet-src="packages/ui/src/Button.tsx:12:4"` on
 * every host element so the inspect overlay has something to point at. In a
 * production bundle those attributes would publish the repository's directory
 * layout — every file path, every package name — to every visitor, in the DOM,
 * forever. That is not a leak anyone would notice by reading a diff, which is
 * exactly why it needs a machine check rather than a code-review convention.
 *
 * Three tiers, all decidable (0294 — a gate must be able to go green):
 *
 *   1. CONFIG — the Vite config must gate both the stamping plugin and the
 *      `jsxImportSource` override on `command === 'serve'`. Either one left
 *      unconditional fails here, before any build has to run.
 *   2. IMPORTS — no source file may import the dev shim by name. It is reachable
 *      only through the dev-only alias; a direct import would pull it into a
 *      production chunk.
 *   3. ARTIFACT — if `apps/web/dist` exists, no emitted asset may contain the
 *      attribute. Skipped (not failed) when there is no build to inspect, so
 *      the check is meaningful in CI and harmless locally.
 *
 * Run: `node scripts/guard-no-source-stamp.mjs`
 *      `node scripts/guard-no-source-stamp.mjs --require-dist`  (CI, post-build)
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const root = resolve(process.cwd())
const ATTR = 'data-xnet-src'
const CONFIG = 'apps/web/vite.config.ts'
const DIST = 'apps/web/dist'
const PLUGIN_CALL = 'sourceStampPlugin'

/** Text extensions worth scanning in a build output. */
const TEXT_EXT = /\.(js|mjs|cjs|css|html|json|map)$/

const failures = []
const notes = []

// ─── Tier 1: the config must gate the stamp ─────────────────────────────────

const configPath = join(root, CONFIG)
if (!existsSync(configPath)) {
  failures.push(`${CONFIG} is missing — cannot verify the source stamp is dev-only.`)
} else {
  const lines = readFileSync(configPath, 'utf8').split('\n')
  // A CALL site, not the import — `import { sourceStampBabelPlugin } from …`
  // has no paren and must not be mistaken for a registration.
  const callSites = lines
    .map((line, i) => ({ line, number: i + 1, index: i }))
    .filter(({ line }) => line.includes(`${PLUGIN_CALL}(`))

  if (callSites.length === 0) {
    // The stamp is not wired at all. Nothing to leak; nothing to gate.
    notes.push(`${CONFIG} does not register ${PLUGIN_CALL}() — nothing to gate.`)
  }

  // Both the plugin registration and the jsxImportSource override must be gated
  // — either one alone reaching a build is enough to leak.
  const gatedSites = [
    ...callSites,
    ...lines
      .map((line, i) => ({ line, number: i + 1, index: i }))
      .filter(({ line }) => line.includes('JSX_IMPORT_SOURCE') && !line.startsWith('import'))
  ]

  for (const site of gatedSites) {
    // The serve-only condition may sit on the call's own line or the line
    // above — the two shapes prettier produces for this ternary.
    const window = [lines[site.index - 1] ?? '', site.line].join(' ')
    if (!/command\s*===\s*('serve'|"serve")/.test(window)) {
      failures.push(
        `${CONFIG}:${site.number} is not behind a \`command === 'serve'\` gate. ` +
          `The stamp would ship in production builds and publish the source-tree layout.`
      )
    }
  }
}

// ─── Tier 2: nothing may import the dev shim by name ────────────────────────

const SHIM = 'jsx-dev-runtime-stamp'
function walkSource(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walkSource(full, out)
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full)
  }
  return out
}
for (const file of walkSource(join(root, 'apps/web/src'))) {
  if (file.includes(SHIM)) continue
  if (readFileSync(file, 'utf8').includes(SHIM)) {
    failures.push(
      `${relative(root, file)} imports the dev-only stamp shim by name — it must be reached ` +
        `only through the dev alias, or it lands in a production chunk.`
    )
  }
}

// ─── Tier 3: no built asset may carry the attribute ─────────────────────────

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (TEXT_EXT.test(entry)) out.push(full)
  }
  return out
}

const distPath = join(root, DIST)
if (existsSync(distPath)) {
  const hits = walk(distPath).filter((file) => readFileSync(file, 'utf8').includes(ATTR))
  for (const hit of hits) {
    failures.push(
      `${relative(root, hit)} contains "${ATTR}" — the dev-only stamp leaked into a build.`
    )
  }
  notes.push(`scanned ${DIST} (${hits.length} violation(s)).`)
} else if (process.argv.includes('--require-dist')) {
  failures.push(`${DIST} not found, but --require-dist was passed. Build the web app first.`)
} else {
  notes.push(`${DIST} not present — artifact scan skipped (pass --require-dist to require it).`)
}

// ─── Report ─────────────────────────────────────────────────────────────────

for (const note of notes) console.log(`  note: ${note}`)

if (failures.length > 0) {
  console.error(`\n✗ source-stamp guard: ${failures.length} problem(s)\n`)
  for (const failure of failures) console.error(`  - ${failure}`)
  console.error('\nSee docs/explorations/0399_[_]_POINT_AND_CHANGE_XNET_EDITING_ITSELF.md\n')
  process.exit(1)
}

console.log('✓ source-stamp guard: the dev-only stamp is gated and absent from any build output.')
