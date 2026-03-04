# 05: @xnetjs/data

> Yjs CRDT engine, signed updates, document management

**Duration:** 4 weeks
**Dependencies:** @xnetjs/crypto, @xnetjs/identity, @xnetjs/storage, @xnetjs/core

## Overview

This is the core data layer. Uses Yjs for CRDT operations and wraps it with signing and verification.

## Package Setup

```bash
cd packages/data
pnpm add yjs lib0
pnpm add -D vitest typescript tsup
pnpm add @xnetjs/crypto@workspace:* @xnetjs/identity@workspace:* @xnetjs/storage@workspace:* @xnetjs/core@workspace:*
```

## Directory Structure

```
packages/data/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Public exports
│   ├── types.ts              # Data types
│   ├── document.ts           # XDocument wrapper
│   ├── document.test.ts
│   ├── updates.ts            # Signed update handling
│   ├── updates.test.ts
│   ├── schemas/
│   │   ├── page.ts           # Page schema
│   │   ├── task.ts           # Task schema
│   │   └── database.ts       # Database schema
│   ├── blocks/
│   │   ├── registry.ts       # Block type registry
│   │   └── types.ts          # Block definitions
│   └── sync/
│       ├── awareness.ts      # Presence/cursor sync
│       └── provider.ts       # Sync provider interface
└── README.md
```

## Implementation

### Types (types.ts)

```typescript
import * as Y from 'yjs'
import type { SignedUpdate, VectorClock } from '@xnetjs/core'

export interface XDocument {
  id: string
  ydoc: Y.Doc
  workspace: string
  type: DocumentType
  metadata: DocumentMetadata
}

export type DocumentType = 'page' | 'task' | 'database' | 'canvas'

export interface DocumentMetadata {
  title: string
  icon?: string
  cover?: string
  created: number
  updated: number
  createdBy: string
  parent?: string
  archived: boolean
}

export interface Block {
  id: string
  type: BlockType
  parent: string
  content: Y.XmlFragment | Y.Map<unknown>
  children: string[]
  properties: Record<string, unknown>
}

export type BlockType =
  | 'paragraph'
  | 'heading'
  | 'list'
  | 'todo'
  | 'code'
  | 'quote'
  | 'divider'
  | 'image'
  | 'embed'
  | 'table'
  | 'callout'
  | 'toggle'

export interface UpdateBatch {
  docId: string
  updates: SignedUpdate[]
  vectorClock: VectorClock
}
```

### XDocument (document.ts)

```typescript
import * as Y from 'yjs'
import { sign, hashHex } from '@xnetjs/crypto'
import type { SignedUpdate, VectorClock } from '@xnetjs/core'
import type { XDocument, DocumentType, DocumentMetadata, Block, BlockType } from './types'

export interface CreateDocumentOptions {
  id: string
  workspace: string
  type: DocumentType
  title: string
  createdBy: string
  signingKey: Uint8Array
}

export function createDocument(options: CreateDocumentOptions): XDocument {
  const ydoc = new Y.Doc({ guid: options.id })

  // Initialize metadata
  const meta = ydoc.getMap('metadata')
  meta.set('title', options.title)
  meta.set('created', Date.now())
  meta.set('updated', Date.now())
  meta.set('createdBy', options.createdBy)
  meta.set('archived', false)

  // Initialize blocks array
  ydoc.getArray('blocks')

  // Initialize root block
  const blocks = ydoc.getMap('blockMap')
  const rootBlock: Block = {
    id: 'root',
    type: 'paragraph',
    parent: '',
    content: new Y.XmlFragment(),
    children: [],
    properties: {}
  }
  blocks.set('root', rootBlock)

  return {
    id: options.id,
    ydoc,
    workspace: options.workspace,
    type: options.type,
    metadata: {
      title: options.title,
      created: Date.now(),
      updated: Date.now(),
      createdBy: options.createdBy,
      archived: false
    }
  }
}

export function loadDocument(
  id: string,
  workspace: string,
  type: DocumentType,
  state: Uint8Array
): XDocument {
  const ydoc = new Y.Doc({ guid: id })
  Y.applyUpdate(ydoc, state)

  const meta = ydoc.getMap('metadata')

  return {
    id,
    ydoc,
    workspace,
    type,
    metadata: {
      title: (meta.get('title') as string) ?? 'Untitled',
      icon: meta.get('icon') as string | undefined,
      cover: meta.get('cover') as string | undefined,
      created: (meta.get('created') as number) ?? Date.now(),
      updated: (meta.get('updated') as number) ?? Date.now(),
      createdBy: (meta.get('createdBy') as string) ?? '',
      parent: meta.get('parent') as string | undefined,
      archived: (meta.get('archived') as boolean) ?? false
    }
  }
}

export function getDocumentState(doc: XDocument): Uint8Array {
  return Y.encodeStateAsUpdate(doc.ydoc)
}

export function getStateVector(doc: XDocument): Uint8Array {
  return Y.encodeStateVector(doc.ydoc)
}
```

### Update Handling (updates.ts)

