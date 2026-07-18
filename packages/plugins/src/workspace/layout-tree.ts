/**
 * LayoutTree — the shell as data (exploration 0280).
 *
 * One tree of regions → slots → view references replaces the hard fork
 * between the calm shell and the workbench grid. The former shells become
 * *presets*: named, data-only configurations of the same tree (`quiet`,
 * `calm`, `bench`). Components never branch on which preset is loaded —
 * only on the tree's axes (chrome posture, slot tiers, tabsEnabled); the
 * source-grep tripwire in layout-tree.test.ts enforces this.
 *
 * The module is pure (no DOM, no zustand) so presets round-trip through
 * the `xnet:workspace` node payload and unit tests without a shell.
 */

import type { SlotRegion } from '../contributions'

export type ChromePosture = 'pinned' | 'quiet'

/**
 * The fixed region skeleton (the Zed/VS Code lesson: regions never
 * multiply, only their contents move). `surface` is the center and always
 * exists; the slot regions (docks + edge strips) come from the
 * contribution contract.
 */
export type RegionId = 'surface' | SlotRegion

export const REGION_IDS: RegionId[] = [
  'surface',
  'rail',
  'status',
  'dock.left',
  'dock.right',
  'dock.bottom',
  'dock.corner'
]

/**
 * Disclosure tier of a placed view: `pinned` renders in the frame at rest,
 * `summoned` is reachable from its region's launcher/chord/palette,
 * `hidden` only from the palette.
 */
export type SlotTier = 'pinned' | 'summoned' | 'hidden'

export interface SlotPlacement {
  /** Contribution id from the slot registry (e.g. 'navigator', 'shelf'). */
  viewId: string
  tier: SlotTier
  /** Sort key within the region (lower = earlier). */
  order: number
}

export interface LayoutTree {
  /** Which workspace (preset or saved node) this tree was loaded from. */
  workspaceId: string
  regions: Record<RegionId, SlotPlacement[]>
  /**
   * Surface capabilities. Tabs/split groups are content state and stay in
   * the workbench store; the tree only says whether the surface *shows*
   * them (the bench's tab strip vs the calm bare surface).
   */
  surface: { tabsEnabled: boolean }
  /** Chrome posture axis (0273) — orthogonal to placements. */
  chrome: ChromePosture
}

/** Built-in presets — read-only system workspaces (0280 phase 3). */
export type PresetId = 'quiet' | 'calm' | 'bench'

export const PRESET_IDS: PresetId[] = ['quiet', 'calm', 'bench']

/** Deterministic node ids for the seeded system workspaces. */
export const PRESET_WORKSPACE_ID_PREFIX = 'workspace-preset-'

export function presetWorkspaceId(preset: PresetId): string {
  return `${PRESET_WORKSPACE_ID_PREFIX}${preset}`
}

/** Whether a workspace id denotes a built-in preset (not a saved node). */
export function isPresetWorkspaceId(workspaceId: string): boolean {
  return presetForWorkspaceId(workspaceId) !== null
}

export function presetForWorkspaceId(workspaceId: string): PresetId | null {
  if (!workspaceId.startsWith(PRESET_WORKSPACE_ID_PREFIX)) return null
  const rest = workspaceId.slice(PRESET_WORKSPACE_ID_PREFIX.length)
  return (PRESET_IDS as string[]).includes(rest) ? (rest as PresetId) : null
}

function place(viewId: string, tier: SlotTier, order: number): SlotPlacement {
  return { viewId, tier, order }
}

function emptyRegions(): Record<RegionId, SlotPlacement[]> {
  return {
    surface: [],
    rail: [],
    status: [],
    'dock.left': [],
    'dock.right': [],
    'dock.bottom': [],
    'dock.corner': []
  }
}

/**
 * The corner dock's residents are identical across presets (the 0273
 * grammar): hero strip + secondary behind More, all summoned.
 */
function cornerResidents(): SlotPlacement[] {
  return [
    place('shelf', 'summoned', 0),
    place('capture', 'summoned', 1),
    place('notifications', 'summoned', 2),
    place('sync', 'summoned', 3),
    place('console', 'summoned', 4)
  ]
}

/**
 * Build the tree for a built-in preset. Presets are data ONLY — every
 * difference between the former shells must be expressible here, or it
 * does not exist.
 */
