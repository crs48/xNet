/**
 * Electron main process entry point
 */
import { appendFileSync, existsSync, readlinkSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { app, BrowserWindow, dialog, safeStorage } from 'electron'
import { inspectCheckpoints } from '../storage/checkpoints'
import { requireCompatibleDatabase } from '../storage/compatibility'
import { readDesktopSettings } from '../storage/desktop-settings'
import { prepareWorkspaceUpgrade } from '../storage/migrations'
import { recoverPendingRestore, restoreCheckpoint } from '../storage/restore'
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
import { attachDevLogWindow, installDevLogBridge } from './dev-log-bridge'
import { titleSuffix } from './dev-scope'
import { getOrCreateIdentitySeed } from './identity-seed'
import { setupIPC, getOrCreateStorage, closeStorage } from './ipc'
import { configureLibrary, setupLibraryIPC } from './library-ipc'
import { startLocalAPI, stopLocalAPI, setupLocalAPIIPC } from './local-api'
import { setupMeetingCaptureIPC } from './meeting-capture-ipc'
import { createMenu } from './menu'
import { dataPath, profile } from './profile'
import { createQuitBarrier } from './quit-barrier'
import { setupRecordingCaptureIPC, shutdownRecordingCapture } from './recording-capture-ipc'
import { checkpointWorkspace, recoveryPath, recoveryIsBusy, setupRecovery } from './recovery'
import { flushRenderers, resumeRenderers, setupRendererFlush } from './renderer-flush'
import { setupServiceIPC, cleanupServices } from './service-ipc'
import { setupSocialImportIPC, hasActiveSocialImports } from './social-import-ipc'
import { setupSpatialLibraryIPC, stopSpatialLibrary } from './spatial-library-ipc'
import { showStartupRecovery } from './startup-recovery'
import { setupStorybookIPC, stopStorybook } from './storybook-ipc'
import { hasDownloadedUpdate, initAutoUpdater, installDownloadedUpdate } from './updater'

// Capture main-process console output for the renderer console (0413). First
// statement after the imports so a failure during early module init is still
// buffered — that is the whole point of the ring buffer.
installDevLogBridge()

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
let installRequested = false
let workspaceReady = false
let writersStopped = false

async function stopWorkspaceWriters(): Promise<void> {
  await shutdownRecordingCapture()
  await stopAgentBridge()
  await stopSpatialLibrary()
  await stopLocalAPI()
  await cleanupServices()
  await stopCloudflareTunnel()
  await stopStorybook()
  await stopDataProcess()
  await closeStorage()
  writersStopped = true
}

async function restartWorkspaceWriters(): Promise<void> {
  await recoverPendingRestore(dataPath, recoveryPath, {
    allowTestIdentity: process.env.XNET_TEST_BYPASS === 'true'
  })
  process.env.XNET_RECOVERY_OFFLINE = existsSync(join(recoveryPath, 'review-required.json'))
    ? 'true'
    : 'false'
  requireCompatibleDatabase(dbPath)
  requireCompatibleDatabase(join(dataPath, 'xnet.db'), 'blobs')
  requireCompatibleDatabase(join(dataPath, 'library.db'), 'library')
  await readDesktopSettings(dataPath, safeStorage)
  await getOrCreateStorage().open()
  await spawnDataProcess(dbPath)
  await configureLibrary()
  writersStopped = false
  if (process.env.XNET_RECOVERY_OFFLINE !== 'true') {
    await startLocalAPI()
    await startAgentBridge()
  }
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.once('did-finish-load', () => setupWindowChannel(window))
    window.reload()
  }
}

