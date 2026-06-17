/**
 * Electron main process entry point
 */
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { app, BrowserWindow } from 'electron'
import { setupAgentBridgeIPC, startAgentBridge, stopAgentBridge } from './agent-bridge-manager'
import { setupCloudflareTunnelIPC, stopCloudflareTunnel } from './cloudflare-tunnel-ipc'
import {
  spawnDataProcess,
  stopDataProcess,
  setupDataProcessIPC,
  setupWindowChannel
} from './data-process-manager'
import { setupIPC, getOrCreateStorage } from './ipc'
import { startLocalAPI, stopLocalAPI, setupLocalAPIIPC } from './local-api'
import { createMenu } from './menu'
import { dataPath, profile } from './profile'
import { setupServiceIPC, cleanupServices } from './service-ipc'
import { setupSocialImportIPC } from './social-import-ipc'
import { setupStorybookIPC, stopStorybook } from './storybook-ipc'
import { initAutoUpdater } from './updater'

// Enable remote debugging in development for Playwright/CDP testing
// CDP port is configurable via ELECTRON_CDP_PORT env var (default: 9223)
if (process.env.NODE_ENV === 'development') {
  const cdpPort = process.env.ELECTRON_CDP_PORT || '9223'
  app.commandLine.appendSwitch('remote-debugging-port', cdpPort)
}

// ESM __dirname shim (electron-vite outputs ESM)
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

let mainWindow: BrowserWindow | null = null
let pendingSharePayload: string | null = null
let cleanupTunnelIPC: (() => void) | null = null

const DEEP_LINK_PROTOCOL = 'xnet'

function parseSharePayloadFromDeepLink(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol !== `${DEEP_LINK_PROTOCOL}:`) {
      return null
    }
    if (parsed.hostname !== 'share') {
      return null
    }

    const handle = parsed.searchParams.get('handle')
    if (handle) {
      if (handle.length > 256 || !/^sh_[A-Za-z0-9_-]{16,}$/.test(handle)) {
        return null
      }
      return handle
    }

    // Durable share link form: xnet://share?link=<id>&hub=<url>#s=<secret>.
    // Forward the validated URL verbatim; the renderer parses + claims it.
    const linkId = parsed.searchParams.get('link')
    if (linkId) {
      if (rawUrl.length > 2048 || !/^[A-Za-z0-9_-]{8,64}$/.test(linkId)) {
        return null
      }
      const hub = parsed.searchParams.get('hub')
      if (!hub || hub.length > 512) {
        return null
      }
      try {
        const hubUrl = new URL(hub)
        if (!['http:', 'https:', 'ws:', 'wss:'].includes(hubUrl.protocol)) {
          return null
        }
      } catch {
        return null
      }
      const secret = new URLSearchParams(parsed.hash.replace(/^#/, '')).get('s') ?? ''
      if (secret && !/^[A-Za-z0-9_-]{8,256}$/.test(secret)) {
        return null
      }
      return rawUrl
    }

    const payload = parsed.searchParams.get('payload')
    if (!payload) {
      return null
    }

    // Keep payload bounded and URL-safe before forwarding to renderer.
    if (payload.length > 8192 || !/^[A-Za-z0-9_-]+$/.test(payload)) {
      return null
    }

    return payload
  } catch {
    return null
  }
}

function deliverSharePayload(payload: string): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('xnet:share-payload', { payload })
    return
  }

  pendingSharePayload = payload
}

function handleDeepLink(rawUrl: string): void {
  const payload = parseSharePayloadFromDeepLink(rawUrl)
  if (!payload) {
    return
  }
  deliverSharePayload(payload)
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  app.quit()
}

app.on('second-instance', (_event, argv) => {
  const deepLinkArg = argv.find((value) => value.startsWith(`${DEEP_LINK_PROTOCOL}://`))
  if (deepLinkArg) {
    handleDeepLink(deepLinkArg)
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }
    mainWindow.focus()
  }
})

app.on('open-url', (event, url) => {
  event.preventDefault()
  handleDeepLink(url)
})

// Database path for utility process
const dbPath = join(dataPath, 'data.db')

async function createWindow() {
  // Show profile in title for multi-instance testing
  const title = profile === 'default' ? 'xNet' : `xNet (${profile})`

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Load the app
  if (process.env.NODE_ENV === 'development') {
    const port = process.env.VITE_PORT || '5177'
    mainWindow.loadURL(`http://localhost:${port}`)
    if (process.env.XNET_TEST_BYPASS !== 'true') {
      mainWindow.webContents.openDevTools()
    }
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.on('did-finish-load', () => {
    if (!pendingSharePayload) {
      return
    }
    mainWindow?.webContents.send('xnet:share-payload', { payload: pendingSharePayload })
    pendingSharePayload = null
  })
}

app.whenReady().then(async () => {
  app.setAsDefaultProtocolClient(DEEP_LINK_PROTOCOL)

  for (const arg of process.argv) {
    if (arg.startsWith(`${DEEP_LINK_PROTOCOL}://`)) {
      handleDeepLink(arg)
      break
    }
  }

  // Create storage early so IPC can use it
  const storage = getOrCreateStorage()
  await storage.open()

  // Spawn the data utility process (SQLite, Yjs, WebSocket sync)
  // This runs data operations off the main thread
  await spawnDataProcess(dbPath)

  // Setup IPC handlers for main process operations
  setupIPC()

  // Setup IPC handlers that proxy to data utility process
  setupDataProcessIPC(() => mainWindow)

  // Setup service IPC for plugin background processes
  setupServiceIPC()

  // Setup Local API IPC handlers
  setupLocalAPIIPC()

  // Setup local social import IPC handlers
  setupSocialImportIPC(() => mainWindow)

  // Setup Cloudflare tunnel IPC handlers
  cleanupTunnelIPC = setupCloudflareTunnelIPC()

  // Setup agent bridge IPC handlers (drives the user's claude/codex CLI)
  setupAgentBridgeIPC()

  // Setup dev-only Storybook IPC handlers
  if (process.env.NODE_ENV === 'development') {
    setupStorybookIPC()
  }

  // Start Local API server (for external integrations)
  await startLocalAPI()

  // Start the agent bridge daemon (no-op if the agent CLI isn't installed).
  // Fire-and-forget: a slow `--version` probe must not delay window creation.
  void startAgentBridge().catch(() => undefined)

  // Create menu
  createMenu()

  // Create window
  await createWindow()

  // Setup MessagePort channel between renderer and data process
  if (mainWindow) {
    setupWindowChannel(mainWindow)
    initAutoUpdater(mainWindow)
  }

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow()
      if (mainWindow) {
        setupWindowChannel(mainWindow)
      }
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', async () => {
  // Stop the agent bridge daemon
  await stopAgentBridge()

  // Stop Local API server
  await stopLocalAPI()

  // Stop all plugin services
  await cleanupServices()

  // Stop cloudflare tunnel process
  await stopCloudflareTunnel()

  // Remove tunnel event listeners
  cleanupTunnelIPC?.()
  cleanupTunnelIPC = null

  // Stop Storybook dev runtime
  await stopStorybook()

  // Stop data utility process (handles BSM, SQLite, Yjs cleanup)
  await stopDataProcess()
})