export function createPresetTree(preset: PresetId): LayoutTree {
  const regions = emptyRegions()
  switch (preset) {
    case 'quiet':
      regions.rail = [place('modes', 'summoned', 0)]
      regions['dock.left'] = [place('navigator', 'summoned', 0)]
      regions['dock.right'] = [place('context', 'summoned', 0)]
      regions['dock.corner'] = cornerResidents()
      return {
        workspaceId: presetWorkspaceId('quiet'),
        regions,
        surface: { tabsEnabled: false },
        chrome: 'quiet'
      }
    case 'calm':
      regions.rail = [place('modes', 'pinned', 0)]
      regions['dock.left'] = [place('navigator', 'pinned', 0)]
      regions['dock.right'] = [place('context', 'summoned', 0)]
      regions['dock.corner'] = cornerResidents()
      return {
        workspaceId: presetWorkspaceId('calm'),
        regions,
        surface: { tabsEnabled: false },
        chrome: 'pinned'
      }
    case 'bench':
      // 0353: the icon-only `rail` view is gone; the region stays as a
      // placement target for user-moved views.
      regions.rail = []
      regions.status = [place('status', 'pinned', 0)]
      regions['dock.left'] = [
        place('explorer', 'pinned', 0),
        place('chats', 'summoned', 1),
        place('tasks', 'summoned', 2),
        place('today', 'summoned', 3),
        place('data', 'summoned', 4),
        place('ai-chat', 'summoned', 5)
      ]
      regions['dock.right'] = [place('context', 'summoned', 0)]
      regions['dock.bottom'] = [
        place('shelf', 'summoned', 0),
        place('capture', 'summoned', 1),
        place('notifications', 'summoned', 2),
        place('sync', 'summoned', 3),
        place('console', 'summoned', 4)
      ]
      regions['dock.corner'] = []
      return {
        workspaceId: presetWorkspaceId('bench'),
        regions,
        surface: { tabsEnabled: true },
        chrome: 'pinned'
      }
  }
}

/**
 * The single canonical shell (exploration 0284). The former quiet/calm/bench
 * trichotomy collapses to one tree: a sectioned `sidebar` in the rail that
 * surfaces every tool, the full left dock, tabs on, pinned chrome. "Focus"
 * (hide chrome) is a store toggle, not a preset — so there is exactly one
 * composition and every feature is reachable without a mode switch.
 */
export const DEFAULT_WORKSPACE_ID = 'workspace-default'

export function createDefaultTree(): LayoutTree {
  const regions = emptyRegions()
  // The rail is empty (0353): the sectioned `sidebar` view it used to
  // place is gone, since the shipping shell renders its own sidebar
  // islands and the unified tree is the one nav.
  regions.rail = []
  regions.status = [place('status', 'pinned', 0)]
  regions['dock.left'] = [
    place('tree', 'pinned', 0),
    place('explorer', 'summoned', 1),
    place('chats', 'summoned', 2),
    place('tasks', 'summoned', 3),
    place('today', 'summoned', 4),
    place('data', 'summoned', 5),
    place('ai-chat', 'summoned', 6)
  ]
  regions['dock.right'] = [place('context', 'summoned', 0)]
  regions['dock.bottom'] = [
    place('shelf', 'summoned', 0),
    place('capture', 'summoned', 1),
    place('notifications', 'summoned', 2),
    place('sync', 'summoned', 3),
    place('console', 'summoned', 4)
  ]
  return {
    workspaceId: DEFAULT_WORKSPACE_ID,
    regions,
    surface: { tabsEnabled: true },
    chrome: 'pinned'
  }
}

// ─── Pure tree operations (every mutation is a command; commands call these) ──

function cloneRegions(regions: Record<RegionId, SlotPlacement[]>) {
  return Object.fromEntries(
    Object.entries(regions).map(([region, placements]) => [
      region,
      placements.map((placement) => ({ ...placement }))
    ])
  ) as Record<RegionId, SlotPlacement[]>
}

/** The region currently holding a view, if any. */
export function regionOf(tree: LayoutTree, viewId: string): RegionId | null {
  for (const region of REGION_IDS) {
    if (tree.regions[region].some((placement) => placement.viewId === viewId)) return region
  }
  return null
}

/** The placement record for a view, if any. */
export function placementOf(tree: LayoutTree, viewId: string): SlotPlacement | null {
  const region = regionOf(tree, viewId)
  if (!region) return null
  return tree.regions[region].find((placement) => placement.viewId === viewId) ?? null
}

function renumber(placements: SlotPlacement[]): SlotPlacement[] {
  return [...placements]
    .sort((a, b) => a.order - b.order)
    .map((placement, index) => ({ ...placement, order: index }))
}

/**
 * Insert a view into a region at a specific index (0282 phase 4),
 * keeping its tier. Works for cross-region moves AND within-region
 * reorders; the index is clamped, and orders stay dense on both sides.
 * No-op when the view is absent or nothing would change.
 */
