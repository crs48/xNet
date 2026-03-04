# 11: Platform - Expo (iOS)

> iOS mobile application using Expo

**Duration:** 2 weeks
**Dependencies:** @xnetjs/sdk

## Overview

The Expo app provides a native iOS experience with offline-first capabilities and P2P sync.

## App Setup

```bash
cd apps/expo
npx create-expo-app@latest --template blank-typescript
pnpm add @xnetjs/sdk@workspace:*
pnpm add expo-sqlite expo-secure-store expo-file-system
pnpm add react-native-get-random-values
```

## Directory Structure

```
apps/expo/
├── package.json
├── app.json
├── tsconfig.json
├── App.tsx
├── src/
│   ├── components/
│   │   ├── DocumentList.tsx
│   │   ├── Editor.tsx
│   │   └── SyncStatus.tsx
│   ├── hooks/
│   │   ├── useXNet.ts
│   │   └── useDocument.ts
│   ├── storage/
│   │   └── ExpoStorageAdapter.ts
│   ├── screens/
│   │   ├── HomeScreen.tsx
│   │   ├── DocumentScreen.tsx
│   │   └── SettingsScreen.tsx
│   └── navigation/
│       └── AppNavigator.tsx
├── assets/
│   ├── icon.png
│   └── splash.png
└── README.md
```

## Implementation

### Expo Storage Adapter (storage/ExpoStorageAdapter.ts)

