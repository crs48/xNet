/**
 * Electron main process entry point
 */
import { appendFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { app, BrowserWindow } from 'electron'
import { setupAgentBridgeIPC, startAgentBridge, stopAgentBridge } from './agent-bridge-manager'
import { setupCloudflareTunnelIPC, stopCloudflareTunnel } from './cloudflare-tunnel-ipc'
import { installMainCrashLog } from './crash-log'
import {
  spawnDataProcess,
  stopDataProcess,
  setupDataProcessIPC,
  setupWindowChannel
} from './data-process-manager'
import { parseConnectDeepLink, type CloudConnectPayload } from './deep-link'
import { setupIPC, getOrCreateStorage } from './ipc'
import { startLocalAPI, stopLocalAPI, setupLocalAPIIPC } from './local-api'
import { setupMeetingCaptureIPC } from './meeting-capture-ipc'
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

// macOS system-audio loopback for meeting capture (exploration 0279):
// Chromium gates mac loopback behind feature flags. Phase-1 path; the
// production route is the phase-3 Core Audio tap helper. Must be set before
// app ready.
if (process.platform === 'darwin') {
  app.commandLine.appendSwitch(
    'enable-features',
    'MacLoopbackAudioForScreenShare,MacSckSystemAudioLoopbackOverride'
  )
}

// ESM __dirname shim (electron-vite outputs ESM)
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

let mainWindow: BrowserWindow | null = null
let pendingSharePayload: string | null = null
let pendingCloudConnect: CloudConnectPayload | null = null
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

/**
 * Route a validated `xnet://connect` payload to the renderer, which shows a
 * confirmation before applying the hub (never auto-connect). If the window isn't
 * ready yet (cold launch from the deep link), stash it for `did-finish-load`.
 */
function deliverCloudConnect(payload: CloudConnectPayload): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('xnet:cloud-connect', payload)
    return
  }

  pendingCloudConnect = payload
}

function handleDeepLink(rawUrl: string): void {
  // Legacy share links: xnet://share?... (parsed + validated inline below).
  const payload = parseSharePayloadFromDeepLink(rawUrl)
  if (payload) {
    deliverSharePayload(payload)
    return
  }
  // xNet Cloud "Open in desktop app": xnet://connect?hub=<wss>&code=<short>.
  // parseConnectDeepLink hard-validates the hub (wss + host allowlist); the
  // renderer still requires explicit user confirmation before connecting.
  const connect = parseConnectDeepLink(rawUrl)
  if (connect) {
    deliverCloudConnect(connect)
  }
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

  // E2E: a test can pin the renderer's hub at boot (avoiding a post-boot
  // repoint race) by setting XNET_HUB_URL; it's forwarded as a `?hub=` query the
  // renderer reads in `configuredHubUrl()`.
  const hubOverride = process.env.XNET_HUB_URL

  // Load the app
  if (process.env.NODE_ENV === 'development') {
    const port = process.env.VITE_PORT || '5177'
    const query = hubOverride ? `?hub=${encodeURIComponent(hubOverride)}` : ''
    mainWindow.loadURL(`http://localhost:${port}/${query}`)
    if (process.env.XNET_TEST_BYPASS !== 'true') {
      mainWindow.webContents.openDevTools()
    }
  } else {
    mainWindow.loadFile(
      join(__dirname, '../renderer/index.html'),
      hubOverride ? { query: { hub: hubOverride } } : {}
    )
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.on('did-finish-load', () => {
    if (pendingSharePayload) {
      mainWindow?.webContents.send('xnet:share-payload', { payload: pendingSharePayload })
      pendingSharePayload = null
    }
    if (pendingCloudConnect) {
      mainWindow?.webContents.send('xnet:cloud-connect', pendingCloudConnect)
      pendingCloudConnect = null
    }
  })
}

// Boot creates the window only after awaiting storage + the data process. If any
// of that rejects (e.g. the data utility process never signals ready), the window
// is never created and the app looks dead with no clue why — the whenReady chain
// below has no catch. Surface such failures loudly on stderr so the packaged-smoke
// gate and users' logs show the real cause instead of a silent hang.
// Boot trace: write to fd 2 (not console, which downstream code may reassign) and,
// when XNET_BOOT_TRACE names a file, append there too — a backstop that survives
// stderr-capture quirks so the CI smoke gate can read exactly how far boot got.
const bootTraceFile = process.env.XNET_BOOT_TRACE
const bootTrace = (msg: string): void => {
  const line = `[boot] ${msg}\n`
  process.stderr.write(line)
  if (bootTraceFile) {
    try {
      appendFileSync(bootTraceFile, line)
    } catch {
      // tracing must never break boot
    }
  }
}
process.on('unhandledRejection', (reason) => {
  bootTrace(`unhandled rejection during startup: ${String(reason)}`)
})
// Structured crash capture (0315): uncaughtException + unhandledRejection →
// stderr + a bounded local file under userData. Local-only; the renderer can
// attach it to a user-triggered debug report but nothing auto-transmits.
installMainCrashLog(app.getPath('userData'))
bootTrace('main module loaded')

app.whenReady().then(async () => {
  bootTrace('whenReady fired')
  app.setAsDefaultProtocolClient(DEEP_LINK_PROTOCOL)

  for (const arg of process.argv) {
    if (arg.startsWith(`${DEEP_LINK_PROTOCOL}://`)) {
      handleDeepLink(arg)
      break
    }
  }

  // Create storage early so IPC can use it
  const storage = getOrCreateStorage()
  bootTrace('opening storage')
  await storage.open()

  // Spawn the data utility process (SQLite, Yjs, WebSocket sync)
  // This runs data operations off the main thread
  bootTrace('spawning data process')
  await spawnDataProcess(dbPath)
  bootTrace('data process ready')

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

  // Setup meeting capture IPC (system-audio loopback + native STT engines)
  setupMeetingCaptureIPC()

  // Setup Cloudflare tunnel IPC handlers
  cleanupTunnelIPC = setupCloudflareTunnelIPC()

  // Setup agent bridge IPC handlers (drives the user's claude/codex CLI)
  setupAgentBridgeIPC()

  // Setup dev-only Storybook IPC handlers
  if (process.env.NODE_ENV === 'development') {
    setupStorybookIPC()
  }

  // Start Local API server (for external integrations)
  bootTrace('starting local API')
  await startLocalAPI()

  // Start the agent bridge daemon (no-op if the agent CLI isn't installed).
  // Fire-and-forget: a slow `--version` probe must not delay window creation.
  void startAgentBridge().catch(() => undefined)

  // Create menu
  createMenu()

  // Create window
  bootTrace('creating window')
  await createWindow()
  bootTrace('window created')

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