export function insertSlot(
  tree: LayoutTree,
  viewId: string,
  to: RegionId,
  index: number
): LayoutTree {
  const from = regionOf(tree, viewId)
  if (!from) return tree
  const placement = tree.regions[from].find((entry) => entry.viewId === viewId)
  if (!placement) return tree

  const regions = cloneRegions(tree.regions)
  regions[from] = renumber(regions[from].filter((entry) => entry.viewId !== viewId))
  const target = [...regions[to]].sort((a, b) => a.order - b.order)
  const clamped = Math.max(0, Math.min(index, target.length))
  target.splice(clamped, 0, { ...placement, order: 0 })
  regions[to] = target.map((entry, position) => ({ ...entry, order: position }))

  const changed =
    from !== to ||
    regions[to].findIndex((entry) => entry.viewId === viewId) !==
      tree.regions[to].findIndex((entry) => entry.viewId === viewId)
  return changed ? { ...tree, regions } : tree
}

/**
 * Move a view to another region (appended last), keeping its tier.
 * No-op when the view is absent or already there.
 */
export function moveSlot(tree: LayoutTree, viewId: string, to: RegionId): LayoutTree {
  const from = regionOf(tree, viewId)
  if (!from || from === to) return tree
  return insertSlot(tree, viewId, to, tree.regions[to].length)
}

/** Change a placed view's disclosure tier. No-op when absent/unchanged. */
export function setSlotTier(tree: LayoutTree, viewId: string, tier: SlotTier): LayoutTree {
  const region = regionOf(tree, viewId)
  if (!region) return tree
  const current = tree.regions[region].find((entry) => entry.viewId === viewId)
  if (!current || current.tier === tier) return tree
  const regions = cloneRegions(tree.regions)
  regions[region] = regions[region].map((entry) =>
    entry.viewId === viewId ? { ...entry, tier } : entry
  )
  return { ...tree, regions }
}

/** Placements of a region, sorted, optionally filtered to a tier. */
export function slotsIn(tree: LayoutTree, region: RegionId, tier?: SlotTier): SlotPlacement[] {
  const placements = [...tree.regions[region]].sort((a, b) => a.order - b.order)
  return tier ? placements.filter((placement) => placement.tier === tier) : placements
}

// ─── Serialization (the workspace node payload — phase 3) ─────────────────

/**
 * Portable workspace payload: the tree plus a human name. Device-local
 * state (pixel sizes, monitor splits) deliberately stays OUT of the node —
 * it lives in the local store keyed by workspaceId.
 */
export interface WorkspacePayload {
  name: string
  /** Preset provenance, for "Reset to preset". Null = built from scratch. */
  preset: PresetId | null
  tree: LayoutTree
}

const TIERS: SlotTier[] = ['pinned', 'summoned', 'hidden']

function isPlacement(value: unknown): value is SlotPlacement {
  if (typeof value !== 'object' || value === null) return false
  const p = value as Record<string, unknown>
  return (
    typeof p.viewId === 'string' &&
    typeof p.order === 'number' &&
    TIERS.includes(p.tier as SlotTier)
  )
}

/**
 * Parse an untrusted payload (a synced node) back into a tree. Unknown
 * regions are dropped, missing regions become empty, malformed placements
 * are skipped — a shared workspace must never crash the shell.
 */
export function parseWorkspacePayload(value: unknown): WorkspacePayload | null {
  if (typeof value !== 'object' || value === null) return null
  const payload = value as Record<string, unknown>
  if (typeof payload.name !== 'string') return null
  const rawTree = payload.tree as Record<string, unknown> | undefined
  if (typeof rawTree !== 'object' || rawTree === null) return null
  if (typeof rawTree.workspaceId !== 'string') return null

  const chrome: ChromePosture = rawTree.chrome === 'quiet' ? 'quiet' : 'pinned'
  const rawSurface = rawTree.surface as Record<string, unknown> | undefined
  const tabsEnabled = rawSurface?.tabsEnabled === true

  const regions = emptyRegions()
  const rawRegions = rawTree.regions as Record<string, unknown> | undefined
  if (typeof rawRegions === 'object' && rawRegions !== null) {
    for (const region of REGION_IDS) {
      const entries = rawRegions[region]
      if (!Array.isArray(entries)) continue
      regions[region] = renumber(entries.filter(isPlacement))
    }
  }

  const preset = PRESET_IDS.includes(payload.preset as PresetId)
    ? (payload.preset as PresetId)
    : null

  return {
    name: payload.name,
    preset,
    tree: { workspaceId: rawTree.workspaceId, regions, surface: { tabsEnabled }, chrome }
  }
}

/** Serialize for the node payload. Inverse of {@link parseWorkspacePayload}. */
export function serializeWorkspacePayload(payload: WorkspacePayload): WorkspacePayload {
  return {
    name: payload.name,
    preset: payload.preset,
    tree: {
      workspaceId: payload.tree.workspaceId,
      regions: cloneRegions(payload.tree.regions),
      surface: { tabsEnabled: payload.tree.surface.tabsEnabled },
      chrome: payload.tree.chrome
    }
  }
}
