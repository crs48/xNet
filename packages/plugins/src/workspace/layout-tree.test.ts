/**
 * LayoutTree tests (0280): preset fixtures, pure tree operations, and the
 * workspace-payload round trip. The preset tripwire (no shell component
 * may branch on the loaded preset) lives in the web app next to the
 * components it polices.
 */
import { describe, expect, it } from 'vitest'
import {
  createPresetTree,
  insertSlot,
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

describe('insertSlot (0282)', () => {
  it('reorders within a region with dense orders', () => {
    const tree = createPresetTree('bench')
    // dock.bottom: shelf, capture, notifications, sync, console
    const reordered = insertSlot(tree, 'console', 'dock.bottom', 0)
    expect(slotsIn(reordered, 'dock.bottom').map((p) => p.viewId)).toEqual([
      'console',
      'shelf',
      'capture',
      'notifications',
      'sync'
    ])
    expect(slotsIn(reordered, 'dock.bottom').map((p) => p.order)).toEqual([0, 1, 2, 3, 4])
  })

  it('inserts cross-region at the given index and clamps', () => {
    const tree = createPresetTree('bench')
    const moved = insertSlot(tree, 'console', 'dock.left', 1)
    expect(slotsIn(moved, 'dock.left').map((p) => p.viewId)[1]).toBe('console')
    const clamped = insertSlot(tree, 'console', 'dock.left', 99)
    expect(
      slotsIn(clamped, 'dock.left')
        .map((p) => p.viewId)
        .at(-1)
    ).toBe('console')
  })

  it('no-ops on unknown views and same-position inserts', () => {
    const tree = createPresetTree('bench')
    expect(insertSlot(tree, 'nope', 'dock.left', 0)).toBe(tree)
    const bottom = slotsIn(tree, 'dock.bottom').map((p) => p.viewId)
    const samePos = insertSlot(tree, 'shelf', 'dock.bottom', 0)
    expect(slotsIn(samePos, 'dock.bottom').map((p) => p.viewId)).toEqual(bottom)
  })

  it('moveSlot is insertSlot-at-end', () => {
    const tree = createPresetTree('bench')
    expect(slotsIn(moveSlot(tree, 'console', 'dock.left'), 'dock.left')).toEqual(
      slotsIn(insertSlot(tree, 'console', 'dock.left', 99), 'dock.left')
    )
  })
})
