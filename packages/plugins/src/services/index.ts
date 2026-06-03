/**
 * Services module - Background process management for plugins
 */

// Types
export type {
  ServiceDefinition,
  ServiceProcessConfig,
  ServiceHealthCheck,
  ServiceLifecycle,
  ServiceCommunication,
  ServiceProvides,
  ServiceState,
  ServiceStatus,
  ServiceStatusEvent,
  ServiceOutputEvent,
  ServiceClient,
  IProcessManager,
  ProcessManagerEvents
} from './types'

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

// Process Manager (Node.js/Electron main process only)
export { ProcessManager } from './process-manager'

// Local API Server (Node.js/Electron main process only)
export { LocalAPIServer, createLocalAPI } from './local-api'

// Client (Renderer process)
export { createServiceClient, isServiceClientAvailable, SERVICE_IPC_CHANNELS } from './client'

// Webhook Emitter
export type { WebhookConfig, WebhookPayload, DeliveryResult } from './webhook-emitter'
export { WebhookEmitter, createWebhookEmitter } from './webhook-emitter'

// MCP Server
export type {
  MCPTool,
  MCPPropertySchema,
  MCPResource,
  MCPRequest,
  MCPResponse,
  MCPServerConfig
} from './mcp-server'
export { MCPServer, createMCPServer } from './mcp-server'

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
  XNetMarkdownDirective,
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
  parseXNetPageFrontmatter,
  renderMarkdownLineDiff,
  stripXNetPageFrontmatter,
  validateXNetPageMarkdown
} from '../ai-surface'