const quitBarrier = createQuitBarrier({
  prepare: async () => {
    if (!workspaceReady) {
      await stopDataProcess()
      await closeStorage()
      return
    }
    if (hasActiveSocialImports())
      throw new Error('An import is still running. Finish or cancel it before quitting.')
    if (recoveryIsBusy())
      throw new Error('Wait for the current recovery operation before quitting.')
    await flushRenderers()
    await stopWorkspaceWriters()
    cleanupTunnelIPC?.()
    cleanupTunnelIPC = null
    await checkpointWorkspace({ writersStopped: true, resume: false })
  },
  finish: () => {
    if (installRequested || hasDownloadedUpdate()) installDownloadedUpdate()
    else app.quit()
  },
  failed: async (error) => {
    installRequested = false
    if (writersStopped) {
      try {
        await restartWorkspaceWriters()
      } catch (restartError) {
        workspaceReady = false
        await showStartupRecovery(restartError, dataPath)
        app.exit(1)
        return
      }
    }
    resumeRenderers()
    dialog.showErrorBox(
      'xNet is still open',
      error instanceof Error ? error.message : String(error)
    )
  }
})
setupRendererFlush()

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

/**
 * Who holds this profile's Chromium single-instance lock, as `host-pid`.
 *
 * `SingletonLock` is a symlink whose target names the holder; reading the link
 * is enough and never touches the lock itself. Returns `null` when it is
 * missing or unreadable — "unknown holder" and "no holder" are different facts,
 * and the caller prints them differently.
 */
