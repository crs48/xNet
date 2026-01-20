/**
 * Preload script - exposes xNet API to renderer
 */
import { contextBridge, ipcRenderer } from 'electron'

// Expose xNet API to renderer
contextBridge.exposeInMainWorld('xnet', {
  init: () => ipcRenderer.invoke('xnet:init'),
  createDocument: (options: {
    workspace: string
    type: string
    title: string
  }) => ipcRenderer.invoke('xnet:createDocument', options),
  getDocument: (id: string) => ipcRenderer.invoke('xnet:getDocument', id),
  listDocuments: (workspace?: string) => ipcRenderer.invoke('xnet:listDocuments', workspace),
  deleteDocument: (id: string) => ipcRenderer.invoke('xnet:deleteDocument', id),
  query: (query: unknown) => ipcRenderer.invoke('xnet:query', query),
  search: (text: string, limit?: number) => ipcRenderer.invoke('xnet:search', text, limit),
  getSyncStatus: () => ipcRenderer.invoke('xnet:getSyncStatus'),
  stop: () => ipcRenderer.invoke('xnet:stop'),

  // Menu events
  onNewPage: (callback: () => void) => {
    ipcRenderer.on('menu:new-page', callback)
    return () => ipcRenderer.removeListener('menu:new-page', callback)
  }
})

// Type declaration for renderer
export interface XNetAPI {
  init(): Promise<{ did: string }>
  createDocument(options: {
    workspace: string
    type: string
    title: string
  }): Promise<{ id: string; title: string }>
  getDocument(id: string): Promise<{
    id: string
    type: string
    workspace: string
    title: string
    content: string
  } | null>
  listDocuments(workspace?: string): Promise<string[]>
  deleteDocument(id: string): Promise<void>
  query(query: unknown): Promise<unknown>
  search(text: string, limit?: number): Promise<{ id: string; title: string; score: number }[]>
  getSyncStatus(): Promise<{ status: string; peers: string[] }>
  stop(): Promise<void>
  onNewPage(callback: () => void): () => void
}

declare global {
  interface Window {
    xnet: XNetAPI
  }
}
