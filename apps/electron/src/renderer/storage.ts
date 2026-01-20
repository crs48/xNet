/**
 * IPC Storage Adapter for Electron renderer
 * Proxies storage operations to the main process via IPC
 */
import type { StorageAdapter, DocumentData } from '@xnet/sdk'

export class IPCStorageAdapter implements StorageAdapter {
  private isOpen = false

  async open(): Promise<void> {
    // Main process handles actual storage initialization
    this.isOpen = true
  }

  async close(): Promise<void> {
    this.isOpen = false
  }

  async getDocument(id: string): Promise<DocumentData | null> {
    const data = await window.xnetStorage.getDocument(id)
    if (!data) return null

    // Convert array back to Uint8Array (IPC serializes Uint8Array as array)
    return {
      ...data,
      content: new Uint8Array(data.content)
    }
  }

  async setDocument(id: string, data: DocumentData): Promise<void> {
    return window.xnetStorage.setDocument(id, data)
  }

  async deleteDocument(id: string): Promise<void> {
    return window.xnetStorage.deleteDocument(id)
  }

  async listDocuments(prefix?: string): Promise<string[]> {
    return window.xnetStorage.listDocuments(prefix)
  }

  async getMetadata(id: string): Promise<DocumentData['metadata'] | null> {
    const doc = await this.getDocument(id)
    return doc?.metadata ?? null
  }
}

// Extend window type
declare global {
  interface Window {
    xnetStorage: {
      getDocument(id: string): Promise<DocumentData | null>
      setDocument(id: string, data: DocumentData): Promise<void>
      deleteDocument(id: string): Promise<void>
      listDocuments(prefix?: string): Promise<string[]>
    }
  }
}
