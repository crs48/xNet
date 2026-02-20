/**
 * IPC wiring for Cloudflare tunnel lifecycle events.
 */

import { BrowserWindow, ipcMain } from 'electron'
import {
  getCloudflareTunnelManager,
  type TunnelStartOptions,
  type TunnelStatus
} from './cloudflare-tunnel-manager'

const TUNNEL_HEALTH_CHANNEL = 'xnet:tunnel:health'

export function setupCloudflareTunnelIPC(): () => void {
  const manager = getCloudflareTunnelManager()

  const unsubscribe = manager.onStatus((status) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      if (!window.isDestroyed()) {
        window.webContents.send(TUNNEL_HEALTH_CHANNEL, status)
      }
    })
  })

  ipcMain.handle('xnet:tunnel:start', async (_event, options?: TunnelStartOptions) => {
    return manager.start(options)
  })

  ipcMain.handle('xnet:tunnel:stop', async () => {
    return manager.stop()
  })

  ipcMain.handle('xnet:tunnel:status', async (): Promise<TunnelStatus> => {
    return manager.getStatus()
  })

  return () => {
    unsubscribe()
  }
}

export async function stopCloudflareTunnel(): Promise<void> {
  const manager = getCloudflareTunnelManager()
  await manager.stop()
}
