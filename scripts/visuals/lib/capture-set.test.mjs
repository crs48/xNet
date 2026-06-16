import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  globToRegExp,
  matchesAny,
  normalizePath,
  computeCaptureSet,
  captureSetIsEmpty
} from './capture-set.mjs'

test('normalizePath strips leading ./ and normalizes separators', () => {
  assert.equal(normalizePath('./packages/ui/x.tsx'), 'packages/ui/x.tsx')
  assert.equal(normalizePath('packages\\ui\\x.tsx'), 'packages/ui/x.tsx')
})

test('globToRegExp: ** spans path segments, * stays within one', () => {
  assert.match('packages/views/src/a/b/C.tsx', globToRegExp('packages/views/**'))
  assert.match('packages/views/X.tsx', globToRegExp('packages/views/**'))
  assert.doesNotMatch('packages/data/X.tsx', globToRegExp('packages/views/**'))
  assert.match('a/SettingsView.tsx', globToRegExp('a/SettingsView*'))
  assert.doesNotMatch('a/sub/SettingsView.tsx', globToRegExp('a/SettingsView*'))
})

test('matchesAny is true when any glob matches', () => {
  assert.equal(matchesAny('packages/data/q.ts', ['packages/views/**', 'packages/data/**']), true)
  assert.equal(matchesAny('packages/core/q.ts', ['packages/views/**']), false)
})

const STORIES = [
  {
    id: 'ui-primitives-button--default',
    title: 'UI/Primitives/Button',
    name: 'Default',
    importPath: './packages/ui/src/primitives/Button.stories.tsx'
  },
  {
    id: 'editor-richtexteditor--default',
    title: 'Editor/RichTextEditor',
    name: 'Default',
    importPath: './packages/editor/src/RichTextEditor.stories.tsx'
  }
]

const ROUTES = [
  {
    id: 'home',
    label: 'Home',
    path: '/',
    globs: ['apps/web/src/routes/index.tsx', 'packages/ui/**']
  },
  { id: 'data', label: 'Data', path: '/data', globs: ['packages/views/**'] }
]

const FLOWS = [{ id: 'create-page', label: 'Create a page', globs: ['packages/editor/**'] }]

test('a story is captured when its own file changed', () => {
  const set = computeCaptureSet({
    changedFiles: ['packages/ui/src/primitives/Button.stories.tsx'],
    storyEntries: STORIES,
    routeManifest: ROUTES,
    flowManifest: FLOWS
  })
  assert.deepEqual(
    set.stories.map((s) => s.id),
    ['ui-primitives-button--default']
  )
})

test('a story is captured when a co-located component changed (sibling match)', () => {
  const set = computeCaptureSet({
    changedFiles: ['packages/ui/src/primitives/Button.tsx'],
    storyEntries: STORIES,
    routeManifest: ROUTES,
    flowManifest: FLOWS
  })
  assert.deepEqual(
    set.stories.map((s) => s.id),
    ['ui-primitives-button--default']
  )
})

test('sibling match can be disabled', () => {
  const set = computeCaptureSet(
    {
      changedFiles: ['packages/ui/src/primitives/Button.tsx'],
      storyEntries: STORIES,
      routeManifest: ROUTES,
      flowManifest: FLOWS
    },
    { matchSiblingComponents: false }
  )
  assert.equal(set.stories.length, 0)
})

test('routes and flows match by glob', () => {
  const set = computeCaptureSet({
    changedFiles: ['packages/views/src/DatabaseSurface.tsx', 'packages/editor/src/x.ts'],
    storyEntries: STORIES,
    routeManifest: ROUTES,
    flowManifest: FLOWS
  })
  assert.deepEqual(
    set.routes.map((r) => r.id),
    ['data']
  )
  assert.deepEqual(
    set.flows.map((f) => f.id),
    ['create-page']
  )
})

test('web UI change with no specific route falls back to home', () => {
  const set = computeCaptureSet({
    changedFiles: ['apps/web/src/components/Widget.tsx'],
    storyEntries: [],
    routeManifest: ROUTES,
    flowManifest: FLOWS
  })
  assert.deepEqual(
    set.routes.map((r) => r.id),
    ['home']
  )
})

test('a non-UI change captures nothing', () => {
  const set = computeCaptureSet({
    changedFiles: ['packages/core/src/store.ts', 'docs/readme.md'],
    storyEntries: STORIES,
    routeManifest: ROUTES,
    flowManifest: FLOWS
  })
  assert.equal(captureSetIsEmpty(set), true)
})

// --- 0191 regressions: a domain surface must win over the home fallback. ----

test('a domain-component change maps to its own route, not home (0191)', () => {
  // Home no longer globs apps/web/src/components/** — so a CRM change must hit
  // the /crm route and NOT also drag in home (which renders no CRM).
  const routes = [
    { id: 'home', label: 'Home', path: '/', globs: ['apps/web/src/routes/index.tsx'] },
    { id: 'crm', label: 'CRM', path: '/crm', globs: ['apps/web/src/components/crm/**'] }
  ]
  const flows = [{ id: 'crm-quote', label: 'Quote', globs: ['apps/web/src/components/crm/**'] }]
  const set = computeCaptureSet({
    changedFiles: [
      'apps/web/src/components/crm/ProductsPanel.tsx',
      'apps/web/src/components/crm/DealLineItems.tsx'
    ],
    storyEntries: [],
    routeManifest: routes,
    flowManifest: flows
  })
  assert.deepEqual(
    set.routes.map((r) => r.id),
    ['crm']
  )
  assert.deepEqual(
    set.flows.map((f) => f.id),
    ['crm-quote']
  )
})

test('a packages/ui change with no story still falls back to home (0191)', () => {
  // Dropping packages/ui/** from home's globs is only safe because the fallback
  // webUiPattern was broadened to recognize packages/ui/src as a web-UI change.
  const set = computeCaptureSet({
    changedFiles: ['packages/ui/src/primitives/Spinner.tsx'],
    storyEntries: [],
    routeManifest: [
      { id: 'home', label: 'Home', path: '/', globs: ['apps/web/src/routes/index.tsx'] }
    ],
    flowManifest: []
  })
  assert.deepEqual(
    set.routes.map((r) => r.id),
    ['home']
  )
})
