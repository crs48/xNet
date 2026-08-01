export type {
  Disposable,
  Platform,
  PluginPermissions,
  PlatformCapabilities,
  ExtensionStorage
} from '../../packages/plugins/src/types'
export { getPlatformCapabilities, createExtensionStorage } from '../../packages/plugins/src/types'

export type { XNetExtension, PluginContributions } from '../../packages/plugins/src/manifest'
export {
  validateManifest,
  defineExtension,
  PluginValidationError
} from '../../packages/plugins/src/manifest'

export type {
  ViewContribution,
  ViewProps,
  CommandContribution,
  ImporterContribution,
  SlashCommandContribution,
  SlashCommandContext,
  EditorContribution,
  ToolbarContribution,
  SidebarContribution,
  PropertyHandlerContribution,
  PropertyHandler,
  PropertyCellProps,
  PropertyEditorProps,
  BlockContribution,
  BlockProps,
  SettingContribution,
  SettingsPanelProps,
  SchemaContribution,
  StatusBarContribution
} from '../../packages/plugins/src/contributions'
export { TypedRegistry, ContributionRegistry } from '../../packages/plugins/src/contributions'

export type {
  PendingChange,
  NodeChangeEvent,
  NodeStoreMiddleware
} from '../../packages/plugins/src/middleware'
export { MiddlewareChain } from '../../packages/plugins/src/middleware'

export type {
  ExtensionContext,
  PluginNodeChangeEvent,
  PluginNodeChangeListener,
  QueryFilter
} from '../../packages/plugins/src/context'
export { createExtensionContext } from '../../packages/plugins/src/context'

export type { PluginStatus, RegisteredPlugin } from '../../packages/plugins/src/registry'
export { PluginRegistry, PluginError } from '../../packages/plugins/src/registry'

export { PluginSchema } from '../../packages/plugins/src/schemas/plugin'
export type { PluginNode } from '../../packages/plugins/src/schemas/plugin'

// Command registry — used by canvas-view's useCanvasCommands (0277)
export { getCommandRegistry, installCommandHandler } from '../../packages/plugins/src/commands'
export type { WorkspaceCommand } from '../../packages/plugins/src/commands'

// Feature modules + capability guards — used by @xnetjs/meetings (0279)
export { defineFeatureModule } from '../../packages/plugins/src/feature-module'
export type { FeatureModule, ModuleCapabilities } from '../../packages/plugins/src/feature-module'
export {
  isSystemAudioAllowed,
  assertSystemAudio
} from '../../packages/plugins/src/ecosystem/capability-guard'
export type {
  AIProvider,
  AIMessage,
  AIGenerateRequest,
  AIStreamChunk
} from '../../packages/plugins/src/ai/providers'

// Workspace layout primitives + slot contributions (0280) — the workbench
// shell modules import these through the @xnetjs/plugins alias.
export {
  createDefaultTree,
  createPresetTree,
  DEFAULT_WORKSPACE_ID,
  insertSlot,
  isPresetWorkspaceId,
  moveSlot,
  parseWorkspacePayload,
  placementOf,
  PRESET_IDS,
  PRESET_WORKSPACE_ID_PREFIX,
  presetForWorkspaceId,
  presetWorkspaceId,
  REGION_IDS,
  regionOf,
  serializeWorkspacePayload,
  setSlotTier,
  slotsIn
} from '../../packages/plugins/src/workspace'
export type {
  ChromePosture,
  LayoutTree,
  PresetId,
  RegionId,
  SlotPlacement,
  SlotTier,
  WorkspacePayload
} from '../../packages/plugins/src/workspace'
export type { SlotContribution, SlotRegion } from '../../packages/plugins/src/contributions'
export { evaluateInstallConsent, scaffoldPlugin } from '../../packages/plugins/src/ecosystem'

// Editor schema-skew guard (0205, spec-based since 0312) — used by
// packages/react's useMergedEditorContributions.
export {
  findEditorSchemaRisks,
  isSchemaDefiningContribution,
  warnOnEditorSchemaRisks
} from '../../packages/plugins/src/editor-schema-safety'
export type { EditorSchemaRisk } from '../../packages/plugins/src/editor-schema-safety'

// AI surface + connector exports (0406): the workbench chrome (and its lazy
// AI panel) resolve these at build time; stories never run the engine.
export {
  AgentAuditRecorder,
  AiSurfaceService,
  createAiSurfaceService,
  createApprovalBroker
} from '../../packages/plugins/src/ai-surface'
export type {
  AgentCallOutcome,
  AgentPendingApproval,
  AiCallableTool,
  AiContextPack,
  AiContextRetriever,
  AiRiskLevel,
  AiSurfaceServiceConfig,
  ApprovalResolution,
  ParkedApproval
} from '../../packages/plugins/src/ai-surface'

// Local-API interface types (0337 ceremony, 0394 schema tools). Type-only —
// `export type` is erased, so the node-only `services` runtime never bundles.
export type {
  NodeStoreAPI,
  SchemaData,
  SchemaRegistryAPI
} from '../../packages/plugins/src/services'
export {
  createAIProvider,
  createAiAgentRuntime,
  createManagedProvider,
  createMemoryAiAgentRuntimeStorage,
  createPromptApiProvider,
  createWebLLMProvider,
  detectConnectors,
  downloadPromptApiModel,
  promptApiAvailability,
  WebLLMProvider,
  writeModeFor
} from '../../packages/plugins/src/ai'
export type {
  AiAgentRuntime,
  AiAssistMode,
  AIProvider,
  AIProviderConfig,
  AIToolCall,
  AIToolSpec,
  ConnectorDetection,
  ConnectorTier,
  ManagedBudgetSnapshot,
  PromptApiAvailability,
  ToolCallingFidelity,
  WebLLMEngineLike,
  WebLLMProviderOptions,
  WriteMode
} from '../../packages/plugins/src/ai'
