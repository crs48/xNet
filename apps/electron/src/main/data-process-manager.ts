/**
 * Data Process Manager - Spawns and manages the utility process
 *
 * This module is responsible for:
 * - Spawning the data utility process
 * - Relaying IPC between renderer and utility process
 * - Handling utility process lifecycle (crash recovery, shutdown)
 * - Setting up MessagePort channels between renderer and utility
 */

import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  utilityProcess,
  app,
  type UtilityProcess,
  type BrowserWindow,
  ipcMain,
  MessageChannelMain
} from 'electron'

// ESM __dirname shim
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Get the app's resource path for native modules
// In dev mode, this is the app directory; in prod, it's the asar unpacked resources
function getNodeModulesPath(): string {
  // Use app.getAppPath() which gives us the path to the app's code
  // For dev: /Users/crs/Code/xNet/apps/electron
  // For prod: /path/to/app.asar or /path/to/app
  const appPath = app.getAppPath()
  return join(appPath, 'node_modules')
}

// Debug logging
let debugEnabled = false
function log(...args: unknown[]): void {
  if (debugEnabled) {
    console.log('[DataProcessManager]', ...args)
  }
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

// ─── State ──────────────────────────────────────────────────────────────────

let dataProcess: UtilityProcess | null = null
let isReady = false
let isShuttingDown = false
const pendingRequests = new Map<string, PendingRequest>()
let requestCounter = 0

// Track windows and their MessagePorts
const windowPorts = new Map<number, Electron.MessagePortMain>()

// Event listeners from renderer
const eventListeners = new Map<string, Set<(data: unknown) => void>>()

// ─── Process Management ─────────────────────────────────────────────────────

/**
 * Spawn the data utility process
 */
export async function spawnDataProcess(dbPath: string): Promise<void> {
  if (dataProcess) {
    log('Data process already running')
    return
  }

  log('Spawning data process...')

  return new Promise((resolve, reject) => {
    try {
      // Path to the compiled data-process entry point
      const scriptPath = join(__dirname, 'data-process/index.js')
      log('Script path:', scriptPath)

      // Set NODE_PATH to ensure native modules are loaded from the rebuilt location
      // This is necessary because pnpm hoists modules to root, but electron-rebuild
      // only rebuilds modules in apps/electron/node_modules
      const nodeModulesPath = getNodeModulesPath()
      log('Node modules path:', nodeModulesPath)

      const env = {
        ...process.env,
        NODE_PATH: nodeModulesPath
      }

      dataProcess = utilityProcess.fork(scriptPath, [], {
        serviceName: 'xnet-data',
        env
      })

      // Handle messages from utility process
      dataProcess.on('message', (msg) => {
        handleProcessMessage(msg)
      })

      // Handle process exit
      dataProcess.on('exit', (code) => {
        log('Data process exited with code:', code)
        isReady = false
        dataProcess = null

        // Reject all pending requests
        for (const [requestId, pending] of pendingRequests) {
          clearTimeout(pending.timeout)
          pending.reject(new Error('Data process exited'))
          pendingRequests.delete(requestId)
        }

        // Auto-restart on crash (unless we're shutting down)
        if (!isShuttingDown && code !== 0) {
          log('Restarting data process after crash...')
          spawnDataProcess(dbPath).catch((err) => {
            console.error('[DataProcessManager] Failed to restart:', err)
          })
        }
      })

      // Wait for ready signal
      const readyTimeout = setTimeout(() => {
        reject(new Error('Data process did not become ready in time'))
      }, 10000)

      const onReady = () => {
        clearTimeout(readyTimeout)
        isReady = true
        log('Data process ready')

        // Initialize with database path
        sendRequest('init', { dbPath })
          .then(() => {
            log('Data process initialized')
            resolve()
          })
          .catch(reject)
      }

      // Store the ready handler to be called when we receive 'ready' message
      ;(dataProcess as UtilityProcess & { _onReady?: () => void })._onReady = onReady
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * Stop the data process gracefully
 */
export async function stopDataProcess(): Promise<void> {
  if (!dataProcess) return

  isShuttingDown = true
  log('Stopping data process...')

  try {
    await sendRequest('shutdown', {}, 5000)
  } catch {
    log('Shutdown request failed, killing process')
  }

  if (dataProcess) {
    dataProcess.kill()
    dataProcess = null
  }

  isReady = false
  isShuttingDown = false
}

/**
 * Send a request to the utility process and wait for response
 */
async function sendRequest(
  type: string,
  payload: Record<string, unknown>,
  timeout = 30000
): Promise<unknown> {
  if (!dataProcess) {
    throw new Error('Data process not running')
  }

  const requestId = `req_${++requestCounter}`

  return new Promise((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      pendingRequests.delete(requestId)
      reject(new Error(`Request ${type} timed out`))
    }, timeout)

    pendingRequests.set(requestId, {
      resolve,
      reject,
      timeout: timeoutHandle
    })

    dataProcess!.postMessage({ type, requestId, ...payload })
  })
}

/**
 * Handle messages from the utility process
 */
function handleProcessMessage(msg: unknown): void {
  const { type, requestId, eventType, ...data } = msg as {
    type: string
    requestId?: string
    eventType?: string
    [key: string]: unknown
  }

  if (type === 'ready') {
    const process = dataProcess as UtilityProcess & { _onReady?: () => void }
    if (process?._onReady) {
      process._onReady()
      delete process._onReady
    }
    return
  }

  if (type === 'response' && requestId) {
    const pending = pendingRequests.get(requestId)
    if (pending) {
      clearTimeout(pending.timeout)
      pendingRequests.delete(requestId)

      if (data.error) {
        pending.reject(new Error(data.error as string))
      } else {
        pending.resolve(data)
      }
    }
    return
  }

  if (type === 'event' && eventType) {
    // Forward events to registered listeners
    emitEvent(eventType, data)
    return
  }

  log('Unknown message from data process:', type)
}

/**
 * Emit an event to registered listeners
 */
function emitEvent(eventType: string, data: unknown): void {
  const listeners = eventListeners.get(eventType)
  if (listeners) {
    for (const listener of listeners) {
      try {
        listener(data)
      } catch (err) {
        console.error('[DataProcessManager] Event listener error:', err)
      }
    }
  }
}

/**
 * Register an event listener
 */
export function onEvent(eventType: string, listener: (data: unknown) => void): () => void {
  let listeners = eventListeners.get(eventType)
  if (!listeners) {
    listeners = new Set()
    eventListeners.set(eventType, listeners)
  }
  listeners.add(listener)

  return () => {
    listeners!.delete(listener)
    if (listeners!.size === 0) {
      eventListeners.delete(eventType)
    }
  }
}

// ─── Renderer Communication ─────────────────────────────────────────────────

/**
 * Set up MessagePort channel between a window and the data process
 */
export function setupWindowChannel(window: BrowserWindow): void {
  const windowId = window.id

  // Create a MessageChannel
  const { port1, port2 } = new MessageChannelMain()

  // Store port1 for cleanup
  const existingPort = windowPorts.get(windowId)
  if (existingPort) {
    existingPort.close()
  }
  windowPorts.set(windowId, port1)

  // Send port2 to the data process (if running)
  if (dataProcess && isReady) {
    dataProcess.postMessage({ type: 'renderer-port', windowId: String(windowId) }, [port1])
  }

  // Send port2 to the renderer
  window.webContents.postMessage('data-channel', { windowId }, [port2])

  // Clean up when window is closed
  window.on('closed', () => {
    const port = windowPorts.get(windowId)
    if (port) {
      port.close()
      windowPorts.delete(windowId)
    }
    if (dataProcess && isReady) {
      dataProcess.postMessage({ type: 'renderer-disconnected', windowId: String(windowId) })
    }
  })
}

// ─── IPC Handlers ───────────────────────────────────────────────────────────

/**
 * Set up IPC handlers that proxy to the data process
 */
export function setupDataProcessIPC(getMainWindow: () => BrowserWindow | null): void {
  // Forward BSM status changes to renderer
  onEvent('bsm:status-change', (data) => {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('xnet:bsm:status-change', data)
    }
  })

  // Forward peer events to renderer
  onEvent('bsm:peer-connected', (data) => {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('xnet:bsm:peer-connected', data)
    }
  })

  onEvent('bsm:peer-disconnected', (data) => {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('xnet:bsm:peer-disconnected', data)
    }
  })

  onEvent('bsm:blob-received', (data) => {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('xnet:bsm:blob-received', data)
    }
  })

  // ─── BSM IPC Handlers ─────────────────────────────────────────────────────

  ipcMain.handle(
    'xnet:bsm:start',
    async (_event, opts: { signalingUrl: string; authorDID?: string; signingKey?: number[] }) => {
      await sendRequest('bsm:start', opts)
    }
  )

  ipcMain.handle('xnet:bsm:stop', async () => {
    await sendRequest('bsm:stop', {})
  })

  ipcMain.handle('xnet:bsm:acquire', async (event, opts: { nodeId: string; schemaId: string }) => {
    const windowId = event.sender.id
    await sendRequest('bsm:acquire', { ...opts, windowId: String(windowId) })

    // The port transfer happens via the data-channel, not here
    // But we still need to signal the renderer that acquisition is complete
    event.sender.postMessage('xnet:bsm:port', { nodeId: opts.nodeId })
  })

  ipcMain.handle('xnet:bsm:release', async (event, opts: { nodeId: string }) => {
    const windowId = event.sender.id
    await sendRequest('bsm:release', { ...opts, windowId: String(windowId) })
  })

  ipcMain.handle('xnet:bsm:track', async (_event, opts: { nodeId: string; schemaId: string }) => {
    await sendRequest('bsm:track', opts)
  })

  ipcMain.handle('xnet:bsm:untrack', async (_event, opts: { nodeId: string }) => {
    await sendRequest('bsm:untrack', opts)
  })

  ipcMain.handle('xnet:bsm:status', async () => {
    return sendRequest('bsm:status', {})
  })

  // ─── Blob IPC Handlers ────────────────────────────────────────────────────

  ipcMain.handle('xnet:bsm:request-blobs', async (_event, opts: { cids: string[] }) => {
    await sendRequest('blob:request', opts)
  })

  ipcMain.handle('xnet:bsm:announce-blobs', async (_event, opts: { cids: string[] }) => {
    await sendRequest('blob:announce', opts)
  })

  ipcMain.handle('xnet:bsm:get-blob', async (_event, opts: { cid: string }) => {
    const result = (await sendRequest('blob:get', opts)) as { data: number[] | null }
    return result.data
  })

  ipcMain.handle('xnet:bsm:put-blob', async (_event, opts: { data: number[] }) => {
    const result = (await sendRequest('blob:put', opts)) as { cid: string }
    return result.cid
  })

  ipcMain.handle('xnet:bsm:has-blob', async (_event, opts: { cid: string }) => {
    const result = (await sendRequest('blob:has', opts)) as { has: boolean }
    return result.has
  })

  // ─── Debug IPC Handlers ───────────────────────────────────────────────────

  ipcMain.handle('xnet:bsm:set-debug', async (_event, enabled: boolean) => {
    debugEnabled = enabled
    await sendRequest('debug:set', { enabled })
  })

  ipcMain.handle('xnet:bsm:get-debug', async () => {
    const result = (await sendRequest('debug:get', {})) as { enabled: boolean }
    return result.enabled
  })
}

/**
 * Check if data process is running and ready
 */
export function isDataProcessReady(): boolean {
  return isReady
}
