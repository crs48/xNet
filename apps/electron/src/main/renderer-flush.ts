import { randomUUID } from 'node:crypto'
import { BrowserWindow, ipcMain } from 'electron'

const ready = new Set<number>()

export function setupRendererFlush(): void {
  ipcMain.on('xnet:flush-ready', (event) => {
    if (ready.has(event.sender.id)) return
    ready.add(event.sender.id)
    event.sender.once('destroyed', () => ready.delete(event.sender.id))
  })
}

/** Keep the renderer alive until it acknowledges all document writes. */
export async function flushRenderers(windows = BrowserWindow.getAllWindows()): Promise<void> {
  const results = await Promise.allSettled(
    windows.map(
      (window) =>
        new Promise<void>((resolve, reject) => {
          if (window.isDestroyed())
            return reject(new Error('A workspace window closed before saving.'))
          const requestId = randomUUID()
          const senderId = window.webContents.id
          const channel = `xnet:flush-result:${requestId}`
          const cleanup = () => {
            clearTimeout(timeout)
            ipcMain.removeListener(channel, listener)
          }
          const listener = (
            event: Electron.IpcMainEvent,
            result: { ok?: boolean; error?: string }
          ) => {
            if (event.sender.id !== senderId) return
            cleanup()
            if (result?.ok === true) resolve()
            else reject(new Error(result?.error || 'Document save failed.'))
          }
          const timeout = setTimeout(() => {
            cleanup()
            reject(new Error('The workspace did not finish saving. Please retry.'))
          }, 30_000)
          ipcMain.on(channel, listener)
          if (!ready.has(senderId)) {
            cleanup()
            reject(
              new Error('The workspace is still starting. Wait for it to open before closing.')
            )
            return
          }
          window.webContents.send('xnet:flush-documents', requestId)
        })
    )
  )
  const failed = results.find((result) => result.status === 'rejected')
  if (failed?.status === 'rejected') throw failed.reason
}

export function resumeRenderers(): void {
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send('xnet:resume-editing')
}
