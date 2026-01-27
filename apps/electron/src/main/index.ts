/**
 * Electron main process entry point
 */
import { app, BrowserWindow } from 'electron'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

// ESM __dirname shim (electron-vite outputs ESM)
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
import { setupIPC, getOrCreateStorage } from './ipc'
import { setupBSM } from './bsm'
import { createMenu } from './menu'

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
let bsm: { stop: () => Promise<void> } | null = null

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
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
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
  // Create storage early so both IPC and BSM can use it
  const storage = getOrCreateStorage()
  await storage.open()

  // Setup IPC handlers
  setupIPC()

  // Setup Background Sync Manager with blob storage
  bsm = setupBSM({
    getMainWindow: () => mainWindow,
    blobStorage: storage
  })

  // Create menu
  createMenu()

  // Create window
  await createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', async () => {
  if (bsm) {
    await bsm.stop()
    bsm = null
  }
})