```typescript
import * as Y from 'yjs'
import { sign, verify, hashHex } from '@xnetjs/crypto'
import { parseDID } from '@xnetjs/identity'
import type { SignedUpdate, VectorClock } from '@xnetjs/core'
import type { XDocument } from './types'

export interface SignUpdateOptions {
  doc: XDocument
  update: Uint8Array
  authorDID: string
  signingKey: Uint8Array
  parentHash: string
  vectorClock: VectorClock
}

export function signUpdate(options: SignUpdateOptions): SignedUpdate {
  const { update, authorDID, signingKey, parentHash, vectorClock } = options

  const updateHash = hashHex(update)
  const timestamp = Date.now()

  // Create signature over hash + parent + author + timestamp
  const signaturePayload = new TextEncoder().encode(
    JSON.stringify({ updateHash, parentHash, authorDID, timestamp })
  )
  const signature = sign(signaturePayload, signingKey)

  return {
    update,
    parentHash,
    updateHash,
    authorDID,
    signature,
    timestamp,
    vectorClock
  }
}

export function verifyUpdate(
  update: SignedUpdate,
  getPublicKey: (did: string) => Uint8Array | null
): boolean {
  const publicKey = getPublicKey(update.authorDID)
  if (!publicKey) return false

  // Verify hash matches
  const actualHash = hashHex(update.update)
  if (actualHash !== update.updateHash) return false

  // Verify signature
  const signaturePayload = new TextEncoder().encode(
    JSON.stringify({
      updateHash: update.updateHash,
      parentHash: update.parentHash,
      authorDID: update.authorDID,
      timestamp: update.timestamp
    })
  )

  return verify(signaturePayload, update.signature, publicKey)
}

export function applySignedUpdate(doc: XDocument, update: SignedUpdate): void {
  Y.applyUpdate(doc.ydoc, update.update)
  doc.metadata.updated = update.timestamp
}

export function captureUpdate(
  doc: XDocument,
  authorDID: string,
  signingKey: Uint8Array,
  parentHash: string,
  vectorClock: VectorClock,
  callback: () => void
): SignedUpdate | null {
  let capturedUpdate: Uint8Array | null = null

  const handler = (update: Uint8Array) => {
    capturedUpdate = update
  }

  doc.ydoc.on('update', handler)
  callback()
  doc.ydoc.off('update', handler)

  if (!capturedUpdate) return null

  return signUpdate({
    doc,
    update: capturedUpdate,
    authorDID,
    signingKey,
    parentHash,
    vectorClock
  })
}
```

### Tests (document.test.ts)

```typescript
import { describe, it, expect } from 'vitest'
import { createDocument, loadDocument, getDocumentState } from './document'
import { generateSigningKeyPair } from '@xnetjs/crypto'
import { generateIdentity } from '@xnetjs/identity'

describe('XDocument', () => {
  it('should create document with metadata', () => {
    const { identity, privateKey } = generateIdentity()
    const doc = createDocument({
      id: 'doc-1',
      workspace: 'ws-1',
      type: 'page',
      title: 'Test Page',
      createdBy: identity.did,
      signingKey: privateKey
    })

    expect(doc.id).toBe('doc-1')
    expect(doc.metadata.title).toBe('Test Page')
    expect(doc.type).toBe('page')
  })

  it('should round-trip document state', () => {
    const { identity, privateKey } = generateIdentity()
    const doc = createDocument({
      id: 'doc-1',
      workspace: 'ws-1',
      type: 'page',
      title: 'Test',
      createdBy: identity.did,
      signingKey: privateKey
    })

    const state = getDocumentState(doc)
    const loaded = loadDocument('doc-1', 'ws-1', 'page', state)

    expect(loaded.metadata.title).toBe('Test')
  })
})
```

### Tests (updates.test.ts)

```typescript
import { describe, it, expect } from 'vitest'
import { signUpdate, verifyUpdate, captureUpdate } from './updates'
import { createDocument } from './document'
import { generateIdentity, parseDID } from '@xnetjs/identity'
import * as Y from 'yjs'

describe('Signed Updates', () => {
  it('should sign and verify update', () => {
    const { identity, privateKey } = generateIdentity()

    const doc = createDocument({
      id: 'doc-1',
      workspace: 'ws-1',
      type: 'page',
      title: 'Test',
      createdBy: identity.did,
      signingKey: privateKey
    })

    const update = Y.encodeStateAsUpdate(doc.ydoc)
    const signed = signUpdate({
      doc,
      update,
      authorDID: identity.did,
      signingKey: privateKey,
      parentHash: 'genesis',
      vectorClock: { [identity.did]: 1 }
    })

    const valid = verifyUpdate(signed, (did) => {
      if (did === identity.did) return identity.publicKey
      return null
    })

    expect(valid).toBe(true)
  })

  it('should capture update during transaction', () => {
    const { identity, privateKey } = generateIdentity()

    const doc = createDocument({
      id: 'doc-1',
      workspace: 'ws-1',
      type: 'page',
      title: 'Test',
      createdBy: identity.did,
      signingKey: privateKey
    })

    const signed = captureUpdate(
      doc,
      identity.did,
      privateKey,
      'genesis',
      { [identity.did]: 1 },
      () => {
        const meta = doc.ydoc.getMap('metadata')
        meta.set('title', 'Updated Title')
      }
    )

    expect(signed).not.toBeNull()
    expect(signed?.authorDID).toBe(identity.did)
  })

  it('should reject tampered update', () => {
    const { identity, privateKey } = generateIdentity()

    const doc = createDocument({
      id: 'doc-1',
      workspace: 'ws-1',
      type: 'page',
      title: 'Test',
      createdBy: identity.did,
      signingKey: privateKey
    })

    const update = Y.encodeStateAsUpdate(doc.ydoc)
    const signed = signUpdate({
      doc,
      update,
      authorDID: identity.did,
      signingKey: privateKey,
      parentHash: 'genesis',
      vectorClock: {}
    })

    // Tamper with the update
    signed.update[0] = 0xff

    const valid = verifyUpdate(signed, (did) => {
      if (did === identity.did) return identity.publicKey
      return null
    })

    expect(valid).toBe(false)
  })
})
```

