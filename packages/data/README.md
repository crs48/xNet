# @xnet/data

Yjs CRDT engine with signed updates.

## Installation

```bash
pnpm add @xnet/data
```

## Usage

```typescript
import { createDocument, loadDocument, getDocumentState } from '@xnet/data'

// Create document
const doc = createDocument({
  id: 'my-doc',
  workspace: 'default',
  type: 'page',
  title: 'My Page',
  createdBy: identity.did,
  signingKey: keyBundle.signingKey
})

// Edit content
doc.ydoc.getText('content').insert(0, 'Hello world')

// Get state for persistence
const state = getDocumentState(doc)

// Load from state
const loaded = loadDocument(id, workspace, type, state)
```

## Features

- Yjs for CRDT operations
- Signed updates
- Document types: page, task, database
