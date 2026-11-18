import type { BrowserWindow } from 'electron'

// Disposable preview and authentication windows must never receive workspace IPC.
const windows = new Set<BrowserWindow>()
export function registerWorkspaceWindow(window: BrowserWindow): void {
  windows.add(window)
  window.once('closed', () => windows.delete(window))
}
export function workspaceWindows(): BrowserWindow[] {
  return [...windows].filter((window) => !window.isDestroyed())
}
