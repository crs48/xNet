/**
 * Electron main process entry point
 */
import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { setupIPC } from './ipc'
import { createMenu } from './menu'

// Profile support for running multiple instances with separate data
// Usage: XNET_PROFILE=user2 pnpm dev:electron
const profile = process.env.XNET_PROFILE || 'default'
export const dataPath = join(app.getPath('userData'), `xnet-data-${profile}`)

let mainWindow: BrowserWindow | null = null

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
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  // Setup IPC handlers
  setupIPC()

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
