#!/usr/bin/env node
/**
 * Guard the Electron desktop renderer against silent drift from the web app
 * (exploration 0238).
 *
 * The Electron renderer (apps/electron/src/renderer) is a deliberately focused
 * subset of the web app (apps/web/src): a canvas / page / database desktop tool,
 * not a full peer. That subset is a legitimate product choice — but "is the
 * desktop app up to date with the web app?" is unanswerable unless the subset is
 * *declared and enforced*. This guard makes drift a conscious decision, not an
 * accident, via three checks:
 *
 *   1. ROUTE PARITY (fatal) — every top-level web route in apps/web/src/routes
 *      must be classified as either COVERED (the desktop ships it) or WAIVED
 *      (the desktop deliberately omits it, with a one-line reason). A *new* web
 *      route that lands in neither set fails CI: implement it on desktop or
 *      waive it on purpose. Stale entries (in a set but no longer a route) warn.
 *
 *   2. SHARED-KERNEL PIN (fatal) — every @xnetjs/* dependency in
 *      apps/electron/package.json must be `workspace:*`, so the desktop app can
 *      never bundle a stale, pinned copy of the sync / identity / crypto kernel
 *      that would diverge from the conformance-tested monorepo one (L1).
 *
 *   3. TIER-2 FORK DRIFT (warn) — components that exist in BOTH
 *      apps/web/src/components and apps/electron/src/renderer/components are
 *      compared by their @xnetjs/* import sets. A divergence is reported
 *      (non-fatal) so reviewers notice when one fork gains a shared-package
 *      capability the other lacks (L0b).
 *
 * Run: `node scripts/check-electron-parity.mjs` (or `pnpm check:electron-parity`).
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(process.cwd())
const WEB_ROUTES_DIR = join(root, 'apps/web/src/routes')
const ELECTRON_PKG = join(root, 'apps/electron/package.json')
const WEB_COMPONENTS = join(root, 'apps/web/src/components')
const ELECTRON_COMPONENTS = join(root, 'apps/electron/src/renderer/components')

// Views the desktop app ships today (TanStack route base name → desktop surface).
const COVERED = new Set([
  'index', // canvas home shell
  'canvas', // canvas surface
  'doc', // page-focus overlay
  'db', // database-focus / -split overlay
  'data', // data-workspace (saved views / lenses)
  'meetings', // meetings overlay (botless recorder + list/detail, 0279)
  'view', // saved view, opened through the data workspace
  'settings', // settings overlay
  'social-import', // social-import overlay
  'share', // claimed via xnet:// deep link + ShareButton
  'stories', // Storybook view (dev)
  'welcome' // first-run onboarding
])

// Views the desktop app DELIBERATELY omits for now — focused-subset decision
// recorded in docs/explorations/0238. Each entry must keep its reason; deleting a
// reason (or the comment) should be a conscious act, reviewed alongside the code.
const WAIVED = new Map([
  ['analytics', 'usage analytics is a web/cloud surface, not a desktop workflow'],
  [
    'companion',
    'companion agent surface is part of the web calm shell (0250); not yet wired into the desktop renderer'
  ],
  ['channel', 'chat/comms not yet ported to desktop (no apps/electron comms layer)'],
  ['crm', 'CRM is a web-first business surface; desktop stays canvas/page/db focused'],
  ['dashboard', 'dashboard builder is web-first; deferred on desktop'],
  ['discover', 'discovery/feed is a web/social surface'],
  ['experiments', 'experiment journal is web-first'],
  ['finance', 'ledger/finance is a web-first business surface'],
  [
    'lab',
    'Labs editor UI (LabView + SES/WASM ladder) still web-only; the 0331 ' +
      'workspace-plugin SANDBOX rung is renderer-agnostic and hardened-renderer ' +
      'safe (opaque-origin iframe, no node/same-origin — see ' +
      'workspace-plugins-electron-parity.test.ts), so porting the editor surface ' +
      'is the only remaining desktop gap'
  ],
  ['map', 'map view is web-first; deferred on desktop'],
  ['person', 'people graph / person dashboard is a web/social surface'],
  ['requests', 'requests inbox is part of the unported comms layer'],
  ['space', 'spaces navigation is web-first'],
  ['tag', 'hashtag channels are part of the unported content/social layer'],
  ['tasks', 'no standalone /tasks surface on desktop (inline PageTasksPanel only)']
])

let fatal = 0
const warnings = []

/** TanStack file-based route → base view name, e.g. `canvas.$canvasId.tsx` → `canvas`. */
function routeBaseName(file) {
  return file.replace(/\.tsx$/, '').split('.')[0]
}

