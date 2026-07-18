/**
 * @xnetjs/plugins - Plugin system for extending xNet
 *
 * Provides infrastructure for:
 * - Plugin registration and lifecycle management
 * - Extension points (views, commands, editor extensions, etc.)
 * - NodeStore middleware for pre/post change hooks
 * - Plugin storage as Nodes for P2P sync
 */

// Core types
export type {
  Disposable,
  Platform,
  PluginPermissions,
  PlatformCapabilities,
  ExtensionStorage
} from './types'
export { getPlatformCapabilities, createExtensionStorage } from './types'

// Canvas plugin permission policy
export {
  createCanvasPluginPermissionPrompt,
  evaluateCanvasPluginPermissionGate,
  normalizeCanvasPluginWorkspacePolicy
} from './canvas-permissions'
export type {
  CanvasPluginPermissionDecisionStatus,
  CanvasPluginPermissionGateDecision,
  CanvasPluginPermissionGateInput,
  CanvasPluginPermissionPrompt,
  CanvasPluginPermissionPromptOption,
  CanvasPluginPromptMode,
  CanvasPluginWorkspacePolicy
} from './canvas-permissions'

// Manifest
export type { XNetExtension, PluginContributions, PluginPricing } from './manifest'
export { validateManifest, defineExtension, PluginValidationError, isPaidPricing } from './manifest'

// Contributions
export type {
  ViewContribution,
  ViewProps,
  WidgetContribution,
  WidgetContributionConfigField,
  WidgetContributionProps,
  CommandContribution,
  SlashCommandContribution,
  SlashCommandContext,
  EditorContribution,
  SidebarContribution,
  PropertyHandlerContribution,
  PropertyHandler,
  PropertyCellProps,
  PropertyEditorProps,
  BlockContribution,
  BlockProps,
  CanvasCardContribution,
  CanvasContribution,
  CanvasContributionBase,
  CanvasContributionPermission,
  CanvasEdgeContribution,
  CanvasIngestInputKind,
  CanvasIngestorContribution,
  CanvasInspectorContribution,
  CanvasInspectorPlacement,
  CanvasLayoutContribution,
  CanvasLayoutScope,
  CanvasPreviewTier,
  CanvasTemplateCategory,
  CanvasTemplateContribution,
  CanvasToolContribution,
  CanvasToolGroup,
  SettingContribution,
  SettingsPanelProps,
  SchemaContribution,
  StatusBarContribution,
  SlotContribution,
  SlotRegion,
  SurfaceDockContribution,
  SurfaceDockTier,
  ImporterContribution,
  AiCommandExposure,
  FrameRendererContribution
} from './contributions'
export { TypedRegistry, ContributionRegistry } from './contributions'

// Workspace layout primitives (exploration 0280) — one grouped block
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
} from './workspace'
export type {
  ChromePosture,
  LayoutTree,
  PresetId,
  RegionId,
  SlotPlacement,
  SlotTier,
  WorkspacePayload
} from './workspace'

// Feature modules (exploration 0189) — the two-sided plugin shape
export type { FeatureModule, ModuleCapabilities } from './feature-module'
export { defineFeatureModule } from './feature-module'

// Importer resolution (exploration 0189) — consume the `importers` contribution point
export { importerAdapters, resolveImporters } from './importers'

// Canvas plugin fixtures
export {
  CANVAS_PLUGIN_FIXTURES,
  CRM_CANVAS_PLUGIN_FIXTURE,
  ERP_CANVAS_PLUGIN_FIXTURE,
  MEDIA_PROVIDER_CANVAS_PLUGIN_FIXTURE,
  createCanvasPluginFixtureCards,
  createCanvasPluginFixtureManifests,
  getCanvasPluginFixture
} from './fixtures/canvas'
export type {
  CanvasPluginFixture,
  CanvasPluginFixtureCardSample,
  CanvasPluginFixtureKind
} from './fixtures/canvas'
export {
  createCanvasErpPrototypeRiskSummary,
  createCanvasErpPrototypeScenario,
  getCanvasErpPrototypeAuditEntriesForCard,
  getCanvasErpPrototypeCardsForFrame
} from './fixtures/erp-prototype'
export type {
  CanvasErpPrototypeAuditEntry,
  CanvasErpPrototypeAuditOperation,
  CanvasErpPrototypeAuditSource,
  CanvasErpPrototypeCard,
  CanvasErpPrototypeCommand,
  CanvasErpPrototypeEdge,
  CanvasErpPrototypeEntityKind,
  CanvasErpPrototypeLayoutKind,
  CanvasErpPrototypeQueryFrame,
  CanvasErpPrototypeQueryPredicate,
  CanvasErpPrototypeRect,
  CanvasErpPrototypeRisk,
  CanvasErpPrototypeRiskSummary,
  CanvasErpPrototypeScenario,
  CanvasErpPrototypeStatus
} from './fixtures/erp-prototype'

