/**
 * Workspace layout primitives (exploration 0280): the layout tree, its
 * preset fixtures, pure tree operations, and the portable workspace
 * payload (de)serialization shared by web, desktop and the seed.
 */
export {
  createDefaultTree,
  createPresetTree,
  DEFAULT_WORKSPACE_ID,
  insertSlot,
  moveSlot,
  parseWorkspacePayload,
  placementOf,
  PRESET_IDS,
  PRESET_WORKSPACE_ID_PREFIX,
  isPresetWorkspaceId,
  presetForWorkspaceId,
  presetWorkspaceId,
  REGION_IDS,
  regionOf,
  serializeWorkspacePayload,
  setSlotTier,
  slotsIn
} from './layout-tree'
export type {
  ChromePosture,
  LayoutTree,
  PresetId,
  RegionId,
  SlotPlacement,
  SlotTier,
  WorkspacePayload
} from './layout-tree'