/** Extract the set of `@xnetjs/<pkg>` specifiers imported by a source file. */
function xnetImports(file) {
  const src = readFileSync(file, 'utf8')
  const set = new Set()
  for (const m of src.matchAll(/from\s+['"](@xnetjs\/[a-z0-9-]+)(?:\/[a-z0-9-]+)?['"]/g)) {
    set.add(m[1])
  }
  return set
}

// ── Check 1: route parity ────────────────────────────────────────────────────
const webRoutes = readdirSync(WEB_ROUTES_DIR)
  .filter((f) => f.endsWith('.tsx') && f !== '__root.tsx')
  .map(routeBaseName)
const webRouteSet = new Set(webRoutes)

const undecided = [...webRouteSet].filter((r) => !COVERED.has(r) && !WAIVED.has(r)).sort()
if (undecided.length > 0) {
  fatal += undecided.length
  console.error('✗ Electron parity: web route(s) with no desktop decision:')
  for (const r of undecided) {
    console.error(`    ${r}  (apps/web/src/routes/${r}.*)`)
  }
  console.error(
    '  → Ship it in apps/electron/src/renderer and add to COVERED, or omit it on\n' +
      '    purpose and add to WAIVED with a one-line reason, in\n' +
      '    scripts/check-electron-parity.mjs.'
  )
}

const stale = [...COVERED, ...WAIVED.keys()].filter((r) => !webRouteSet.has(r)).sort()
if (stale.length > 0) {
  warnings.push(
    `stale parity classification(s) (no matching web route): ${stale.join(', ')} — ` +
      'prune from COVERED/WAIVED in scripts/check-electron-parity.mjs.'
  )
}

// ── Check 2: shared-kernel pin ───────────────────────────────────────────────
const pkg = JSON.parse(readFileSync(ELECTRON_PKG, 'utf8'))
const allDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }
const pinned = Object.entries(allDeps).filter(
  ([name, spec]) => name.startsWith('@xnetjs/') && !String(spec).startsWith('workspace:')
)
if (pinned.length > 0) {
  fatal += pinned.length
  console.error('\n✗ Electron parity: @xnetjs/* dependency not pinned to workspace:*:')
  for (const [name, spec] of pinned) {
    console.error(`    ${name}: ${spec}`)
  }
  console.error(
    '  → Desktop must track the monorepo kernel (workspace:*) so it can never\n' +
      '    bundle a stale, conformance-divergent @xnetjs/sync / identity / crypto.'
  )
}

// ── Check 3: Tier-2 fork drift (warn) ────────────────────────────────────────
if (existsSync(WEB_COMPONENTS) && existsSync(ELECTRON_COMPONENTS)) {
  const isComponent = (f) => /\.tsx$/.test(f) && !/\.(test|stories)\.tsx$/.test(f)
  const webSet = new Set(readdirSync(WEB_COMPONENTS).filter(isComponent))
  const forked = readdirSync(ELECTRON_COMPONENTS)
    .filter(isComponent)
    .filter((f) => webSet.has(f))
    .sort()

  for (const file of forked) {
    const webImports = xnetImports(join(WEB_COMPONENTS, file))
    const elImports = xnetImports(join(ELECTRON_COMPONENTS, file))
    const onlyWeb = [...webImports].filter((p) => !elImports.has(p)).sort()
    const onlyEl = [...elImports].filter((p) => !webImports.has(p)).sort()
    if (onlyWeb.length || onlyEl.length) {
      const parts = []
      if (onlyWeb.length) parts.push(`web-only: ${onlyWeb.join(', ')}`)
      if (onlyEl.length) parts.push(`electron-only: ${onlyEl.join(', ')}`)
      warnings.push(`forked ${file} shared-import drift — ${parts.join('; ')}`)
    }
  }
}

// ── Report ───────────────────────────────────────────────────────────────────
for (const w of warnings) console.warn(`⚠ Electron parity: ${w}`)

if (fatal > 0) {
  console.error(`\n${fatal} Electron parity violation(s). See docs/explorations/0238.`)
  process.exit(1)
}
console.log(
  `✓ Electron parity OK — ${webRoutes.length} web routes checked ` +
    `(${COVERED.size} covered, ${WAIVED.size} waived)` +
    (warnings.length ? `, ${warnings.length} warning(s)` : '')
)
process.exit(0)
