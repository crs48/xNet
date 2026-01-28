/**
 * Service Client
 *
 * Client API for interacting with services from the renderer process.
 * Uses IPC to communicate with the ProcessManager in the main process.
 */

import type { ServiceDefinition, ServiceStatus, ServiceOutputEvent, ServiceClient } from './types'

// ─── IPC Channel Names ───────────────────────────────────────────────────────

export const SERVICE_IPC_CHANNELS = {
  START: 'xnet:service:start',
  STOP: 'xnet:service:stop',
  RESTART: 'xnet:service:restart',
  STATUS: 'xnet:service:status',
  LIST_ALL: 'xnet:service:list-all',
  CALL: 'xnet:service:call',
  STATUS_UPDATE: 'xnet:service:status-update',
  OUTPUT: 'xnet:service:output'
} as const

// ─── IPC Interface ───────────────────────────────────────────────────────────

/**
 * Expected IPC interface exposed by Electron preload script
 */
interface XNetIPC {
  invoke<T>(channel: string, ...args: unknown[]): Promise<T>
  on(channel: string, handler: (...args: unknown[]) => void): void
  off(channel: string, handler: (...args: unknown[]) => void): void
}

/**
 * Get the IPC interface from the window object.
 * The xnetServices API is exposed by the Electron preload script.
 */
function getIPC(): XNetIPC | null {
  if (typeof window === 'undefined') return null
  return (window as Window & { xnetServices?: XNetIPC }).xnetServices ?? null
}

// ─── Service Client Implementation ───────────────────────────────────────────

/**
 * Create a service client for the renderer process.
 *
 * @example
 * ```typescript
 * const client = createServiceClient()
 *
 * // Start a service
 * const status = await client.start({
 *   id: 'my-service',
 *   name: 'My Service',
 *   process: { command: 'node', args: ['server.js'] },
 *   lifecycle: { restart: 'on-failure' },
 *   communication: { protocol: 'http', port: 3000 }
 * })
 *
 * // Call the service
 * const result = await client.call('my-service', 'GET', '/api/data')
 *
 * // Listen for status changes
 * const unsubscribe = client.onStatusChange('my-service', (status) => {
 *   console.log('Status:', status.state)
 * })
 * ```
 */
export function createServiceClient(): ServiceClient {
  const ipc = getIPC()

  if (!ipc) {
    // Return a mock client that throws helpful errors
    return createMockServiceClient()
  }

  return {
    start: (definition: ServiceDefinition) =>
      ipc.invoke<ServiceStatus>(SERVICE_IPC_CHANNELS.START, definition),

    stop: (serviceId: string) => ipc.invoke<void>(SERVICE_IPC_CHANNELS.STOP, serviceId),

    restart: (serviceId: string) =>
      ipc.invoke<ServiceStatus>(SERVICE_IPC_CHANNELS.RESTART, serviceId),

    status: (serviceId: string) =>
      ipc.invoke<ServiceStatus | undefined>(SERVICE_IPC_CHANNELS.STATUS, serviceId),

    listAll: () => ipc.invoke<ServiceStatus[]>(SERVICE_IPC_CHANNELS.LIST_ALL),

    call: <T>(
      serviceId: string,
      method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
      path: string,
      body?: unknown
    ) => ipc.invoke<T>(SERVICE_IPC_CHANNELS.CALL, serviceId, method, path, body),

    onStatusChange: (serviceId: string, callback: (status: ServiceStatus) => void) => {
      const handler = (event: { serviceId: string; status: ServiceStatus }) => {
        if (event.serviceId === serviceId) {
          callback(event.status)
        }
      }
      ipc.on(SERVICE_IPC_CHANNELS.STATUS_UPDATE, handler as never)
      return () => ipc.off(SERVICE_IPC_CHANNELS.STATUS_UPDATE, handler as never)
    },

    onOutput: (serviceId: string, callback: (event: ServiceOutputEvent) => void) => {
      const handler = (event: ServiceOutputEvent) => {
        if (event.serviceId === serviceId) {
          callback(event)
        }
      }
      ipc.on(SERVICE_IPC_CHANNELS.OUTPUT, handler as never)
      return () => ipc.off(SERVICE_IPC_CHANNELS.OUTPUT, handler as never)
    }
  }
}

// ─── Mock Client ─────────────────────────────────────────────────────────────

/**
 * Create a mock service client for non-Electron environments
 */
function createMockServiceClient(): ServiceClient {
  const notAvailable = () => {
    throw new Error(
      'Service client is only available in Electron. ' +
        'Make sure you are running in the Electron renderer process.'
    )
  }

  return {
    start: notAvailable,
    stop: notAvailable,
    restart: notAvailable,
    status: notAvailable,
    listAll: notAvailable,
    call: notAvailable,
    onStatusChange: () => () => {},
    onOutput: () => () => {}
  }
}

// ─── React Hook ──────────────────────────────────────────────────────────────

/**
 * Check if service client is available
 */
export function isServiceClientAvailable(): boolean {
  return getIPC() !== null
}
