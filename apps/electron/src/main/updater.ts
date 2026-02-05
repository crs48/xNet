/**
 * Auto-updater for xNet desktop app.
 *
 * Uses electron-updater to check GitHub Releases for new versions,
 * download updates in the background, and prompt the user to restart.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-expect-error — electron-updater installed as production dep at build time
import { autoUpdater } from 'electron-updater'
import { BrowserWindow, dialog, app, ipcMain } from 'electron'

// ─── Configuration ──────────────────────────────────────────

// Disable auto download — we ask the user first
autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = true

// Check interval: every 4 hours
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

// Delay before first check (let the app finish loading)
const INITIAL_CHECK_DELAY_MS = 10_000

// ─── Init ───────────────────────────────────────────────────

export function initAutoUpdater(mainWindow: BrowserWindow): void {
  // Skip in development
  if (process.env.NODE_ENV === 'development') {
    return
  }

  // Check for updates on startup (after a delay)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {
      // Silently ignore — network may be unavailable
    })
  }, INITIAL_CHECK_DELAY_MS)

  // Periodic check
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {})
  }, CHECK_INTERVAL_MS)

  // ─── Events ─────────────────────────────────────────────

  autoUpdater.on('update-available', (info: any) => {
    // Notify renderer
    mainWindow.webContents.send('update-available', {
      version: info.version,
      releaseNotes: info.releaseNotes
    })

    dialog
      .showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Available',
        message: `Version ${info.version} is available.`,
        detail: 'Would you like to download and install it now?',
        buttons: ['Download', 'Later'],
        defaultId: 0
      })
      .then(({ response }: { response: number }) => {
        if (response === 0) {
          autoUpdater.downloadUpdate()
        }
      })
  })

  autoUpdater.on('download-progress', (progress: any) => {
    mainWindow.webContents.send('update-progress', {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total
    })

    // Update dock badge on macOS
    if (process.platform === 'darwin') {
      app.dock?.setBadge(`${Math.round(progress.percent)}%`)
    }
  })

  autoUpdater.on('update-downloaded', (info: any) => {
    if (process.platform === 'darwin') {
      app.dock?.setBadge('')
    }

    mainWindow.webContents.send('update-ready', {
      version: info.version
    })

    dialog
      .showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Ready',
        message: `Version ${info.version} has been downloaded.`,
        detail: 'The update will be installed when you quit the app. Restart now?',
        buttons: ['Restart', 'Later'],
        defaultId: 0
      })
      .then(({ response }: { response: number }) => {
        if (response === 0) {
          autoUpdater.quitAndInstall()
        }
      })
  })

  autoUpdater.on('error', (err: Error) => {
    mainWindow.webContents.send('update-error', {
      message: err.message
    })
  })
}

// ─── IPC handlers for manual update control ─────────────────

ipcMain.handle('check-for-updates', async () => {
  try {
    const result = await autoUpdater.checkForUpdates()
    return result?.updateInfo ?? null
  } catch {
    return null
  }
})

ipcMain.handle('download-update', () => {
  autoUpdater.downloadUpdate()
})

ipcMain.handle('install-update', () => {
  autoUpdater.quitAndInstall()
})
