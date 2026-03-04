# 10: Platform - Electron (macOS)

> macOS desktop application using Electron

**Duration:** 2 weeks
**Dependencies:** @xnetjs/sdk

## Overview

The Electron app provides a native macOS experience with better performance and system integration than the web version.

## App Setup

```bash
cd apps/electron
pnpm create electron-vite
pnpm add @xnetjs/sdk@workspace:*
pnpm add better-sqlite3 electron-store
pnpm add -D electron electron-builder vite @vitejs/plugin-react
```

## Directory Structure

```
apps/electron/
├── package.json
├── electron.vite.config.ts
├── electron-builder.yml
├── src/
│   ├── main/
│   │   ├── index.ts          # Main process entry
│   │   ├── ipc.ts            # IPC handlers
│   │   ├── storage.ts        # SQLite storage adapter
│   │   ├── menu.ts           # App menu
│   │   └── updater.ts        # Auto-updater
│   ├── preload/
│   │   └── index.ts          # Preload script
│   └── renderer/
│       ├── index.html
│       ├── main.tsx          # React entry
│       ├── App.tsx
│       └── components/
├── resources/
│   └── icon.icns             # macOS icon
└── README.md
```

## Implementation

### Main Process (main/index.ts)

```typescript
import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { setupIPC } from './ipc'
import { createMenu } from './menu'
import { initAutoUpdater } from './updater'

let mainWindow: BrowserWindow | null = null

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Load the app
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  // Setup IPC handlers
  setupIPC()

  // Create menu
  createMenu()

  // Create window
  await createWindow()

  // Setup auto-updater (production only)
  if (process.env.NODE_ENV !== 'development') {
    initAutoUpdater()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
```

### IPC Handlers (main/ipc.ts)

```typescript
import { ipcMain } from 'electron'
import { createXNetClient, type XNetClient } from '@xnetjs/sdk'
import { SQLiteAdapter } from './storage'
import { app } from 'electron'
import { join } from 'path'

let client: XNetClient | null = null

export function setupIPC() {
  // Initialize client
  ipcMain.handle('xnet:init', async () => {
    if (client) return { did: client.identity.did }

    const dataPath = join(app.getPath('userData'), 'xnet-data')
    const storage = new SQLiteAdapter(join(dataPath, 'xnet.db'))

    client = await createXNetClient({
      storage,
      enableNetwork: true
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

  // Cleanup
  ipcMain.handle('xnet:stop', async () => {
    if (client) {
      await client.stop()
      client = null
    }
  })
}
```

### SQLite Storage Adapter (main/storage.ts)

```typescript
import Database from 'better-sqlite3'
import type { StorageAdapter, DocumentData } from '@xnetjs/storage'
import type { ContentId, Snapshot, SignedUpdate } from '@xnetjs/core'

export class SQLiteAdapter implements StorageAdapter {
  private db: Database.Database

  constructor(path: string) {
    this.db = new Database(path)
  }

  async open(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        content BLOB,
        metadata TEXT,
        version INTEGER
      );

      CREATE TABLE IF NOT EXISTS updates (
        doc_id TEXT,
        update_hash TEXT,
        update_data BLOB,
        PRIMARY KEY (doc_id, update_hash)
      );

      CREATE TABLE IF NOT EXISTS snapshots (
        doc_id TEXT PRIMARY KEY,
        snapshot_data BLOB
      );

      CREATE TABLE IF NOT EXISTS blobs (
        cid TEXT PRIMARY KEY,
        data BLOB
      );

      CREATE INDEX IF NOT EXISTS idx_updates_doc ON updates(doc_id);
    `)
  }

  async close(): Promise<void> {
    this.db.close()
  }

  async clear(): Promise<void> {
    this.db.exec(
      'DELETE FROM documents; DELETE FROM updates; DELETE FROM snapshots; DELETE FROM blobs;'
    )
  }

  async getDocument(id: string): Promise<DocumentData | null> {
    const row = this.db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as any
    if (!row) return null
    return {
      id: row.id,
      content: row.content,
      metadata: JSON.parse(row.metadata),
      version: row.version
    }
  }

  async setDocument(id: string, data: DocumentData): Promise<void> {
    this.db
      .prepare(
        `
      INSERT OR REPLACE INTO documents (id, content, metadata, version)
      VALUES (?, ?, ?, ?)
    `
      )
      .run(id, data.content, JSON.stringify(data.metadata), data.version)
  }

  async deleteDocument(id: string): Promise<void> {
    this.db.prepare('DELETE FROM documents WHERE id = ?').run(id)
  }

  async listDocuments(prefix?: string): Promise<string[]> {
    const query = prefix
      ? this.db.prepare('SELECT id FROM documents WHERE id LIKE ?').all(`${prefix}%`)
      : this.db.prepare('SELECT id FROM documents').all()
    return (query as { id: string }[]).map((r) => r.id)
  }

  async appendUpdate(docId: string, update: SignedUpdate): Promise<void> {
    this.db
      .prepare(
        `
      INSERT INTO updates (doc_id, update_hash, update_data)
      VALUES (?, ?, ?)
    `
      )
      .run(docId, update.updateHash, JSON.stringify(update))
  }

  async getUpdates(docId: string): Promise<SignedUpdate[]> {
    const rows = this.db
      .prepare('SELECT update_data FROM updates WHERE doc_id = ?')
      .all(docId) as any[]
    return rows.map((r) => JSON.parse(r.update_data))
  }

  async getUpdateCount(docId: string): Promise<number> {
    const row = this.db
      .prepare('SELECT COUNT(*) as count FROM updates WHERE doc_id = ?')
      .get(docId) as any
    return row.count
  }

  async getSnapshot(docId: string): Promise<Snapshot | null> {
    const row = this.db
      .prepare('SELECT snapshot_data FROM snapshots WHERE doc_id = ?')
      .get(docId) as any
    if (!row) return null
    return JSON.parse(row.snapshot_data)
  }

  async setSnapshot(docId: string, snapshot: Snapshot): Promise<void> {
    this.db
      .prepare(
        `
      INSERT OR REPLACE INTO snapshots (doc_id, snapshot_data)
      VALUES (?, ?)
    `
      )
      .run(docId, JSON.stringify(snapshot))
  }

  async getBlob(cid: ContentId): Promise<Uint8Array | null> {
    const row = this.db.prepare('SELECT data FROM blobs WHERE cid = ?').get(cid) as any
    return row?.data ?? null
  }

  async setBlob(cid: ContentId, data: Uint8Array): Promise<void> {
    this.db.prepare('INSERT OR REPLACE INTO blobs (cid, data) VALUES (?, ?)').run(cid, data)
  }

  async hasBlob(cid: ContentId): Promise<boolean> {
    const row = this.db.prepare('SELECT 1 FROM blobs WHERE cid = ?').get(cid)
    return !!row
  }
}
```

### Preload Script (preload/index.ts)

```typescript
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('xnet', {
  init: () => ipcRenderer.invoke('xnet:init'),
  createDocument: (options: any) => ipcRenderer.invoke('xnet:createDocument', options),
  getDocument: (id: string) => ipcRenderer.invoke('xnet:getDocument', id),
  listDocuments: (workspace?: string) => ipcRenderer.invoke('xnet:listDocuments', workspace),
  deleteDocument: (id: string) => ipcRenderer.invoke('xnet:deleteDocument', id),
  query: (query: any) => ipcRenderer.invoke('xnet:query', query),
  search: (text: string, limit?: number) => ipcRenderer.invoke('xnet:search', text, limit),
  stop: () => ipcRenderer.invoke('xnet:stop')
})