// Shortcuts
export { ShortcutManager, getShortcutManager, installShortcutHandler } from './shortcuts'

// Workspace command registry (scopes, single-key verbs, chords)
export {
  CommandRegistry,
  getCommandRegistry,
  installCommandHandler,
  type WorkspaceCommand,
  type CommandContext,
  type CommandScope
} from './commands'

// Mention/typeahead providers (exploration 0194) — extensible [[ / # / @
export { resolveMentionProviders } from './mention-providers'
export type {
  MentionProviderContribution,
  MentionSuggestion,
  ResolveMentionOptions
} from './mention-providers'

// Editor schema-skew guard (exploration 0205) — flag schema-defining editor
// contributions that risk silent Yjs content loss across version skew.
export {
  isSchemaDefiningContribution,
  findEditorSchemaRisks,
  warnOnEditorSchemaRisks,
  type EditorSchemaRisk
} from './editor-schema-safety'

// Agent tools (exploration 0196) — model-facing tools a Connector exposes.
export { agentToolToExtraTool, agentToolsAsExtraTools } from './agent-tools'
export type { AgentToolContribution, AgentToolInputSchema } from './agent-tools'

// Connectors (exploration 0196) — sync an external service into governed nodes
// and expose agent-callable tools over them. xNet's agent-native-CLI equivalent.
export {
  defineConnector,
  ConnectorDefinitionError,
  runConnectorSync,
  ConnectorSyncError,
  CONNECTOR_CATEGORY,
  emitConnectorArtifacts,
  connectorMarketplaceEntry,
  connectorAsImporter,
  evaluateConnectorInstall,
  wrapCliConnector,
  buildSlackConnector,
  SLACK_CONNECTOR_ID,
  CHANNEL_SCHEMA,
  CHAT_MESSAGE_SCHEMA,
  buildRssConnector,
  parseFeed,
  RSS_CONNECTOR_ID,
  FEED_ITEM_SCHEMA,
  buildGithubConnector,
  buildNotionConnector,
  buildAirtableConnector,
  buildLinearConnector,
  buildGoogleCalendarConnector,
  detectUpcomingMeeting,
  EXTERNAL_ITEM_SCHEMA,
  GITHUB_CONNECTOR_ID,
  NOTION_CONNECTOR_ID,
  AIRTABLE_CONNECTOR_ID,
  LINEAR_CONNECTOR_ID,
  GOOGLE_CALENDAR_CONNECTOR_ID
} from './connectors'
export type {
  ConnectorDefinition,
  DefinedConnector,
  ConnectorSyncSpec,
  ConnectorSyncContext,
  ConnectorSyncResult,
  ConnectorStore,
  ConnectorFetch,
  ConnectorCadence,
  RunConnectorSyncPorts,
  GuardableConnectorStore,
  ConnectorArtifacts,
  ConnectorToolDescriptor,
  ConnectorInstallGate,
  WrapCliConnectorOptions,
  SlackConnectorOptions,
  RssConnectorOptions,
  FeedEntry,
  GithubConnectorOptions,
  NotionConnectorOptions,
  AirtableConnectorOptions,
  LinearConnectorOptions
} from './connectors'

// Outbound Actions (exploration 0213) — the reverse of a Connector: when
// something happens in xNet, reach out (Discord/Slack/Telegram/email/webhook).
export {
  defineAction,
  shouldDispatch,
  ActionDefinitionError,
  runAction,
  guardedActionFetch,
  ActionDispatchError,
  assertPublicUrl,
  ActionSsrfError,
  renderEvent,
  buildDiscordAction,
  buildSlackWebhookAction,
  buildTelegramAction,
  buildEmailAction,
  buildWebhookOutAction
} from './actions'
export type {
  ActionDefinition,
  DefinedAction,
  ActionTrigger,
  ActionEvent,
  ActionContext,
  RunActionPorts,
  EmailActionOptions,
  WebhookOutOptions
} from './actions'

