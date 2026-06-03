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
export type { XNetExtension, PluginContributions } from './manifest'
export { validateManifest, defineExtension, PluginValidationError } from './manifest'

// Contributions
export type {
  ViewContribution,
  ViewProps,
  CommandContribution,
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
  SchemaContribution
} from './contributions'
export { TypedRegistry, ContributionRegistry } from './contributions'

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
export type { PluginStatus, RegisteredPlugin } from './registry'
export { PluginRegistry, PluginError } from './registry'

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
  createAIProvider,
  createAIProviderRouter,
  isOllamaAvailable,
  listOllamaModels,
  AIGenerationError,
  // Generator
  ScriptGenerator,
  ScriptGenerationError,
  generateScript
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
  // Generator types
  AIScriptResponse,
  ScriptGeneratorOptions
} from './ai'

// AI surface contract (resources, tools, mutation plans, validation)
export type {
  AiAuditEvent,
  AiChangeSet,
  AiContextPack,
  AiContextPackResource,
  AiContextSeed,
  AiJsonSchema,
  AiJsonSchemaType,
  AiMutationPlan,
  AiMutationPlanStatus,
  AiOperation,
  AiPageMarkdownApplyAdapter,
  AiPageMarkdownApplyAdapterInput,
  AiPageMarkdownApplyAdapterResult,
  AiPageMarkdownApplyResult,
  AiResource,
  AiRiskLevel,
  AiScope,
  AiTargetKind,
  AiToolCallResult,
  AiToolDefinition,
  AiValidationResult,
  AiResourceContent,
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
  getXNetMarkdownDirectiveSpecs,
  parseXNetPageFrontmatter,
  renderMarkdownLineDiff,
  renderMarkdownReviewDiff,
  stripXNetPageFrontmatter,
  XNET_MARKDOWN_DIRECTIVE_SPECS,
  validateXNetPageMarkdown
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
  SERVICE_IPC_CHANNELS
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
  MCPServerConfig
} from './services'
