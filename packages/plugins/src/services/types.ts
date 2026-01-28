/**
 * Service Plugin Types
 *
 * Defines the types for background service plugins that run as separate processes.
 * These are primarily used in Electron but the types are shared.
 */

// ─── Service Definition ──────────────────────────────────────────────────────

/**
 * Process configuration for a service
 */
export interface ServiceProcessConfig {
  /** Executable command (e.g., 'node', 'python', 'ollama') */
  command: string
  /** Command arguments */
  args?: string[]
  /** Working directory */
  cwd?: string
  /** Environment variables */
  env?: Record<string, string>
  /** Run in shell (for PATH resolution) */
  shell?: boolean
}

/**
 * Health check configuration
 */
export interface ServiceHealthCheck {
  /** Type of health check */
  type: 'http' | 'stdout' | 'tcp'
  /** URL to check for HTTP health checks */
  url?: string
  /** Port to check for TCP health checks */
  port?: number
  /** Regex pattern to match in stdout */
  pattern?: string
  /** Interval between checks in milliseconds (default: 5000) */
  intervalMs?: number
  /** Timeout for each check in milliseconds (default: 5000) */
  timeoutMs?: number
}

/**
 * Lifecycle configuration for a service
 */
export interface ServiceLifecycle {
  /** Restart policy */
  restart: 'always' | 'on-failure' | 'never'
  /** Maximum number of restarts (default: 5) */
  maxRestarts?: number
  /** Delay between restarts in milliseconds (default: 1000) */
  restartDelayMs?: number
  /** Timeout for service startup in milliseconds (default: 10000) */
  startTimeoutMs?: number
  /** Health check configuration */
  healthCheck?: ServiceHealthCheck
  /** Graceful shutdown timeout in milliseconds (default: 5000) */
  shutdownTimeoutMs?: number
}

/**
 * Communication configuration for a service
 */
export interface ServiceCommunication {
  /** Communication protocol */
  protocol: 'stdio' | 'http' | 'websocket' | 'ipc'
  /** Port for HTTP/WebSocket (0 = auto-assign) */
  port?: number
  /** Host address (default: '127.0.0.1') */
  host?: string
}

/**
 * Capabilities provided by a service
 */
export interface ServiceProvides {
  /** MCP tool definitions */
  mcp?: {
    tools: string[]
  }
  /** HTTP API routes */
  api?: {
    routes: string[]
  }
}

/**
 * Complete service definition
 */
export interface ServiceDefinition {
  /** Unique service identifier */
  id: string
  /** Human-readable name */
  name: string
  /** Optional description */
  description?: string
  /** Process configuration */
  process: ServiceProcessConfig
  /** Lifecycle configuration */
  lifecycle: ServiceLifecycle
  /** Communication configuration */
  communication: ServiceCommunication
  /** Capabilities this service provides */
  provides?: ServiceProvides
}

// ─── Service Status ──────────────────────────────────────────────────────────

/**
 * Service state
 */
export type ServiceState = 'starting' | 'running' | 'stopping' | 'stopped' | 'error'

/**
 * Service status
 */
export interface ServiceStatus {
  /** Service ID */
  id: string
  /** Current state */
  state: ServiceState
  /** Process ID (when running) */
  pid?: number
  /** Port (when running with HTTP/WebSocket) */
  port?: number
  /** Timestamp when service started */
  startedAt?: number
  /** Last error message */
  lastError?: string
  /** Number of restarts since initial start */
  restartCount: number
  /** Uptime in milliseconds (if running) */
  uptime?: number
}

// ─── Service Events ──────────────────────────────────────────────────────────

/**
 * Event emitted when service status changes
 */
export interface ServiceStatusEvent {
  serviceId: string
  status: ServiceStatus
  previousState?: ServiceState
}

/**
 * Event emitted when service outputs data
 */
export interface ServiceOutputEvent {
  serviceId: string
  stream: 'stdout' | 'stderr'
  data: string
  timestamp: number
}

// ─── Service Client ──────────────────────────────────────────────────────────

/**
 * Client interface for interacting with services from the renderer process
 */
export interface ServiceClient {
  /** Start a service */
  start(definition: ServiceDefinition): Promise<ServiceStatus>

  /** Stop a service */
  stop(serviceId: string): Promise<void>

  /** Restart a service */
  restart(serviceId: string): Promise<ServiceStatus>

  /** Get service status */
  status(serviceId: string): Promise<ServiceStatus | undefined>

  /** Get all service statuses */
  listAll(): Promise<ServiceStatus[]>

  /** Call a service via HTTP */
  call<T>(
    serviceId: string,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown
  ): Promise<T>

  /** Subscribe to status changes */
  onStatusChange(serviceId: string, callback: (status: ServiceStatus) => void): () => void

  /** Subscribe to service output */
  onOutput(serviceId: string, callback: (event: ServiceOutputEvent) => void): () => void
}

// ─── Process Manager Interface ───────────────────────────────────────────────

/**
 * Events emitted by the ProcessManager
 */
export interface ProcessManagerEvents {
  'service:status': (event: ServiceStatusEvent) => void
  'service:output': (event: ServiceOutputEvent) => void
  'service:error': (event: { serviceId: string; error: Error }) => void
}

/**
 * Interface for the process manager (implemented in Electron main process)
 */
export interface IProcessManager {
  /** Start a service */
  start(definition: ServiceDefinition): Promise<ServiceStatus>

  /** Stop a service */
  stop(serviceId: string): Promise<void>

  /** Restart a service */
  restart(serviceId: string): Promise<ServiceStatus>

  /** Get service status */
  getStatus(serviceId: string): ServiceStatus | undefined

  /** Get all service statuses */
  getAllStatuses(): ServiceStatus[]

  /** Stop all services */
  stopAll(): Promise<void>

  /** Subscribe to events */
  on<K extends keyof ProcessManagerEvents>(event: K, listener: ProcessManagerEvents[K]): void

  /** Unsubscribe from events */
  off<K extends keyof ProcessManagerEvents>(event: K, listener: ProcessManagerEvents[K]): void
}
