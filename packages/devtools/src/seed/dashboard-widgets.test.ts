/**
 * Widget-type resolution gate for seeded dashboards.
 *
 * A `widgetType` the registry doesn't know fails **silently** — the dashboard
 * runtime renders an unknown/empty tile instead of throwing — so the seed
 * shipped `heatmap.streak` against a widget registered as
 * `experiments.streak-heatmap` and no test noticed. Every widget type the seed
 * emits is resolved here against a registry populated with the real built-ins.
 */

import type { SeedContext } from './types'
import type { DashboardWidgetInstance, DeterministicNodeImportDraft } from '@xnetjs/data'
import { registerBuiltinWidgets, WidgetRegistry } from '@xnetjs/dashboard'
import { DashboardSchema } from '@xnetjs/data'
import { describe, expect, it } from 'vitest'
import { buildFixtures, ORG_SPACE_ID } from './fixtures'
import { DEMO_PEOPLE, makeRng } from './seed-ids'
import { collectSeed, SCALES } from './seed-runner'

const ctx: SeedContext = {
  space: ORG_SPACE_ID,
  authorDID: 'did:key:zTestAuthor',
  people: DEMO_PEOPLE,
  fixtures: buildFixtures(),
  scale: SCALES.medium,
  rng: makeRng(9)
}

function seededWidgets(drafts: DeterministicNodeImportDraft[]) {
  return drafts
    .filter((draft) => draft.schemaId === DashboardSchema._schemaId)
    .flatMap((draft) => {
      const widgets = (draft.properties.widgets ?? []) as DashboardWidgetInstance[]
      return widgets.map((widget) => ({ dashboard: draft.id, widget }))
    })
}

function builtinRegistry(): WidgetRegistry {
  const registry = new WidgetRegistry()
  registerBuiltinWidgets(registry)
  return registry
}

describe('seeded dashboard widget types', () => {
  it('every widget the seed emits resolves in the widget registry', async () => {
    const registry = builtinRegistry()
    const { drafts } = await collectSeed(ctx)
    const seeded = seededWidgets(drafts)

    // A seed that produced no dashboards would pass vacuously — that is the
    // same silent green this test exists to prevent.
    expect(seeded.length, 'no seeded dashboard widgets found').toBeGreaterThan(0)

    const unresolved = seeded
      .filter(({ widget }) => !registry.has(widget.widgetType))
      .map(({ dashboard, widget }) => `${dashboard} → ${widget.widgetType}`)

    expect(
      unresolved,
      `unregistered widget types (known: ${registry
        .getAll()
        .map((w) => w.type)
        .sort()
        .join(', ')})`
    ).toEqual([])
  })

  it('the streak heatmap seeds the registered habit-heatmap type', async () => {
    const { drafts } = await collectSeed(ctx)
    const types = seededWidgets(drafts).map(({ widget }) => widget.widgetType)

    expect(types).toContain('experiments.streak-heatmap')
    expect(types).not.toContain('heatmap.streak')
  })

  it('negative control: an unregistered type is reported as unresolved', () => {
    const registry = builtinRegistry()

    // Proof the check above can go red — a `has()` that always answered true
    // (or a registry that silently registered nothing) would look identical to
    // a clean seed.
    expect(registry.has('heatmap.streak')).toBe(false)
    expect(registry.has('metric.count')).toBe(true)
  })
})