// Middleware
export type { PendingChange, NodeChangeEvent, NodeStoreMiddleware } from './middleware'
export { MiddlewareChain } from './middleware'

// Context
export type {
  ExtensionContext,
  PluginNodeChangeEvent,
  PluginNodeChangeListener,
  QueryFilter
} from './context'
export { createExtensionContext } from './context'

// Registry
export type { PluginStatus, RegisteredPlugin, InstallOptions, LicenseCheckResult } from './registry'
export { PluginRegistry, PluginError, LicenseRequiredError } from './registry'

// Ecosystem platform layer (exploration 0192) — capability enforcement,
// provenance/trust, install consent, version compatibility, dependency
// resolution, marketplace index/search, provenance verification, test harness.
export {
  // Capability enforcement
  CapabilityError,
  matchSchemaIri,
  isSchemaWriteAllowed,
  isSchemaReadAllowed,
  isNetworkAllowed,
  isSystemAudioAllowed,
  assertSchemaWrite,
  assertNetwork,
  assertSystemAudio,
  guardStore,
  // Provenance → trust
  deriveTrustTier,
  requiresCapabilityReprompt,
  sandboxForTier,
  // Consent
  describeCapabilities,
  evaluateInstallConsent,
  shortSchemaName,
  // Compatibility
  parseVersion,
  compareVersions,
  satisfiesRange,
  isHostCompatible,
  hasUpdate,
  // Dependencies
  findMissingDependencies,
  resolveInstallOrder,
  DependencyCycleError,
  // Marketplace
  searchMarketplace,
  sortMarketplace,
  filterByCategory,
  aggregateRatings,
  MarketplaceClient,
  MARKETPLACE_PROVENANCE,
  // Supply-chain provenance
  failClosedVerifier,
  verifyProvenance,
  summarizeProvenance,
  // Test harness
  createTestNodeStore,
  createTestPluginHarness,
  // Network endowment
  guardedFetch,
  // Scaffolder (create-xnet-plugin core)
  scaffoldPlugin,
  pascalCase,
  packageName,
  ScaffoldError,
  // Paid-plugin license policy (0196)
  ALLOWED_PLUGIN_LICENSES,
  DEFAULT_PLUGIN_LICENSE,
  isAllowedPluginLicense,
  pluginLicenseText,
  // AI-authored plugin transform
  scriptToPluginManifest,
  AiAuthoringError,
  // Plugin runtime on the labs ladder (0194 Phase 1)
  ladderTierForTrust,
  runPluginCode,
  PluginRuntimeError,
  // AI→Lab→Plugin pipeline (0194 Phase 2)
  runAiPluginPipeline,
  // Marketplace recommendations (0194 Phase 4)
  recommendExtensions
} from './ecosystem'
export type {
  InstallProvenance,
  PluginTrustTier,
  SandboxKind,
  ConsentLine,
  ConsentDecision,
  SemVer,
  DependencyNode,
  MissingDependency,
  MarketplaceEntry,
  MarketplaceSort,
  MarketplaceClientOptions,
  FetchJson,
  PluginRating,
  RatingSummary,
  Provenance,
  ProvenanceResult,
  ProvenanceVerifier,
  VerifyProvenanceInput,
  TestNodeStore,
  TestPluginHarness,
  TestHarnessOptions,
  FetchLike,
  ScaffoldTemplate,
  ScaffoldSpec,
  ScaffoldResult,
  AllowedPluginLicense,
  GeneratedScript,
  ScriptExecutor,
  ScriptToManifestInput,
  AiAuthoredPlugin,
  // Plugin runtime (0194 Phase 1)
  LadderRuntimeTier,
  PluginRunInput,
  PluginRunResult,
  PluginRuntimeLadder,
  RunPluginCodeInput,
  // AI→Lab→Plugin pipeline (0194 Phase 2)
  LabRunOutcome,
  AiPluginPipelinePorts,
  AiPluginPipelineInput,
  AiPluginPipelineResult,
  // Marketplace recommendations (0194 Phase 4)
  UsageSignal,
  RecommendOptions
} from './ecosystem'

// Schemas
export { PluginSchema } from './schemas/plugin'
export type { PluginNode } from './schemas/plugin'
export { ScriptSchema, isScriptNode } from './schemas/script'
export type { ScriptNode, ScriptTriggerType, ScriptOutputType } from './schemas/script'

