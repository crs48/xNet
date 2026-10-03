/**
 * Auto-updater for xNet desktop app.
 *
 * Uses electron-updater to check GitHub Releases for new versions,
 * download updates in the background, and prompt the user to restart.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { BrowserWindow, dialog, app, ipcMain } from 'electron'
import pkg from 'electron-updater'
const { autoUpdater } = pkg

// ─── Configuration ──────────────────────────────────────────

// Download in the background; installation waits for a verified recovery copy.
autoUpdater.autoDownload = true
// Only the main-process save/checkpoint barrier may hand control to the installer.
autoUpdater.autoInstallOnAppQuit = false

// Check interval: every 4 hours
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

// Delay before first check (let the app finish loading)
const INITIAL_CHECK_DELAY_MS = 10_000

// ─── Helpers ────────────────────────────────────────────────

/** Safely send IPC to a window, guarding against destroyed windows. */
function safeSend(window: BrowserWindow, channel: string, data: unknown): void {
  if (!window.isDestroyed()) {
    window.webContents.send(channel, data)
  }
}

// ─── Init ───────────────────────────────────────────────────

let checkInterval: ReturnType<typeof setInterval> | null = null
let initialTimeout: ReturnType<typeof setTimeout> | null = null
let initialized = false
let downloadedUpdateReady = false

export function hasDownloadedUpdate(): boolean {
  return downloadedUpdateReady
}

export function installDownloadedUpdate(): void {
  autoUpdater.quitAndInstall()
}

export function initAutoUpdater(
  mainWindow: BrowserWindow,
  requestInstall: () => Promise<void>
): void {
  // Skip in development
  if (!app.isPackaged) {
    return
  }

  // Prevent double-initialization (IPC handlers can only register once)
  if (initialized) {
    return
  }
  initialized = true

  // Check for updates on startup (after a delay)
  initialTimeout = setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {
      // Silently ignore — network may be unavailable
    })
  }, INITIAL_CHECK_DELAY_MS)

  // Periodic check — store handle for cleanup
  checkInterval = setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {})
  }, CHECK_INTERVAL_MS)

  // Clean up intervals when the window is closed
  mainWindow.on('closed', () => {
    if (checkInterval) {
      clearInterval(checkInterval)
      checkInterval = null
    }
    if (initialTimeout) {
      clearTimeout(initialTimeout)
      initialTimeout = null
    }
  })

  // ─── Events ─────────────────────────────────────────────

  autoUpdater.on('update-available', (info: any) => {
    safeSend(mainWindow, 'update-available', {
      version: info.version,
      releaseNotes: info.releaseNotes
    })
  })

  autoUpdater.on('download-progress', (progress: any) => {
    safeSend(mainWindow, 'update-progress', {
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
    downloadedUpdateReady = true
    if (process.platform === 'darwin') {
      app.dock?.setBadge('')
    }

    safeSend(mainWindow, 'update-ready', {
      version: info.version
    })

    if (mainWindow.isDestroyed()) return

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
          void requestInstall()
        }
      })
  })

  autoUpdater.on('error', (err: Error) => {
    safeSend(mainWindow, 'update-error', {
      message: err.message
    })
  })

  // ─── IPC handlers for manual update control ─────────────

  ipcMain.handle('check-for-updates', async () => {
    const result = await autoUpdater.checkForUpdates()
    if (!result) throw new Error('Update checks are unavailable in this installation.')
    return result.updateInfo
  })

  ipcMain.handle('download-update', () => {
    return autoUpdater.downloadUpdate()
  })

  ipcMain.handle('install-update', () => {
    return requestInstall()
  })
}