### Block Operations (blocks/registry.ts)

```typescript
import * as Y from 'yjs'
import type { Block, BlockType } from '../types'

export interface BlockDefinition {
  type: BlockType
  create: (id: string, parent: string) => Block
  validate: (block: Block) => boolean
}

const registry = new Map<BlockType, BlockDefinition>()

export function registerBlockType(definition: BlockDefinition): void {
  registry.set(definition.type, definition)
}

export function createBlock(type: BlockType, id: string, parent: string): Block {
  const definition = registry.get(type)
  if (!definition) {
    throw new Error(`Unknown block type: ${type}`)
  }
  return definition.create(id, parent)
}

// Register default block types
registerBlockType({
  type: 'paragraph',
  create: (id, parent) => ({
    id,
    type: 'paragraph',
    parent,
    content: new Y.XmlFragment(),
    children: [],
    properties: {}
  }),
  validate: () => true
})

registerBlockType({
  type: 'heading',
  create: (id, parent) => ({
    id,
    type: 'heading',
    parent,
    content: new Y.XmlFragment(),
    children: [],
    properties: { level: 1 }
  }),
  validate: (block) => {
    const level = block.properties.level as number
    return level >= 1 && level <= 6
  }
})

registerBlockType({
  type: 'todo',
  create: (id, parent) => ({
    id,
    type: 'todo',
    parent,
    content: new Y.XmlFragment(),
    children: [],
    properties: { checked: false }
  }),
  validate: () => true
})
```

### Awareness/Presence (sync/awareness.ts)

```typescript
import { Awareness } from 'y-protocols/awareness'
import type { XDocument } from '../types'

export interface UserPresence {
  did: string
  name: string
  color: string
  cursor?: CursorPosition
  selection?: SelectionRange
}

export interface CursorPosition {
  blockId: string
  offset: number
}

export interface SelectionRange {
  anchor: CursorPosition
  head: CursorPosition
}

export function createAwareness(doc: XDocument): Awareness {
  return new Awareness(doc.ydoc)
}

export function setLocalPresence(awareness: Awareness, presence: UserPresence): void {
  awareness.setLocalState(presence)
}

export function getRemotePresences(awareness: Awareness): Map<number, UserPresence> {
  const states = awareness.getStates()
  const result = new Map<number, UserPresence>()
  states.forEach((state, clientId) => {
    if (state && clientId !== awareness.clientID) {
      result.set(clientId, state as UserPresence)
    }
  })
  return result
}

export function onPresenceChange(
  awareness: Awareness,
  callback: (changes: { added: number[]; updated: number[]; removed: number[] }) => void
): () => void {
  awareness.on('change', callback)
  return () => awareness.off('change', callback)
}
```

### Public Exports (index.ts)

```typescript
// Types
export type {
  XDocument,
  DocumentType,
  DocumentMetadata,
  Block,
  BlockType,
  UpdateBatch
} from './types'

// Document operations
export {
  createDocument,
  loadDocument,
  getDocumentState,
  getStateVector,
  type CreateDocumentOptions
} from './document'

// Update handling
export {
  signUpdate,
  verifyUpdate,
  applySignedUpdate,
  captureUpdate,
  type SignUpdateOptions
} from './updates'

// Block registry
export { registerBlockType, createBlock, type BlockDefinition } from './blocks/registry'

// Awareness/presence
export {
  createAwareness,
  setLocalPresence,
  getRemotePresences,
  onPresenceChange,
  type UserPresence,
  type CursorPosition,
  type SelectionRange
} from './sync/awareness'

// Re-export Yjs for convenience
export { Doc as YDoc, Map as YMap, Array as YArray, Text as YText } from 'yjs'
```

## Validation Checklist

- [ ] Document creation works with all types
- [ ] State round-trips correctly
- [ ] Signed updates verify correctly
- [ ] Tampered updates are rejected
- [ ] Block registry works for all types
- [ ] Awareness/presence updates propagate
- [ ] All tests pass with >80% coverage

## Next Step

Proceed to [06-xnet-network.md](./06-xnet-network.md)
