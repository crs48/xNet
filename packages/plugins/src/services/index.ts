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
  LocalAPIConfig
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
