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
  LocalAPIConfig
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

// Process Manager (uses Node.js child_process module)
export { ProcessManager } from './process-manager'
