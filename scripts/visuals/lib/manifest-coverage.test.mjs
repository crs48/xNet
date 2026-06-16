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
