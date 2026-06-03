/**
 * Node.js-only services exports
 *
 * These modules use Node.js APIs (http, child_process) and should only
 * be imported in Node.js/Electron main process contexts.
 */

// Local API Server (uses Node.js http module)
export type {
  NodeStoreAPI,
  SchemaRegistryAPI,
  NodeData,
  SchemaData,
  NodeChangeEventData,
  LocalAPIConfig,
  LocalAPITokenConfig,
  LocalAPITokenScope,
  LocalAPITokenSummary
} from './local-api'
export { LocalAPIServer, createLocalAPI } from './local-api'

// MCP Server (uses Node.js readline module)
export type {
  MCPTool,
  MCPPropertySchema,
  MCPResource,
  MCPRequest,
  MCPResponse,
  MCPServerConfig
} from './mcp-server'
export { MCPServer, createMCPServer } from './mcp-server'

// AI workspace exporter (uses Node.js fs/path/crypto modules)
export type {
  AiWorkspaceChangedFile,
  AiWorkspaceChangedFileStatus,
  AiWorkspaceConflict,
  AiWorkspaceConflictKind,
  AiWorkspaceExporterConfig,
  AiWorkspaceExportKind,
  AiWorkspaceExportOptions,
  AiWorkspaceExportResult,
  AiWorkspaceExportScope,
  AiWorkspaceManifestEntry,
  AiWorkspacePendingPlan,
  AiWorkspaceReviewAction,
  AiWorkspaceReviewEntry,
  AiWorkspaceReviewEntryKind,
  AiWorkspaceReviewIndex,
  AiWorkspaceReviewStatus,
  AiWorkspaceWatcherScanOptions,
  AiWorkspaceWatcherScanResult,
  AiWorkspaceWatchHandle
} from './ai-workspace-exporter'
export {
  AiWorkspaceExporter,
  AiWorkspaceWatcher,
  createAiWorkspaceExporter,
  createAiWorkspaceWatcher
} from './ai-workspace-exporter'

// AI surface contract
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
  AiPageMarkdownRollbackResult,
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
} from '../ai-surface'
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
} from '../ai-surface'

// Process Manager (uses Node.js child_process module)
export { ProcessManager } from './process-manager'

// IPC channel names (shared between main and renderer)
export { SERVICE_IPC_CHANNELS } from './client'

// Service types (for IPC handlers)
export type {
  ServiceDefinition,
  ServiceStatus,
  ServiceState,
  ServiceStatusEvent,
  ServiceOutputEvent,
  ServiceProcessConfig,
  ServiceLifecycle,
  ServiceCommunication,
  ServiceHealthCheck,
  ServiceProvides,
  ServiceClient,
  IProcessManager,
  ProcessManagerEvents
} from './types'
