/**
 * LayoutTree (0280) — canonical module lives in @xnetjs/plugins
 * (`workspace/layout-tree`), shared with the seed and the desktop shell.
 * This shim keeps the workbench's local import paths stable.
 */
export {
  createPresetTree,
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
} from '@xnetjs/plugins'
export type {
  ChromePosture,
  LayoutTree,
  PresetId,
  RegionId,
  SlotPlacement,
  SlotTier,
  WorkspacePayload
} from '@xnetjs/plugins'
