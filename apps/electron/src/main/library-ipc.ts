import { identityFromPrivateKey } from '@xnetjs/identity'
import { app, BrowserWindow, clipboard, globalShortcut, ipcMain, safeStorage } from 'electron'
import { sendDataProcessRequest } from './data-process-manager'
import { getOrCreateIdentitySeed } from './identity-seed'
import { dataPath, profile } from './profile'
import { withWorkspaceWriteBarrier } from './recovery'

export async function configureLibrary(): Promise<void> {
  const { seed } = getOrCreateIdentitySeed(dataPath, safeStorage, {
    profile,
    testMode: process.env.XNET_TEST_BYPASS === 'true'
  })
  try {
    await sendDataProcessRequest('library:configure', {
      authorDID: identityFromPrivateKey(seed).did,
      signingKey: Array.from(seed)
    })
    await freezeLibrary()
    try {
      await sendDataProcessRequest('library:recover-captures', {}, 120_000)
    } finally {
      await thawLibrary()
    }
  } finally {
    seed.fill(0)
  }
}
export const freezeLibrary = () => sendDataProcessRequest('library:freeze', {}, 120_000)
export const thawLibrary = () => sendDataProcessRequest('library:thaw', {})
export const refreshLibrarySources = () =>
  sendDataProcessRequest('library:scan', {}, 10 * 60 * 1000)
export function setupLibraryIPC(getWindow: () => BrowserWindow | null): void {
  let captureIntent: { url: string } | null = null
  let returnToPreviousApp = false
  const accelerator = 'CommandOrControl+Shift+L'
  const shortcutRegistered = globalShortcut.register(accelerator, () => {
    returnToPreviousApp = BrowserWindow.getFocusedWindow() === null
    const text = clipboard.readText().trim()
    captureIntent = { url: /^https?:\/\/\S+$/i.test(text) && text.length <= 500 ? text : '' }
    const window = getWindow()
    if (!window || window.isDestroyed()) {
      app.emit('activate')
      return
    }
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
    window.webContents.send('xnet:library:capture-ready')
  })
  app.once('will-quit', () => {
    if (shortcutRegistered) globalShortcut.unregister(accelerator)
  })
  ipcMain.handle('xnet:library:capture-intent', () => {
    const intent = captureIntent
    captureIntent = null
    return intent
  })
  ipcMain.handle('xnet:library:capture-shortcut', () => ({
    accelerator,
    registered: shortcutRegistered
  }))
  ipcMain.handle('xnet:library:capture-closed', (_event, restoreFocus = true) => {
    if (returnToPreviousApp && restoreFocus && process.platform === 'darwin') app.hide()
    returnToPreviousApp = false
  })
  ipcMain.handle('xnet:library:capture', (_event, payload: Record<string, unknown>) =>
    withWorkspaceWriteBarrier(async () => {
      const response = await sendDataProcessRequest('library:capture', { input: payload }, 120_000)
      return (response as { value: unknown }).value
    })
  )
  for (const action of [
    'status',
    'search',
    'get',
    'lookup',
    'scan',
    'pause',
    'resume',
    'retry',
    'helper-status',
    'helper-install',
    'helper-cancel'
  ]) {
    ipcMain.handle(
      `xnet:library:${action}`,
      async (_event, payload: Record<string, unknown> = {}) => {
        const response = await sendDataProcessRequest(`library:${action}`, payload, 10 * 60 * 1000)
        return (response as { value: unknown }).value
      }
    )
  }
}
