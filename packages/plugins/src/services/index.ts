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

// Process Manager (Node.js/Electron main process only)
export { ProcessManager } from './process-manager'

// Client (Renderer process)
export { createServiceClient, isServiceClientAvailable, SERVICE_IPC_CHANNELS } from './client'
