/**
 * @xnetjs/workbench — the host-agnostic workbench core (exploration 0406).
 *
 * What lives here is everything the shell knows without asking its host: the
 * workbench store, tab/preview grammar, navigation intent, surface registry,
 * command wiring, and the PlatformPort the host implements. What does NOT live
 * here: routes, URLs, React chrome, and anything that imports a host API —
 * web's TanStack Router and desktop's ShellState both sit on the far side of
 * the port.
 *
 * apps/web/src/workbench/* keeps shim files at the old paths (the 0280
 * layout-tree pattern) so consumers migrate opportunistically; both roads
 * resolve to this one module instance.
 */

export * from './agent-layout-event'
export * from './doc-id'
export * from './host'
export * from './inspect/source-stamp'
export * from './layout-tree'
export * from './lib/data-runtime'
export * from './lib/format-bytes'
export * from './lib/saved-view-registry'
export * from './lib/settings-sections'
export * from './platform'
export * from './state'
export * from './tabs'
export * from './navigation'
export * from './surfaces'
export * from './view-registry'
export * from './views/explorer-items'
export * from './views/explorer-folders-context'
export * from './views/tag-view-data'
export * from './hooks/useNodeActions'
export * from './hooks/usePageSearchSurface'
export * from './hooks/useRequestCount'
export * from './hooks/useSpaces'
export * from './lib/desk'
// Shell chrome (0406) — the components both hosts mount.
export * from './builtin-slot-views'
export * from './GlobalSearch'
export * from './UndoToast'
export * from './Workbench'
export * from './WorkspaceCommands'
export * from './ViewHost'
export * from './calm/CompanionView'
export * from './context-panel'
export * from './drafts/DraftSwitcher'
export * from './sidebar/LensChips'
export * from './sidebar/contracts'
export * from './sidebar/sources'
export * from './slot-registry'
export * from './status'
// Named, not `export *`: the module also exports `SyncStatus`, which collides
// with the same-named status union re-exported from `@xnetjs/react`.
export { openSyncStatusPanel } from './SyncStatus'
export * from './use-layout-mode'
export * from './commands'
export * from './focus'
export * from './route-title'
export * from './sidebar/sections'
export * from './views/explorer-sort'
export * from './test-platform'