// Sandbox (Script execution)
export {
  // Context
  createScriptContext,
  // Validator
  validateScriptAST,
  quickSafetyCheck,
  // Sandbox
  ScriptSandbox,
  ScriptError,
  ScriptTimeoutError,
  ScriptValidationError,
  executeScript,
  validateScript,
  // Runner
  ScriptRunner,
  // Canvas sandbox policies
  createCanvasPluginSandboxPolicy,
  createCanvasPreviewSandboxRequest,
  createCanvasRendererSandboxRequest,
  evaluateCanvasPluginSandboxRequest,
  validateCanvasPluginSandboxOutput
} from './sandbox'
export type {
  // Context types
  ScriptContext,
  FlatNode,
  FormatHelpers,
  MathHelpers,
  TextHelpers,
  ArrayHelpers,
  // Validator types
  ValidationResult,
  // Sandbox types
  SandboxOptions,
  TelemetryReporter,
  // Runner types
  ScriptStore,
  ScriptNodeChangeEvent,
  ScriptRunnerOptions,
  ScriptExecutionResult,
  // Canvas sandbox types
  CanvasPluginSandboxDecision,
  CanvasPluginSandboxDomAccess,
  CanvasPluginSandboxKind,
  CanvasPluginSandboxMutationAccess,
  CanvasPluginSandboxNetworkAccess,
  CanvasPluginSandboxOutput,
  CanvasPluginSandboxOutputKind,
  CanvasPluginSandboxOutputValidation,
  CanvasPluginSandboxPolicy,
  CanvasPluginSandboxRequest,
  CanvasRendererSandboxContribution
} from './sandbox'

// AI (Script generation from natural language)
export {
  // Prompt building
  buildScriptPrompt,
  buildRetryPrompt,
  // Providers
  AnthropicProvider,
  OpenAIProvider,
  OllamaProvider,
  OpenAICompatibleProvider,
  AIProviderRouter,
  ManagedProvider,
  createManagedProvider,
  AiBudgetError,
  createAIProvider,
  createAIProviderRouter,
  isOllamaAvailable,
  listOllamaModels,
  AIGenerationError,
  // Generator
  ScriptGenerator,
  ScriptGenerationError,
  generateScript,
  // Agent runtime
  AiAgentRuntime,
  AI_GENERATED_PROVENANCE,
  SCAFFOLD_SYSTEM_GUARD,
  assistTurnProvenance,
  classifyAiAgentDisplayState,
  composeAssistSystemPrompt,
  createAiAgentRuntime,
  createMemoryAiAgentRuntimeStorage,
  renderSelectionPrompt,
  // BYO-Model connectors (exploration 0174)
  CONNECTOR_META,
  detectConnectors,
  pickBestConnector,
  defaultLocalServerProbes,
  probeOpenAiCompatible,
  writeModeFor,
  WebLLMProvider,
  createWebLLMProvider,
  PromptApiProvider,
  createPromptApiProvider,
  promptApiAvailability,
  downloadPromptApiModel
} from './ai'
export type {
  // Prompt types
  AIScriptRequest,
  SchemaProperty,
  SchemaDefinition,
  // Provider types
  AIComplexityLevel,
  AICostModel,
  AIGenerateRequest,
  AIGenerateResponse,
  AIMessage,
  AIMessageRole,
  AIModelCapabilities,
  AIModelQuality,
  AIPrivacyLevel,
  AIProvider,
  AIProviderConfig,
  AIProviderOptions,
  AIProviderRouterOptions,
  AIProviderType,
  AIProviderUsage,
  AIRiskLevel,
  AIStreamChunk,
  AIToolCall,
  AIToolSpec,
  AIUsage,
  OpenAICompatibleProviderOptions,
  ManagedProviderOptions,
  ManagedBudgetSnapshot,
  // Generator types
  AIScriptResponse,
  ScriptGeneratorOptions,
  // Agent runtime types
  AiAgentApproval,
  AiAgentApprovalRequestInput,
  AiAgentApprovalResolveInput,
  AiAgentApprovalStatus,
  AiAssistMode,
  AiAgentBackgroundJob,
  AiAgentBackgroundJobInput,
  AiAgentBackgroundJobRunner,
  AiAgentBackgroundJobStatus,
  AiAgentDisplayState,
  AiAgentDisplayStateKind,
  AiAgentEvent,
  AiAgentEventType,
  AiAgentOrchestratorMode,
  AiAgentRunSelectionTurnInput,
  AiAgentRunTurnInput,
  AiAgentRunTurnResult,
  AiAgentRuntimeConfig,
  AiAgentRuntimeListener,
  AiAgentRuntimeSnapshot,
  AiAgentRuntimeStorage,
  AiAgentSelectionContext,
  AiAgentSelectionKind,
  AiAgentTelemetrySnapshot,
  AiAgentThread,
  AiAgentThreadCreateInput,
  AiAgentThreadStatus,
  AiAgentTurn,
  AiAgentTurnRole,
  AiAgentTurnStatus,
  // BYO-Model connector types (exploration 0174)
  ConnectorTier,
  ToolCallingFidelity,
  WriteMode,
  ConnectorEnv,
  LocalServerProbe,
  ConnectorDetection,
  WebLLMEngineLike,
  WebLLMProviderOptions,
  LanguageModelLike,
  LanguageModelSessionLike,
  LanguageModelMonitor,
  PromptApiAvailability,
  PromptApiProviderOptions
} from './ai'