function readSingletonLockHolder(userDataPath: string): string | null {
  try {
    return readlinkSync(join(userDataPath, 'SingletonLock'))
  } catch {
    return null
  }
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  // Losing the lock used to be `app.quit()` — no message, **exit 0** (0413).
  // An agent read that as success, attached to the CDP port, and drove whatever
  // instance already owned it: a different worktree, a different branch, a
  // healthy-looking app. Every step succeeded and the verification was false.
  // A failure the caller cannot distinguish from success is a bug, not a guard.
  const userData = app.getPath('userData')
  console.error(
    `[xnet-dev] FATAL: profile "${profile}" is already running ` +
      `(lock held by ${readSingletonLockHolder(userData) ?? 'an unidentified process'}).\n` +
      `[xnet-dev]   userData: ${userData}\n` +
      `[xnet-dev]   Another worktree or a stale process owns this profile. ` +
      `Set XNET_PROFILE, or run: pnpm --filter xnet-desktop dev:clean`
  )
  app.exit(1)
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
  // Identify the instance in the title, in development, for EVERY profile
  // including `default` (0413). Pre-0413 a `default` instance was titled plain
  // `xNet`, so two of them — the exact collision worth catching — were
  // indistinguishable. Production keeps the clean product name.
  const title = process.env.NODE_ENV === 'development' ? `xNet (${titleSuffix(profile)})` : 'xNet'

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

  // The `title` option above is only the *initial* title: Electron discards it
  // as soon as the loaded document declares its own `<title>`, which
  // `renderer/index.html` does. Own the title instead, or the instance label is
  // silently reverted to plain `xNet` — the very thing 0413 is fixing.
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.on('page-title-updated', (event) => {
      event.preventDefault()
      mainWindow?.setTitle(title)
    })
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  const window = mainWindow
  let closing = false
  window.on('close', (event) => {
    if (quitBarrier.approved) return
    event.preventDefault()
    if (closing) return
    closing = true
    void flushRenderers([window])
      .then(() => window.destroy())
      .catch((error: unknown) => {
        closing = false
        resumeRenderers()
        dialog.showErrorBox(
          'Your workspace is still open',
          error instanceof Error ? error.message : String(error)
        )
      })
  })

  mainWindow.webContents.on('did-finish-load', () => {
    bootTrace('renderer loaded')
    // Flush everything main logged before a renderer existed (0413). Done here
    // rather than at window creation so the renderer's own listener is already
    // registered and the flush cannot race it.
    if (mainWindow) attachDevLogWindow(mainWindow)
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

app
  .whenReady()
  .then(async () => {
    bootTrace('whenReady fired')
    app.setAsDefaultProtocolClient(DEEP_LINK_PROTOCOL)

    for (const arg of process.argv) {
      if (arg.startsWith(`${DEEP_LINK_PROTOCOL}://`)) {
        handleDeepLink(arg)
        break
      }
    }

    await recoverPendingRestore(dataPath, recoveryPath, {
      allowTestIdentity: process.env.XNET_TEST_BYPASS === 'true'
    })
    requireCompatibleDatabase(join(dataPath, 'library.db'), 'library')
    await readDesktopSettings(dataPath, safeStorage)
    await prepareWorkspaceUpgrade({
      dataPath,
      recoveryPath,
      profile,
      appVersion: app.getVersion(),
      testIdentity: process.env.XNET_TEST_BYPASS === 'true',
      requireIdentity: () => {
        getOrCreateIdentitySeed(dataPath, safeStorage, {
          profile,
          testMode: process.env.XNET_TEST_BYPASS === 'true'
        })
      }
    })
    process.env.XNET_RECOVERY_OFFLINE = existsSync(join(recoveryPath, 'review-required.json'))
      ? 'true'
      : 'false'

    // Resolve identity before opening stores: an unavailable key must not look like a fresh app.
    getOrCreateIdentitySeed(dataPath, safeStorage, {
      profile,
      testMode: process.env.XNET_TEST_BYPASS === 'true'
    })

    // Create storage early so IPC can use it
    const storage = getOrCreateStorage()
    bootTrace('opening storage')
    await storage.open()

    // Spawn the data utility process (SQLite, Yjs, WebSocket sync)
    // This runs data operations off the main thread
    bootTrace('spawning data process')
    await spawnDataProcess(dbPath)
    bootTrace('data process ready')
    await configureLibrary()
    setupLibraryIPC(() => mainWindow)
    setupSpatialLibraryIPC()

    // Setup IPC handlers for main process operations
    setupIPC()
    setupRecovery({ stopWriters: stopWorkspaceWriters, restartWriters: restartWorkspaceWriters })
    workspaceReady = true

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

    // Setup recording capture IPC (ScreenCaptureKit helper, exploration 0414)
    setupRecordingCaptureIPC()

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
    if (process.env.XNET_RECOVERY_OFFLINE !== 'true') await startLocalAPI()

    // Start the agent bridge daemon (no-op if the agent CLI isn't installed).
    // Fire-and-forget: a slow `--version` probe must not delay window creation.
    if (process.env.XNET_RECOVERY_OFFLINE !== 'true') void startAgentBridge().catch(() => undefined)

    // Create menu
    createMenu()

    // Create window
    bootTrace('creating window')
    await createWindow()
    bootTrace('window created')

    // Setup MessagePort channel between renderer and data process
    if (mainWindow) {
      setupWindowChannel(mainWindow)
      initAutoUpdater(mainWindow, async () => {
        if (!hasDownloadedUpdate()) throw new Error('No downloaded update is ready to install.')
        installRequested = true
        await quitBarrier.request()
      })
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
  .catch(async (error: unknown) => {
    workspaceReady = false
    await stopDataProcess()
    await closeStorage()
    let latest: string | undefined
    try {
      const listing = await inspectCheckpoints(recoveryPath)
      for (const point of listing.unreadable)
        console.error('[Recovery] Preserved unreadable point:', point.id, point.reason)
      latest = listing.checkpoints.find((point) => point.profile === profile)?.id
    } catch (listingError) {
      console.error('[Recovery] Could not list recovery copies:', listingError)
    }
    await showStartupRecovery(
      error,
      dataPath,
      latest
        ? () =>
            restoreCheckpoint({
              id: latest!,
              dataPath,
              recoveryPath,
              profile,
              allowTestIdentity: process.env.XNET_TEST_BYPASS === 'true'
            })
        : undefined
    )
  })

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', (event) => {
  if (quitBarrier.approved) return
  event.preventDefault()
  void quitBarrier.request()
})
