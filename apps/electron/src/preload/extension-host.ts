import type { ExtensionDesktopHost } from '../../../../packages/workbench/src/communities/extension-desktop-contract'
import { contextBridge, ipcRenderer } from 'electron'

export function exposeExtensionHost() {
  const host: ExtensionDesktopHost = {
    open: (input) => ipcRenderer.invoke('xnet:extension:open', input),
    send: (id, message) => ipcRenderer.send('xnet:extension:send', id, message),
    bounds: (id, bounds) => ipcRenderer.send('xnet:extension:bounds', id, bounds),
    close: (id) => ipcRenderer.send('xnet:extension:close', id),
    observe: (id) => ipcRenderer.invoke('xnet:extension:observe', id),
    act: (id, action) => ipcRenderer.invoke('xnet:extension:act', id, action),
    subscribe: (callback) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        event: { id: string; message: unknown }
      ) => callback(event)
      ipcRenderer.on('xnet:extension:event', listener)
      return () => ipcRenderer.removeListener('xnet:extension:event', listener)
    }
  }
  contextBridge.exposeInMainWorld('xnetExtensionHost', host)
}
