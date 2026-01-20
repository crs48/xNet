# @xnet/storage

Storage adapters for different platforms.

## Installation

```bash
pnpm add @xnet/storage
```

## Usage

```typescript
import { IndexedDBAdapter, MemoryAdapter } from '@xnet/storage'

// Browser
const storage = new IndexedDBAdapter()
await storage.open()

// Testing
const memory = new MemoryAdapter()
await memory.open()

// Document operations
await storage.setDocument(id, data)
const doc = await storage.getDocument(id)
const ids = await storage.listDocuments()
```

## Adapters

- `IndexedDBAdapter` - Browser storage
- `MemoryAdapter` - In-memory (testing)
- SQLite adapters in platform apps