// AI surface contract (resources, tools, mutation plans, validation)
export type {
  AiAuditEvent,
  AiChangeSet,
  AiContextPack,
  AiContextPackResource,
  AiContextSeed,
  AiDatabaseMutationApplyResult,
  AiJsonSchema,
  AiJsonSchemaType,
  AiMutationPlan,
  AiMutationPlanStatus,
  AiOperation,
  AiPageMarkdownApplyAdapter,
  AiPageMarkdownApplyAdapterInput,
  AiPageMarkdownApplyAdapterResult,
  AiPageMarkdownApplyResult,
  AiPageMarkdownRollbackResult,
  AiResource,
  AiRiskLevel,
  AiScope,
  AiTargetKind,
  AiToolCallResult,
  AiToolDefinition,
  AiExtraTool,
  AiValidationResult,
  AiContextRetriever,
  AiResourceContent,
  AiRetrievedNode,
  AiSearchOptions,
  AiSearchResult,
  AiSurfaceLimits,
  AiSurfaceServiceConfig,
  XNetMarkdownDiffLine,
  XNetMarkdownDiffLineKind,
  XNetMarkdownDirective,
  XNetMarkdownDirectiveSpec,
  XNetMarkdownReviewDiff,
  XNetPageMarkdownFrontmatter,
  XNetPageMarkdownValidation,
  XNetPageMarkdownValidationOptions
} from './ai-surface'
export {
  AI_RISK_LEVELS,
  AI_SCOPES,
  AI_TARGET_KINDS,
  attachAiPlanValidation,
  createAiChangeSet,
  createAiOperation,
  createAiValidationResult,
  isAiRiskLevel,
  isAiScope,
  isAiTargetKind,
  parseAiMutationPlan,
  serializeAiMutationPlan,
  validateAiMutationPlan,
  AiSurfaceService,
  createAiSurfaceService,
  contributionsAsAiTools,
  getXNetMarkdownDirectiveSpecs,
  parseXNetPageFrontmatter,
  renderMarkdownLineDiff,
  renderMarkdownReviewDiff,
  stripXNetPageFrontmatter,
  XNET_MARKDOWN_DIRECTIVE_SPECS,
  validateXNetPageMarkdown,
  blockNoteFragmentToMarkdown,
  createBlockNotePageMarkdownAdapter,
  legacyFragmentToMarkdown,
  replaceXNetPageFragmentWithMarkdown,
  XNET_PAGE_FRAGMENT_FIELD,
  XNET_PAGE_LEGACY_FRAGMENT_FIELD,
  xnetPageFragmentToMarkdown
} from './ai-surface'
export type {
  AiCallableTool,
  BlockNotePageMarkdownAdapterOptions,
  XNetPageDocResolver,
  XNetPageFragmentReadOptions,
  XNetPageFragmentWriteOptions
} from './ai-surface'
// Agent audit + ceremony (exploration 0337)
export {
  AgentAuditRecorder,
  createAgentCeremonyTools,
  createAgentNotificationTools,
  hashNonce,
  reversibilityForTool,
  riskForTool,
  type AgentAuditContext,
  type AgentAuditRecorderConfig,
  type AgentAuditSurface,
  type AgentCallOutcome,
  type AgentExecutedResult,
  type AgentNotificationToolsOptions,
  type AgentPendingApproval
} from './ai-surface'

