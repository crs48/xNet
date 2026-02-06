/**
 * Electron main process entry point
 */
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { app, BrowserWindow } from 'electron'

// Enable remote debugging in development for Playwright/CDP testing
// CDP port is configurable via ELECTRON_CDP_PORT env var (default: 9223)
if (process.env.NODE_ENV === 'development') {
  const cdpPort = process.env.ELECTRON_CDP_PORT || '9223'
  app.commandLine.appendSwitch('remote-debugging-port', cdpPort)
}

// ESM __dirname shim (electron-vite outputs ESM)
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
import {
  spawnDataProcess,
  stopDataProcess,
  setupDataProcessIPC,
  setupWindowChannel
} from './data-process-manager'
import { setupIPC, getOrCreateStorage } from './ipc'
import { startLocalAPI, stopLocalAPI, setupLocalAPIIPC } from './local-api'
import { createMenu } from './menu'
import { setupServiceIPC, cleanupServices } from './service-ipc'
import { initAutoUpdater } from './updater'

// Profile support for running multiple instances with separate data
// Usage: XNET_PROFILE=user2 pnpm dev:electron
export const profile = process.env.XNET_PROFILE || 'default'

// Set separate user data path for each profile BEFORE app is ready
// This isolates IndexedDB, localStorage, cookies, etc. between profiles
if (profile !== 'default') {
  const userDataPath = join(app.getPath('userData'), '..', `xnet-desktop-${profile}`)
  app.setPath('userData', userDataPath)
}

export const dataPath = join(app.getPath('userData'), 'xnet-data')

let mainWindow: BrowserWindow | null = null

// Database path for utility process
const dbPath = join(app.getPath('userData'), 'xnet-data', 'data.db')

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
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
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

  // Start Local API server (for external integrations)
  await startLocalAPI()

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
  // Stop Local API server
  await stopLocalAPI()

  // Stop all plugin services
  await cleanupServices()

  // Stop data utility process (handles BSM, SQLite, Yjs cleanup)
  await stopDataProcess()
})
