/**
 * Core tips point at anchors that exist (0428).
 *
 * `CoachmarkLayer` renders `null` when a tip's anchor selector resolves to no
 * element — correct behaviour, and completely silent. Before this test every
 * one of the four core tips named a `[data-coach="rail.*"]` selector that
 * appeared in no component at all, so the whole first-run tip system had been
 * shipping nothing while looking fully wired.
 *
 * A source-grep tripwire rather than a render test: the tips are registered at
 * module load against a rail that lives in another package, so the question
 * worth asking is "does this selector exist anywhere in the product", which is
 * exactly what a scan can answer and a jsdom mount cannot.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { DEFAULT_SECTIONS, SURFACES } from '@xnetjs/workbench'
import { describe, expect, it } from 'vitest'
import { tipsForView, type CoachTip } from './registry'
import './tips'

const ROOT = resolve(__dirname, '../../../..')
const SCAN = [join(ROOT, 'apps/web/src'), join(ROOT, 'packages/workbench/src')]
const SKIP = new Set(['node_modules', 'dist', '.turbo', 'coverage'])

function collect(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!SKIP.has(entry.name)) collect(full, out)
    } else if (entry.name.endsWith('.tsx')) {
      out.push(full)
    }
  }
  return out
}

/**
 * Every `data-coach` value a component can actually render.
 *
 * The rail buttons carry `data-coach={`rail.${surface.id}`}`, so their anchors
 * are enumerated by expanding the real surface registry rather than by
 * accepting any `rail.*` string — an escape hatch that broad would let a
 * misspelled surface id pass as live, which is the exact bug this test exists
 * to catch.
 */
function liveAnchors(): Set<string> {
  const anchors = new Set<string>()
  for (const dir of SCAN) {
    for (const file of collect(dir)) {
      if (file.includes('.test.') || file.includes('.stories.')) continue
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(/data-coach="([^"]+)"/g)) anchors.add(match[1])
      if (/data-coach=\{`rail\.\$\{/.test(source) || /coachAnchor=\{`rail\.\$\{/.test(source)) {
        // Two nav populations render rail rows: the legacy pinned surfaces and
        // the unified sections (0353), which is the shipped default. Expanding
        // both is what makes `rail.crm` vs `rail.people` a caught mistake
        // rather than a silent one.
        for (const surface of SURFACES) anchors.add(`rail.${surface.id}`)
        for (const section of DEFAULT_SECTIONS) anchors.add(`rail.${section.id}`)
      }
    }
  }
  return anchors
}

const VIEWS = ['home', 'crm', 'tasks', 'discover', 'finance', 'analytics', 'meetings']
const ALL_TIPS: CoachTip[] = VIEWS.flatMap((view) => tipsForView(view))

describe('core coachmark anchors', () => {
  const anchors = liveAnchors()

  it('registers a tip for every view it claims to cover', () => {
    expect(ALL_TIPS.length).toBeGreaterThanOrEqual(VIEWS.length)
  })

  it.each(ALL_TIPS.map((tip) => [tip.id, tip.anchor] as const))(
    '%s anchors to an element that exists',
    (_id, anchor) => {
      const name = anchor.match(/\[data-coach="([^"]+)"\]/)?.[1]
      expect(name, `${anchor} is not a data-coach selector`).toBeTruthy()
      expect(
        anchors.has(name!),
        `no component renders data-coach="${name}" — this tip renders nothing`
      ).toBe(true)
    }
  )
})
