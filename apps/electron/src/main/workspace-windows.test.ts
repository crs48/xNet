import type { BrowserWindow } from 'electron'
import { describe, expect, it } from 'vitest'
import { registerWorkspaceWindow, workspaceWindows } from './workspace-windows'

describe('workspace window registry', () => {
  it('excludes unregistered test windows and removes closed workspaces', () => {
    let closed = () => {}
    const workspace = {
      isDestroyed: () => false,
      once: (_event: string, callback: () => void) => {
        closed = callback
      }
    } as unknown as BrowserWindow
    const preview = { isDestroyed: () => false } as unknown as BrowserWindow
    registerWorkspaceWindow(workspace)
    expect(workspaceWindows()).toEqual([workspace])
    expect(workspaceWindows()).not.toContain(preview)
    closed()
    expect(workspaceWindows()).toEqual([])
  })
})
