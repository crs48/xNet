/**
 * IPC handlers for xNet operations
 */
import { ipcMain, app } from 'electron'
import { join } from 'path'
import { createXNetClient, type XNetClient } from '@xnet/sdk'
import { SQLiteAdapter } from './storage'
import { mkdirSync } from 'fs'

let client: XNetClient | null = null

export function setupIPC() {
  // Initialize client
  ipcMain.handle('xnet:init', async () => {
    if (client) return { did: client.identity.did }

    const dataPath = join(app.getPath('userData'), 'xnet-data')

    // Ensure data directory exists
    try {
      mkdirSync(dataPath, { recursive: true })
    } catch {
      // Directory may already exist
    }

    const storage = new SQLiteAdapter(join(dataPath, 'xnet.db'))

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
}
