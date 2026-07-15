/**
 * Workspace-plugin runtime (exploration 0331) — sub-barrel.
 *
 * Plugin source as workspace nodes → in-browser build → sandboxed execution →
 * live contribution registration → hot reload → agent feedback. The spine
 * that closes the spec→plugin loop.
 */

// Schema
export {
  PluginSourceSchema,
  PLUGIN_SOURCE_SCHEMA_IRI,
  readPluginSourceNode
} from '../schemas/plugin-source'
export type {
  PluginSourceNode,
  WorkspacePluginManifestData,
  WorkspacePluginContributionsData
} from '../schemas/plugin-source'

// Import map + builder
export {
  DEFAULT_PLUGIN_IMPORT_MAP,
  PLUGIN_API_SPECIFIER,
  isPinnedSpecifier,
  isRelativeSpecifier
} from './import-map'
export type { VendorModuleSources } from './import-map'
export {
  buildPluginModuleGraph,
  normalizeSourcePath,
  resolveRelativeImport,
  scanModuleImports
} from './builder'
export type {
  PluginBuildDiagnostic,
  PluginBuildInput,
  PluginBuiltModule,
  PluginFileTranspiler,
  PluginModuleGraph,
  ScannedImport
} from './builder'

// Frame + protocol
export {
  PLUGIN_FRAME_SANDBOX,
  buildPluginFrameSrcdoc,
  frameConnectSrc,
  framePluginCsp
} from './frame'
export { PLUGIN_STORE_OPS } from './protocol'
export type {
  PluginFrameToHostMessage,
  PluginGraphPayload,
  PluginHostToFrameMessage,
  PluginStoreOp
} from './protocol'

// Store RPC
export {
  PLUGIN_STORE_DENYLIST,
  PluginStoreRpcError,
  createPluginStoreRpc,
  isDenylistedSchema
} from './store-rpc'
export type { PluginStoreRpc, WorkspacePluginStore } from './store-rpc'

// Session + host
export { createPluginFrameSession } from './session'
export type {
  PluginFeedbackEntry,
  PluginFrameSession,
  PluginFrameSessionOptions,
  PluginRegisteredHandlers
} from './session'
export {
  WorkspacePluginError,
  activateWorkspacePlugin,
  buildWorkspacePlugin,
  permissionsToCapabilities,
  validateWorkspaceManifest
} from './host'
export type {
  PluginFrameTransport,
  WorkspacePluginHandle,
  WorkspacePluginHostDeps,
  WorkspacePluginStatus
} from './host'

// Hash pinning + drift (0327-E)
export {
  assessPluginUpdate,
  canonicalJson,
  computePluginSourceHash,
  diffPluginSourceFiles
} from './hash'
export type { PluginSourceDiff, PluginUpdateAssessment } from './hash'

// Watcher + hot reload
export {
  SOURCE_SETTLE_DEBOUNCE_MS,
  createPluginSourceWatcher,
  createWorkspacePluginHotReloader
} from './watcher'
export type {
  HotReloadEvent,
  PluginSourceSubscribable,
  PluginSourceWatcher,
  WorkspacePluginHotReloader
} from './watcher'

// Preview + agent tools
export { createWorkspacePluginPreviewManager } from './preview'
export type { WorkspacePluginPreviewManager, WorkspacePluginPreviewResult } from './preview'
export { createWorkspacePluginAgentTools, scaffoldWorkspacePluginFiles } from './agent-tools'
export type {
  WorkspacePluginAgentToolsOptions,
  WorkspacePluginDraftBackend,
  WorkspacePluginSourceBackend
} from './agent-tools'

// Publish (5a)
export {
  buildCommunityRegistryEntry,
  exportPluginSourceAsRepoFiles,
  requestWorkspacePluginPublish
} from './publish'
export type {
  CommunityRegistryEntry,
  PublishConsentRequest,
  WorkspacePluginPublishResult
} from './publish'