// Type declaration for renderer
declare global {
  interface Window {
    xnet: {
      init(): Promise<{ did: string }>
      createDocument(options: any): Promise<{ id: string; title: string }>
      getDocument(id: string): Promise<any | null>
      listDocuments(workspace?: string): Promise<string[]>
      deleteDocument(id: string): Promise<void>
      query(query: any): Promise<any>
      search(text: string, limit?: number): Promise<any[]>
      stop(): Promise<void>
    }
  }
}
```

### Renderer App (renderer/App.tsx)

```tsx
import React, { useEffect, useState } from 'react'

export function App() {
  const [identity, setIdentity] = useState<string | null>(null)
  const [documents, setDocuments] = useState<string[]>([])

  useEffect(() => {
    async function init() {
      const { did } = await window.xnet.init()
      setIdentity(did)
      const docs = await window.xnet.listDocuments()
      setDocuments(docs)
    }
    init()

    return () => {
      window.xnet.stop()
    }
  }, [])

  const createDoc = async () => {
    const doc = await window.xnet.createDocument({
      workspace: 'default',
      type: 'page',
      title: 'New Page'
    })
    setDocuments([...documents, doc.id])
  }

  return (
    <div className="app">
      <header className="titlebar">
        <h1>xNet</h1>
        <span className="identity">{identity?.slice(0, 20)}...</span>
      </header>
      <main>
        <aside className="sidebar">
          <button onClick={createDoc}>+ New Page</button>
          <ul>
            {documents.map((id) => (
              <li key={id}>{id}</li>
            ))}
          </ul>
        </aside>
        <section className="content">
          <p>Select a document to edit</p>
        </section>
      </main>
    </div>
  )
}
```

### Build Configuration (electron-builder.yml)

```yaml
appId: io.xnet.xnet
productName: xNet
directories:
  buildResources: resources
  output: dist
files:
  - '!**/.vscode/*'
  - '!src/*'
  - '!electron.vite.config.*'
mac:
  entitlementsInherit: build/entitlements.mac.plist
  extendInfo:
    NSMicrophoneUsageDescription: Please give us access
  target:
    - target: dmg
      arch:
        - x64
        - arm64
    - target: zip
      arch:
        - x64
        - arm64
dmg:
  artifactName: ${name}-${version}-${arch}.${ext}
```

## Validation Checklist

- [ ] App builds for macOS (Intel + Apple Silicon)
- [ ] App launches without errors
- [ ] Identity is created on first launch
- [ ] Documents can be created
- [ ] Documents persist across restarts
- [ ] SQLite storage works correctly

## Next Step

Proceed to [11-platform-expo.md](./11-platform-expo.md)
