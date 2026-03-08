declare module '@xnetjs/plugins/node' {
  export {
    LocalAPIServer,
    createLocalAPI
  } from '../../../../packages/plugins/src/services/local-api'
  export type {
    LocalAPIConfig,
    NodeChangeEventData,
    NodeData,
    NodeStoreAPI,
    SchemaData,
    SchemaRegistryAPI
  } from '../../../../packages/plugins/src/services/local-api'
  export { MCPServer, createMCPServer } from '../../../../packages/plugins/src/services/mcp-server'
  export type {
    MCPPropertySchema,
    MCPRequest,
    MCPResource,
    MCPResponse,
    MCPServerConfig,
    MCPTool
  } from '../../../../packages/plugins/src/services/mcp-server'
  export { ProcessManager } from '../../../../packages/plugins/src/services/process-manager'
  export { SERVICE_IPC_CHANNELS } from '../../../../packages/plugins/src/services/client'
  export type {
    IProcessManager,
    ProcessManagerEvents,
    ServiceClient,
    ServiceCommunication,
    ServiceDefinition,
    ServiceHealthCheck,
    ServiceLifecycle,
    ServiceOutputEvent,
    ServiceProcessConfig,
    ServiceProvides,
    ServiceState,
    ServiceStatus,
    ServiceStatusEvent
  } from '../../../../packages/plugins/src/services/types'
}
