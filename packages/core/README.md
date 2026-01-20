# @xnet/core

Core types, schemas, and content addressing utilities.

## Installation

```bash
pnpm add @xnet/core
```

## Usage

```typescript
import { createContentId, verifyContent, hashContent } from '@xnet/core'

// Hash content
const hash = hashContent(new Uint8Array([1, 2, 3]))

// Create content ID
const cid = createContentId(data)

// Verify content
const isValid = verifyContent(cid, data)
```

## Features

- BLAKE3 content hashing
- Content ID (CID) format: `cid:blake3:{hash}`
- Vector clocks for causality
- Signed update types
- Snapshot types
