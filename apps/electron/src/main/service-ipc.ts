/**
 * IPC handlers for service management
 *
 * Sets up IPC handlers for the ProcessManager so renderer process plugins
 * can start, stop, and communicate with background services.
 */
import {
  ProcessManager,
  SERVICE_IPC_CHANNELS,
  type ServiceDefinition,
  type ServiceStatus
} from '@xnetjs/plugins/node'
import { ipcMain, BrowserWindow } from 'electron'

// ─── Process Manager Instance ────────────────────────────────────────────────

let processManager: ProcessManager | null = null

/**
 * Get or create the ProcessManager instance
 */
export function getProcessManager(): ProcessManager {
  if (!processManager) {
    processManager = new ProcessManager()

    // Forward status events to all renderer windows
    processManager.on('service:status', (event) => {
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send(SERVICE_IPC_CHANNELS.STATUS_UPDATE, event)
      })
    })

    // Forward output events to all renderer windows
    processManager.on('service:output', (event) => {
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send(SERVICE_IPC_CHANNELS.OUTPUT, event)
      })
    })
  }

  return processManager
}

// ─── IPC Handlers ────────────────────────────────────────────────────────────

/**
 * Set up IPC handlers for service management
 */
export function setupServiceIPC(): void {
  const manager = getProcessManager()

  // Start a service
  ipcMain.handle(
    SERVICE_IPC_CHANNELS.START,
    async (_, definition: ServiceDefinition): Promise<ServiceStatus> => {
      console.log(`[ServiceIPC] Starting service: ${definition.id}`)
      return manager.start(definition)
    }
  )

  // Stop a service
  ipcMain.handle(SERVICE_IPC_CHANNELS.STOP, async (_, serviceId: string): Promise<void> => {
    console.log(`[ServiceIPC] Stopping service: ${serviceId}`)
    await manager.stop(serviceId)
  })

  // Restart a service
  ipcMain.handle(
    SERVICE_IPC_CHANNELS.RESTART,
    async (_, serviceId: string): Promise<ServiceStatus> => {
      console.log(`[ServiceIPC] Restarting service: ${serviceId}`)
      return manager.restart(serviceId)
    }
  )

  // Get service status
  ipcMain.handle(
    SERVICE_IPC_CHANNELS.STATUS,
    async (_, serviceId: string): Promise<ServiceStatus | undefined> => {
      return manager.getStatus(serviceId)
    }
  )

  // List all services
  ipcMain.handle(SERVICE_IPC_CHANNELS.LIST_ALL, async (): Promise<ServiceStatus[]> => {
    return manager.getAllStatuses()
  })

  // Call a service via HTTP
  ipcMain.handle(
    SERVICE_IPC_CHANNELS.CALL,
    async <T>(
      _: unknown,
      serviceId: string,
      method: string,
      path: string,
      body?: unknown
    ): Promise<T> => {
      const status = manager.getStatus(serviceId)
      if (!status) {
        throw new Error(`Service '${serviceId}' not found`)
      }
      if (status.state !== 'running') {
        throw new Error(`Service '${serviceId}' is not running (state: ${status.state})`)
      }

      const port = status.port
      if (!port) {
        throw new Error(`Service '${serviceId}' does not have a port assigned`)
      }

      const url = `http://127.0.0.1:${port}${path}`
      const options: RequestInit = {
        method,
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined
      }

      const response = await fetch(url, options)

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`Service call failed: ${response.status} ${text}`)
      }

      return response.json() as T
    }
  )
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────

/**
 * Stop all services and clean up.
 * Call this on app quit.
 */
export async function cleanupServices(): Promise<void> {
  if (processManager) {
    console.log('[ServiceIPC] Stopping all services...')
    await processManager.stopAll()
    processManager = null
    console.log('[ServiceIPC] All services stopped')
  }
}
