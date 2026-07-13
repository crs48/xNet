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

// MCP HTTP transport (uses Node.js http module; exploration 0175)
export type { McpHttpServerConfig, McpHttpServerHandle } from './mcp-http'
export { createMcpHttpServer } from './mcp-http'

// AI workspace exporter (uses Node.js fs/path/crypto modules)
export type {
  AiWorkspaceChangedFile,
  AiWorkspaceChangedFileStatus,
  AiWorkspaceCheckoutOptions,
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
  AiWorkspaceWatchHandle,
  AiWorkspaceWatchOptions
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
  flattenRowForTsv,
  isAiRiskLevel,
  isAiScope,
  isAiTargetKind,
  parseAiMutationPlan,
  serializeAiMutationPlan,
  toTsv,
  validateAiMutationPlan,
  AiSurfaceService,
  createAiSurfaceService,
  getXNetMarkdownDirectiveSpecs,
  parseXNetPageFrontmatter,
  renderMarkdownLineDiff,
  renderMarkdownReviewDiff,
  stripXNetPageFrontmatter,
  XNET_AGENT_SKILL_MD,
  XNET_MARKDOWN_DIRECTIVE_SPECS,
  validateXNetPageMarkdown,
  blockNoteFragmentToMarkdown,
  createBlockNotePageMarkdownAdapter,
  legacyFragmentToMarkdown,
  replaceXNetPageFragmentWithMarkdown,
  XNET_PAGE_FRAGMENT_FIELD,
  XNET_PAGE_LEGACY_FRAGMENT_FIELD,
  xnetPageFragmentToMarkdown
} from '../ai-surface'
export type {
  BlockNotePageMarkdownAdapterOptions,
  XNetPageDocResolver,
  XNetPageFragmentReadOptions,
  XNetPageFragmentWriteOptions
} from '../ai-surface'

// Agent script sandbox (code-execution surface for `xnet run`)
export { createAgentScriptContext } from '../sandbox/agent-api'
export type {
  AgentApi,
  AgentScriptContext,
  AgentScriptSession,
  AgentSearchResult,
  AgentWriteProposal,
  CreateAgentScriptContextInput
} from '../sandbox/agent-api'
export { ScriptSandbox } from '../sandbox'
export type { FlatNode } from '../sandbox'

// In-memory backend (tests, benchmarks, CLI fixtures)
export {
  createMemoryNodeStore,
  createMemorySchemaRegistry,
  createWorkspaceFixtureSchemas
} from '../testing/memory-backend'
export type { MemoryNodeStore } from '../testing/memory-backend'

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