// Services (Background process management)
// Note: Node.js-only modules (LocalAPIServer, MCPServer, ProcessManager) are
// available via '@xnetjs/plugins/node' to avoid bundling Node.js APIs in browser builds.
export {
  // Webhook Emitter (uses fetch which is available everywhere)
  WebhookEmitter,
  createWebhookEmitter,
  // Client (Renderer process)
  createServiceClient,
  isServiceClientAvailable,
  SERVICE_IPC_CHANNELS,
  // Right to Leave (exploration 0234, Charter §Exit)
  LEAVE_README,
  leaveWithEverything,
  deleteDay
} from './services'
export type {
  // Service definition
  ServiceDefinition,
  ServiceProcessConfig,
  ServiceHealthCheck,
  ServiceLifecycle,
  ServiceCommunication,
  ServiceProvides,
  // Status
  ServiceState,
  ServiceStatus,
  ServiceStatusEvent,
  ServiceOutputEvent,
  // Interfaces
  ServiceClient,
  IProcessManager,
  ProcessManagerEvents,
  // Local API types (for interface compatibility)
  NodeStoreAPI,
  SchemaRegistryAPI,
  NodeData,
  SchemaData,
  NodeChangeEventData,
  LocalAPIConfig,
  LocalAPITokenConfig,
  LocalAPITokenScope,
  LocalAPITokenSummary,
  // Webhook types
  WebhookConfig,
  WebhookPayload,
  DeliveryResult,
  // MCP types
  MCPTool,
  MCPPropertySchema,
  MCPResource,
  MCPRequest,
  MCPResponse,
  MCPServerConfig,
  // Right to Leave types (exploration 0234)
  RightToLeavePorts,
  LeaveBundle,
  DeleteDayOptions,
  DeleteDayResult
} from './services'

// Workspace-plugin runtime (exploration 0331) — one grouped block per the
// sub-barrel policy; the full surface lives in ./workspace-plugins/index.ts.
export {
  PluginSourceSchema,
  PLUGIN_SOURCE_SCHEMA_IRI,
  readPluginSourceNode,
  buildPluginModuleGraph,
  buildPluginFrameSrcdoc,
  framePluginCsp,
  PLUGIN_FRAME_SANDBOX,
  PLUGIN_STORE_DENYLIST,
  isDenylistedSchema,
  createPluginStoreRpc,
  PluginStoreRpcError,
  createPluginFrameSession,
  activateWorkspacePlugin,
  buildWorkspacePlugin,
  validateWorkspaceManifest,
  permissionsToCapabilities,
  WorkspacePluginError,
  computePluginSourceHash,
  diffPluginSourceFiles,
  assessPluginUpdate,
  createPluginSourceWatcher,
  createWorkspacePluginHotReloader,
  SOURCE_SETTLE_DEBOUNCE_MS,
  createWorkspacePluginPreviewManager,
  createWorkspacePluginAgentTools,
  scaffoldWorkspacePluginFiles,
  requestWorkspacePluginPublish,
  buildCommunityRegistryEntry,
  exportPluginSourceAsRepoFiles
} from './workspace-plugins'
export type {
  PluginSourceNode,
  WorkspacePluginManifestData,
  WorkspacePluginContributionsData,
  PluginBuildDiagnostic,
  PluginBuildInput,
  PluginFileTranspiler,
  PluginModuleGraph,
  VendorModuleSources,
  PluginFrameToHostMessage,
  PluginHostToFrameMessage,
  PluginGraphPayload,
  PluginStoreRpc,
  WorkspacePluginStore,
  PluginFeedbackEntry,
  PluginFrameSession,
  PluginRegisteredHandlers,
  PluginFrameTransport,
  WorkspacePluginHandle,
  WorkspacePluginHostDeps,
  PluginSourceDiff,
  PluginUpdateAssessment,
  HotReloadEvent,
  PluginSourceWatcher,
  WorkspacePluginHotReloader,
  WorkspacePluginPreviewManager,
  WorkspacePluginPreviewResult,
  WorkspacePluginAgentToolsOptions,
  WorkspacePluginDraftBackend,
  WorkspacePluginSourceBackend,
  PublishConsentRequest,
  WorkspacePluginPublishResult,
  CommunityRegistryEntry
} from './workspace-plugins'

// Workspace-plugin authoring skill (0331)
export { WRITING_XNET_PLUGINS_SKILL_MD } from './ai-surface/plugin-skill'
