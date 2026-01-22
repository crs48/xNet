/**
 * IPC handlers for xNet operations
 */
import { ipcMain } from 'electron'
import { join } from 'path'
import { createXNetClient, type XNetClient } from '@xnet/sdk'
import { SQLiteAdapter } from './storage'
import { mkdirSync } from 'fs'
import { dataPath, profile } from './index'

let client: XNetClient | null = null
let storage: SQLiteAdapter | null = null

export function setupIPC() {
  // Get profile name (for IndexedDB isolation in renderer)
  ipcMain.handle('xnet:getProfile', () => profile)

  // Initialize client
  ipcMain.handle('xnet:init', async () => {
    if (client) return { did: client.identity.did }

    // Ensure data directory exists
    try {
      mkdirSync(dataPath, { recursive: true })
    } catch {
      // Directory may already exist
    }

    storage = new SQLiteAdapter(join(dataPath, 'xnet.db'))

    client = await createXNetClient({
      storage,
      enableNetwork: false // Disabled for now until network is stable
    })

    await client.start()
    return { did: client.identity.did }
  })

  // Document operations
  ipcMain.handle('xnet:createDocument', async (_, options) => {
    if (!client) throw new Error('Client not initialized')
    const doc = await client.createDocument(options)
    return { id: doc.id, title: doc.metadata.title }
  })

  ipcMain.handle('xnet:getDocument', async (_, id) => {
    if (!client) throw new Error('Client not initialized')
    const doc = await client.getDocument(id)
    if (!doc) return null
    return {
      id: doc.id,
      type: doc.type,
      workspace: doc.workspace,
      title: doc.metadata.title,
      content: doc.ydoc.getText('content').toString()
    }
  })

  ipcMain.handle('xnet:listDocuments', async (_, workspace) => {
    if (!client) throw new Error('Client not initialized')
    return client.listDocuments(workspace)
  })

  ipcMain.handle('xnet:deleteDocument', async (_, id) => {
    if (!client) throw new Error('Client not initialized')
    await client.deleteDocument(id)
  })

  // Query operations
  ipcMain.handle('xnet:query', async (_, query) => {
    if (!client) throw new Error('Client not initialized')
    return client.query(query)
  })

  ipcMain.handle('xnet:search', async (_, text, limit) => {
    if (!client) throw new Error('Client not initialized')
    return client.search(text, limit)
  })

  // Sync status
  ipcMain.handle('xnet:getSyncStatus', async () => {
    if (!client) return { status: 'offline', peers: [] }
    return {
      status: client.syncStatus,
      peers: client.peers
    }
  })

  // Cleanup
  ipcMain.handle('xnet:stop', async () => {
    if (client) {
      await client.stop()
      client = null
    }
  })

  // Storage operations for renderer-side @xnet/react
  ipcMain.handle('xnet:storage:getDocument', async (_, id) => {
    if (!client) throw new Error('Client not initialized')
    // Access storage directly through the client
    // This returns the raw document data with Yjs state
    const doc = await client.getDocument(id)
    if (!doc) return null

    // Return document data in the format expected by StorageAdapter
    const state = await import('yjs').then((Y) => Y.encodeStateAsUpdate(doc.ydoc))
    return {
      id: doc.id,
      content: Array.from(state), // Convert Uint8Array to array for IPC
      metadata: {
        created: doc.metadata.created,
        updated: doc.metadata.updated,
        type: doc.type,
        workspace: doc.workspace
      },
      version: 1
    }
  })

  ipcMain.handle('xnet:storage:setDocument', async (_, id, data) => {
    if (!client || !storage) throw new Error('Client not initialized')

    // Get existing document to merge state
    const existingDoc = await client.getDocument(id)

    if (existingDoc && data.content && data.content.length > 0) {
      // Apply the update to the existing Y.Doc
      const Y = await import('yjs')
      const update = new Uint8Array(data.content)
      Y.applyUpdate(existingDoc.ydoc, update)

      // Get the merged state
      const mergedState = Y.encodeStateAsUpdate(existingDoc.ydoc)

      // Save via storage adapter
      const docData = {
        id,
        content: mergedState,
        metadata: {
          created: data.metadata?.created ?? Date.now(),
          updated: Date.now(),
          type: data.metadata?.type || 'page',
          workspace: data.metadata?.workspace || 'default'
        },
        version: data.version || 1
      }
      await storage.setDocument(id, docData)
    } else if (data.content && data.content.length > 0) {
      // Document doesn't exist in cache, save directly
      const docData = {
        id,
        content: new Uint8Array(data.content),
        metadata: {
          created: data.metadata?.created ?? Date.now(),
          updated: Date.now(),
          type: data.metadata?.type || 'page',
          workspace: data.metadata?.workspace || 'default'
        },
        version: data.version || 1
      }
      await storage.setDocument(id, docData)
    }
  })

  ipcMain.handle('xnet:storage:deleteDocument', async (_, id) => {
    if (!client) throw new Error('Client not initialized')
    await client.deleteDocument(id)
  })

  ipcMain.handle('xnet:storage:listDocuments', async (_, prefix) => {
    if (!client) throw new Error('Client not initialized')
    return client.listDocuments(prefix)
  })
}