```typescript
import * as SQLite from 'expo-sqlite'
import type { StorageAdapter, DocumentData } from '@xnetjs/storage'
import type { ContentId, Snapshot, SignedUpdate } from '@xnetjs/core'

export class ExpoStorageAdapter implements StorageAdapter {
  private db: SQLite.SQLiteDatabase | null = null
  private dbName: string

  constructor(dbName: string = 'xnet.db') {
    this.dbName = dbName
  }

  async open(): Promise<void> {
    this.db = await SQLite.openDatabaseAsync(this.dbName)

    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        content BLOB,
        metadata TEXT,
        version INTEGER
      );

      CREATE TABLE IF NOT EXISTS updates (
        doc_id TEXT,
        update_hash TEXT,
        update_data TEXT,
        PRIMARY KEY (doc_id, update_hash)
      );

      CREATE TABLE IF NOT EXISTS snapshots (
        doc_id TEXT PRIMARY KEY,
        snapshot_data TEXT
      );

      CREATE TABLE IF NOT EXISTS blobs (
        cid TEXT PRIMARY KEY,
        data BLOB
      );
    `)
  }

  async close(): Promise<void> {
    await this.db?.closeAsync()
    this.db = null
  }

  async clear(): Promise<void> {
    if (!this.db) throw new Error('Database not open')
    await this.db.execAsync(`
      DELETE FROM documents;
      DELETE FROM updates;
      DELETE FROM snapshots;
      DELETE FROM blobs;
    `)
  }

  async getDocument(id: string): Promise<DocumentData | null> {
    if (!this.db) throw new Error('Database not open')
    const result = await this.db.getFirstAsync<any>('SELECT * FROM documents WHERE id = ?', [id])
    if (!result) return null
    return {
      id: result.id,
      content: new Uint8Array(result.content),
      metadata: JSON.parse(result.metadata),
      version: result.version
    }
  }

  async setDocument(id: string, data: DocumentData): Promise<void> {
    if (!this.db) throw new Error('Database not open')
    await this.db.runAsync(
      `INSERT OR REPLACE INTO documents (id, content, metadata, version) VALUES (?, ?, ?, ?)`,
      [id, Array.from(data.content), JSON.stringify(data.metadata), data.version]
    )
  }

  async deleteDocument(id: string): Promise<void> {
    if (!this.db) throw new Error('Database not open')
    await this.db.runAsync('DELETE FROM documents WHERE id = ?', [id])
  }

  async listDocuments(prefix?: string): Promise<string[]> {
    if (!this.db) throw new Error('Database not open')
    const query = prefix
      ? await this.db.getAllAsync<{ id: string }>('SELECT id FROM documents WHERE id LIKE ?', [
          `${prefix}%`
        ])
      : await this.db.getAllAsync<{ id: string }>('SELECT id FROM documents')
    return query.map((r) => r.id)
  }

  async appendUpdate(docId: string, update: SignedUpdate): Promise<void> {
    if (!this.db) throw new Error('Database not open')
    await this.db.runAsync(
      'INSERT INTO updates (doc_id, update_hash, update_data) VALUES (?, ?, ?)',
      [docId, update.updateHash, JSON.stringify(update)]
    )
  }

  async getUpdates(docId: string): Promise<SignedUpdate[]> {
    if (!this.db) throw new Error('Database not open')
    const rows = await this.db.getAllAsync<{ update_data: string }>(
      'SELECT update_data FROM updates WHERE doc_id = ?',
      [docId]
    )
    return rows.map((r) => JSON.parse(r.update_data))
  }

  async getUpdateCount(docId: string): Promise<number> {
    if (!this.db) throw new Error('Database not open')
    const result = await this.db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM updates WHERE doc_id = ?',
      [docId]
    )
    return result?.count ?? 0
  }

  async getSnapshot(docId: string): Promise<Snapshot | null> {
    if (!this.db) throw new Error('Database not open')
    const result = await this.db.getFirstAsync<{ snapshot_data: string }>(
      'SELECT snapshot_data FROM snapshots WHERE doc_id = ?',
      [docId]
    )
    if (!result) return null
    return JSON.parse(result.snapshot_data)
  }

  async setSnapshot(docId: string, snapshot: Snapshot): Promise<void> {
    if (!this.db) throw new Error('Database not open')
    await this.db.runAsync(
      'INSERT OR REPLACE INTO snapshots (doc_id, snapshot_data) VALUES (?, ?)',
      [docId, JSON.stringify(snapshot)]
    )
  }

  async getBlob(cid: ContentId): Promise<Uint8Array | null> {
    if (!this.db) throw new Error('Database not open')
    const result = await this.db.getFirstAsync<{ data: number[] }>(
      'SELECT data FROM blobs WHERE cid = ?',
      [cid]
    )
    return result ? new Uint8Array(result.data) : null
  }

  async setBlob(cid: ContentId, data: Uint8Array): Promise<void> {
    if (!this.db) throw new Error('Database not open')
    await this.db.runAsync('INSERT OR REPLACE INTO blobs (cid, data) VALUES (?, ?)', [
      cid,
      Array.from(data)
    ])
  }

  async hasBlob(cid: ContentId): Promise<boolean> {
    if (!this.db) throw new Error('Database not open')
    const result = await this.db.getFirstAsync<{ exists: number }>(
      'SELECT 1 as exists FROM blobs WHERE cid = ?',
      [cid]
    )
    return !!result
  }
}
```

### XNet Hook (hooks/useXNet.ts)

```typescript
import { useState, useEffect, useCallback } from 'react'
import { createXNetClient, type XNetClient } from '@xnetjs/sdk'
import { ExpoStorageAdapter } from '../storage/ExpoStorageAdapter'
import 'react-native-get-random-values' // Polyfill for crypto

interface UseXNetResult {
  client: XNetClient | null
  isReady: boolean
  identity: string | null
  error: Error | null
}

let clientInstance: XNetClient | null = null

export function useXNet(): UseXNetResult {
  const [isReady, setIsReady] = useState(false)
  const [identity, setIdentity] = useState<string | null>(null)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    async function init() {
      try {
        if (!clientInstance) {
          const storage = new ExpoStorageAdapter('xnet.db')
          clientInstance = await createXNetClient({
            storage,
            enableNetwork: true
          })
          await clientInstance.start()
        }
        setIdentity(clientInstance.identity.did)
        setIsReady(true)
      } catch (e) {
        setError(e as Error)
      }
    }

    init()
  }, [])

  return {
    client: clientInstance,
    isReady,
    identity,
    error
  }
}
```

### Document Hook (hooks/useDocument.ts)

```typescript
import { useState, useEffect, useCallback } from 'react'
import { useXNet } from './useXNet'

