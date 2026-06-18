/**
 * Guards against the failure mode in exploration 0191: a new workbench surface
 * ships, nobody updates `manifests.json`, and the visual-capture job silently
 * renders the wrong page (or home) and reports "No visual differences detected."
 *
 * These tests run against the REAL `manifests.json` and the REAL route tree
 * (resolved from this file's location, so they're cwd-independent), so adding an
 * unmapped singleton route — or re-introducing the broad `home` glob that caused
 * the original bug — turns red instead of failing silently in CI.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { computeCaptureSet } from './capture-set.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..', '..', '..')
const manifests = JSON.parse(readFileSync(join(here, '..', 'manifests.json'), 'utf8'))

// Singleton routes intentionally without a visual baseline, each for a concrete
// reason — NOT a dumping ground. A real product surface belongs in routes[],
// not here.
//   __root  — layout wrapper, not a page.
//   welcome — onboarding; capture.mjs advances past it and the test-bypass
//             identity is already onboarded, so /welcome redirects to /.
//   share   — secret-gated redirect bridge; needs a fragment secret to render.
//   stories — dev-only pointer to Storybook; environment-dependent.
const EXEMPT = new Set(['__root', 'welcome', 'share', 'stories'])

// Parameterized routes (`name.$param.tsx`) can't be visited as static URLs --
// they need a real id + seed data -- so they are invisible to the route
// capturer and were the blind spot that let PR #174's chat redesign slip through
// as "no visual differences" (exploration 0200). Each must be covered by a
// flow (which seeds + navigates) or be listed here with a concrete reason for
// being deferred. NOT a dumping ground: a deferred surface is a TODO, not a
// permanent exemption.
const PARAM_EXEMPT = new Map([
  ['dashboard.$dashboardId', 'needs a seeded dashboard id; flow deferred'],
  ['db.$dbId', 'needs a seeded database id; flow deferred'],
  ['lab.$labId', 'needs an installed lab; flow deferred'],
  ['map.$mapId', 'needs a seeded map id; flow deferred'],
  ['person.$did', 'public profile; needs a real DID + federated fetch; flow deferred'],
  ['space.$spaceId', 'needs a seeded space id; flow deferred'],
  ['tag.$tagId', 'needs existing tagged content; flow deferred'],
  ['view.$viewId', 'needs a saved view id; flow deferred']
])

test('every singleton app route is mapped in manifests.json (or explicitly exempt) — 0191', () => {
  const mappedPaths = new Set(manifests.routes.map((r) => r.path))
  const routeNames = readdirSync(join(repoRoot, 'apps/web/src/routes'))
    .filter((f) => f.endsWith('.tsx') && !f.includes('$')) // skip parameterized routes
    .map((f) => f.replace(/\.tsx$/, ''))

  const missing = routeNames.filter((name) => {
    if (EXEMPT.has(name)) return false
    const path = name === 'index' ? '/' : `/${name}`
    return !mappedPaths.has(path)
  })

  assert.deepEqual(
    missing,
    [],
    `Unmapped singleton route(s): ${missing.join(', ')}. Add a routes[] entry to ` +
      `scripts/visuals/manifests.json (plus a flows[] entry if the UI is ` +
      `interaction-gated), or add the name to EXEMPT in this test with a reason.`
  )
})

test('every parameterized route is flow-covered or explicitly exempt — 0200', () => {
  // A flow "covers" a route when one of its globs is that route's exact file.
  const flowCovered = new Set(
    manifests.flows.flatMap((f) => f.globs).filter((g) => g.startsWith('apps/web/src/routes/'))
  )
  const paramRoutes = readdirSync(join(repoRoot, 'apps/web/src/routes'))
    .filter((f) => f.endsWith('.tsx') && f.includes('$'))
    .map((f) => f.replace(/\.tsx$/, ''))

  const uncovered = paramRoutes.filter(
    (name) => !PARAM_EXEMPT.has(name) && !flowCovered.has(`apps/web/src/routes/${name}.tsx`)
  )
  assert.deepEqual(
    uncovered,
    [],
    `Parameterized route(s) with no flow coverage: ${uncovered.join(', ')}. Add a ` +
      `flows[] entry (+ runner in flows.mjs) whose globs include the route file, or ` +
      `add the name to PARAM_EXEMPT in this test with a reason. These surfaces are ` +
      `invisible to the static route capturer (exploration 0200).`
  )
})

test('PARAM_EXEMPT has no stale entries (route gone or now flow-covered) — 0200', () => {
  const flowCovered = new Set(
    manifests.flows.flatMap((f) => f.globs).filter((g) => g.startsWith('apps/web/src/routes/'))
  )
  const existing = new Set(
    readdirSync(join(repoRoot, 'apps/web/src/routes'))
      .filter((f) => f.endsWith('.tsx') && f.includes('$'))
      .map((f) => f.replace(/\.tsx$/, ''))
  )
  const stale = [...PARAM_EXEMPT.keys()].filter(
    (name) => !existing.has(name) || flowCovered.has(`apps/web/src/routes/${name}.tsx`)
  )
  assert.deepEqual(
    stale,
    [],
    `PARAM_EXEMPT entr(y/ies) no longer needed (route removed, or now flow-covered): ` +
      `${stale.join(', ')}. Drop them from PARAM_EXEMPT.`
  )
})

test('home stays shell-only — no broad components/** or packages/ui/** glob (0191)', () => {
  const home = manifests.routes.find((r) => r.id === 'home')
  assert.ok(home, 'home route must exist in manifests.json')
  const broad = home.globs.filter((g) => /(?:components|packages\/ui)\/\*\*$/.test(g))
  assert.deepEqual(
    broad,
    [],
    `home must not glob broad component trees (${broad.join(', ')}) — they ` +
      `false-match every domain surface onto / and suppress the real diff (0191).`
  )
})

test("PR #118's CRM files resolve to /crm + crm-quote against the real manifest (0191)", () => {
  const set = computeCaptureSet({
    changedFiles: [
      'apps/web/src/components/crm/CrmView.tsx',
      'apps/web/src/components/crm/CrmPipeline.tsx',
      'apps/web/src/components/crm/DealLineItems.tsx',
      'apps/web/src/components/crm/ProductsPanel.tsx'
    ],
    storyEntries: [],
    routeManifest: manifests.routes,
    flowManifest: manifests.flows
  })
  assert.deepEqual(
    set.routes.map((r) => r.id),
    ['crm'],
    'CRM change should target /crm only, never the home document list'
  )
  assert.deepEqual(
    set.flows.map((f) => f.id),
    ['crm-quote']
  )
})

test('every flow id in manifests.json has a runner in flows.mjs (and vice versa)', async () => {
  const { FLOWS } = await import('../flows.mjs')
  const manifestFlowIds = new Set(manifests.flows.map((f) => f.id))
  const runnerIds = new Set(Object.keys(FLOWS))
  const missingRunner = [...manifestFlowIds].filter((id) => !runnerIds.has(id))
  const orphanRunner = [...runnerIds].filter((id) => !manifestFlowIds.has(id))
  assert.deepEqual(
    missingRunner,
    [],
    `flow(s) declared in manifests.json with no runner in flows.mjs`
  )
  assert.deepEqual(orphanRunner, [], `runner(s) in flows.mjs with no manifests.json flow entry`)
})
