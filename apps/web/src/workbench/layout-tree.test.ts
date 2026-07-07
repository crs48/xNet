/**
 * LayoutTree tests (0280): preset fixtures, pure tree operations, the
 * workspace-payload round trip, and the preset tripwire — no shell
 * component may branch on which preset is loaded (presets are data only).
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  createPresetTree,
  moveSlot,
  parseWorkspacePayload,
  placementOf,
  PRESET_IDS,
  presetForWorkspaceId,
  presetWorkspaceId,
  regionOf,
  serializeWorkspacePayload,
  setSlotTier,
  slotsIn
} from './layout-tree'

describe('presets', () => {
  it('builds a distinct tree per preset with stable workspace ids', () => {
    for (const preset of PRESET_IDS) {
      const tree = createPresetTree(preset)
      expect(tree.workspaceId).toBe(presetWorkspaceId(preset))
      expect(presetForWorkspaceId(tree.workspaceId)).toBe(preset)
    }
    expect(presetForWorkspaceId('workspace-abc')).toBeNull()
  })

  it('expresses the former shells as data: chrome + tabs + placements', () => {
    const quiet = createPresetTree('quiet')
    const calm = createPresetTree('calm')
    const bench = createPresetTree('bench')

    expect(quiet.chrome).toBe('quiet')
    expect(calm.chrome).toBe('pinned')
    expect(bench.surface.tabsEnabled).toBe(true)
    expect(calm.surface.tabsEnabled).toBe(false)

    // Calm pins the navigator; quiet summons the same view.
    expect(placementOf(calm, 'navigator')?.tier).toBe('pinned')
    expect(placementOf(quiet, 'navigator')?.tier).toBe('summoned')

    // The bench keeps the 0166 left stack and the status bar.
    expect(slotsIn(bench, 'dock.left').map((p) => p.viewId)).toContain('explorer')
    expect(slotsIn(bench, 'status', 'pinned')).toHaveLength(1)
  })
})

describe('tree operations', () => {
  it('moves a view between regions, renumbering both sides', () => {
    const tree = createPresetTree('bench')
    const moved = moveSlot(tree, 'console', 'dock.corner')
    expect(regionOf(moved, 'console')).toBe('dock.corner')
    expect(slotsIn(moved, 'dock.bottom').map((p) => p.viewId)).not.toContain('console')
    // Orders stay dense in the source region.
    expect(slotsIn(moved, 'dock.bottom').map((p) => p.order)).toEqual([0, 1, 2, 3])
    // The original tree is untouched (pure).
    expect(regionOf(tree, 'console')).toBe('dock.bottom')
  })

  it('no-ops on unknown views and same-region moves', () => {
    const tree = createPresetTree('calm')
    expect(moveSlot(tree, 'nope', 'dock.left')).toBe(tree)
    expect(moveSlot(tree, 'navigator', 'dock.left')).toBe(tree)
  })

  it('changes a tier in place', () => {
    const tree = createPresetTree('calm')
    const hidden = setSlotTier(tree, 'context', 'hidden')
    expect(placementOf(hidden, 'context')?.tier).toBe('hidden')
    expect(setSlotTier(hidden, 'context', 'hidden')).toBe(hidden)
  })
})

describe('workspace payload round trip', () => {
  it('round-trips every preset losslessly', () => {
    for (const preset of PRESET_IDS) {
      const payload = {
        name: `Preset ${preset}`,
        preset,
        tree: createPresetTree(preset)
      }
      const parsed = parseWorkspacePayload(
        JSON.parse(JSON.stringify(serializeWorkspacePayload(payload)))
      )
      expect(parsed).toEqual(payload)
    }
  })

  it('drops malformed placements and unknown regions without crashing', () => {
    const parsed = parseWorkspacePayload({
      name: 'From a stranger',
      preset: 'nonsense',
      tree: {
        workspaceId: 'workspace-x',
        chrome: 'sideways',
        surface: { tabsEnabled: 'yes' },
        regions: {
          'dock.left': [
            { viewId: 'navigator', tier: 'pinned', order: 0 },
            { viewId: 42, tier: 'pinned', order: 1 },
            { viewId: 'ghost', tier: 'launched', order: 2 }
          ],
          'dock.diagonal': [{ viewId: 'navigator', tier: 'pinned', order: 0 }]
        }
      }
    })
    expect(parsed).not.toBeNull()
    expect(parsed?.preset).toBeNull()
    expect(parsed?.tree.chrome).toBe('pinned')
    expect(parsed?.tree.surface.tabsEnabled).toBe(false)
    expect(parsed?.tree.regions['dock.left']).toEqual([
      { viewId: 'navigator', tier: 'pinned', order: 0 }
    ])
    expect(parseWorkspacePayload(null)).toBeNull()
    expect(parseWorkspacePayload({ name: 7 })).toBeNull()
  })
})

/**
 * The preset tripwire (0280 risk 2): if shell components branch on which
 * preset is loaded, we have rebuilt the three-shell fork inside one
 * component. Presets must stay data-only — components read the tree's
 * axes (chrome, tiers, tabsEnabled), never the preset identity.
 */
describe('preset tripwire', () => {
  const FORBIDDEN = [
    /\bpreset(Id)?\s*===/,
    /\bworkspaceId\s*===\s*['"`]/,
    /presetForWorkspaceId\([^)]*\)\s*===/
  ]

  function componentFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) return componentFiles(path)
      return entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx') ? [path] : []
    })
  }

  it('no shell component branches on the loaded preset', () => {
    const offenders: string[] = []
    for (const file of componentFiles(__dirname)) {
      const source = readFileSync(file, 'utf8')
      if (FORBIDDEN.some((pattern) => pattern.test(source))) offenders.push(file)
    }
    expect(offenders).toEqual([])
  })
})