interface UseDocumentResult {
  document: any | null
  loading: boolean
  error: Error | null
  updateTitle: (title: string) => Promise<void>
  refresh: () => Promise<void>
}

export function useDocument(docId: string | null): UseDocumentResult {
  const { client, isReady } = useXNet()
  const [document, setDocument] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const load = useCallback(async () => {
    if (!client || !docId || !isReady) return

    setLoading(true)
    try {
      const doc = await client.getDocument(docId)
      setDocument(doc)
    } catch (e) {
      setError(e as Error)
    } finally {
      setLoading(false)
    }
  }, [client, docId, isReady])

  useEffect(() => {
    load()
  }, [load])

  const updateTitle = useCallback(
    async (title: string) => {
      if (!document) return
      // Would update document
    },
    [document]
  )

  return {
    document,
    loading,
    error,
    updateTitle,
    refresh: load
  }
}
```

### Home Screen (screens/HomeScreen.tsx)

```tsx
import React, { useState, useEffect } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native'
import { useXNet } from '../hooks/useXNet'

interface Props {
  navigation: any
}

export function HomeScreen({ navigation }: Props) {
  const { client, isReady, identity } = useXNet()
  const [documents, setDocuments] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!client || !isReady) return

    async function load() {
      const docs = await client.listDocuments()
      setDocuments(docs)
      setLoading(false)
    }
    load()
  }, [client, isReady])

  const createDocument = async () => {
    if (!client) return
    const doc = await client.createDocument({
      workspace: 'default',
      type: 'page',
      title: 'New Page'
    })
    setDocuments([...documents, doc.id])
    navigation.navigate('Document', { docId: doc.id })
  }

  if (!isReady || loading) {
    return (
      <View style={styles.container}>
        <Text>Loading...</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>xNet</Text>
        <Text style={styles.identity}>{identity?.slice(0, 16)}...</Text>
      </View>

      <TouchableOpacity style={styles.createButton} onPress={createDocument}>
        <Text style={styles.createButtonText}>+ New Page</Text>
      </TouchableOpacity>

      <FlatList
        data={documents}
        keyExtractor={(item) => item}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.docItem}
            onPress={() => navigation.navigate('Document', { docId: item })}
          >
            <Text>{item}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>No documents yet</Text>}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 60
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee'
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold'
  },
  identity: {
    fontSize: 12,
    color: '#666',
    marginTop: 4
  },
  createButton: {
    margin: 16,
    padding: 12,
    backgroundColor: '#007AFF',
    borderRadius: 8,
    alignItems: 'center'
  },
  createButtonText: {
    color: '#fff',
    fontWeight: '600'
  },
  docItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee'
  },
  emptyText: {
    textAlign: 'center',
    color: '#666',
    marginTop: 32
  }
})
```

### App Entry (App.tsx)

```tsx
import React from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { HomeScreen } from './src/screens/HomeScreen'
import { DocumentScreen } from './src/screens/DocumentScreen'
import { SettingsScreen } from './src/screens/SettingsScreen'

const Stack = createNativeStackNavigator()

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Document" component={DocumentScreen} options={{ title: 'Document' }} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
      </Stack.Navigator>
    </NavigationContainer>
  )
}
```

### App Configuration (app.json)

```json
{
  "expo": {
    "name": "xNet",
    "slug": "xnet",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "automatic",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "io.xnet.xnet"
    },
    "plugins": ["expo-sqlite"]
  }
}
```

## Validation Checklist

- [ ] App builds for iOS
- [ ] App runs on iOS simulator
- [ ] Identity is created on first launch
- [ ] Documents can be created
- [ ] Documents persist across restarts
- [ ] SQLite storage works correctly
- [ ] Navigation works

## Next Step

Proceed to [12-platform-web.md](./12-platform-web.md)
