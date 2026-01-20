# 14: Testing Strategy

> Fast unit tests for core, manual testing for UI

## Philosophy

1. **Fast unit tests** for all @xnet/* packages (>80% coverage)
2. **Integration tests** for cross-package functionality
3. **Manual testing** for UI - avoid expensive E2E tests
4. **Modularize** code to test functionality without UI

## Test Setup

### Vitest Configuration (root)

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/*/src/**/*.test.ts', 'packages/*/test/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'apps/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/*.test.ts',
        '**/index.ts'
      ],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80
      }
    },
    testTimeout: 10000,
    hookTimeout: 10000
  }
})
```

### Package Test Configuration

Each package can override:

```typescript
// packages/network/vitest.config.ts
import { defineConfig, mergeConfig } from 'vitest/config'
import rootConfig from '../../vitest.config'

export default mergeConfig(rootConfig, defineConfig({
  test: {
    environment: 'node',
    testTimeout: 30000, // Network tests need more time
  }
}))
```

## Test Categories

### 1. Unit Tests (Core Packages)

Test individual functions in isolation. These should be fast (<10ms each).

```typescript
// packages/crypto/src/hashing.test.ts
import { describe, it, expect, bench } from 'vitest'
import { hash, hashHex, verifyContent } from './hashing'

describe('hashing', () => {
  describe('hash()', () => {
    it('produces 32-byte output', () => {
      const result = hash(new Uint8Array([1, 2, 3]))
      expect(result.length).toBe(32)
    })

    it('is deterministic', () => {
      const data = new TextEncoder().encode('test')
      expect(hashHex(data)).toBe(hashHex(data))
    })

    it('produces different hashes for different inputs', () => {
      const a = hashHex(new TextEncoder().encode('a'))
      const b = hashHex(new TextEncoder().encode('b'))
      expect(a).not.toBe(b)
    })
  })

  describe('performance', () => {
    bench('hash 1KB', () => {
      hash(new Uint8Array(1024))
    })

    bench('hash 1MB', () => {
      hash(new Uint8Array(1024 * 1024))
    })
  })
})
```

### 2. Integration Tests (Cross-Package)

Test how packages work together.

```typescript
// packages/sdk/test/integration.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createXNetClient } from '../src/client'
import { MemoryAdapter } from '@xnet/storage'

describe('SDK Integration', () => {
  let client: Awaited<ReturnType<typeof createXNetClient>>

  beforeEach(async () => {
    client = await createXNetClient({
      storage: new MemoryAdapter(),
      enableNetwork: false
    })
  })

  afterEach(async () => {
    await client.stop()
  })

  it('creates document and persists', async () => {
    const doc = await client.createDocument({
      workspace: 'test',
      type: 'page',
      title: 'Integration Test'
    })

    const retrieved = await client.getDocument(doc.id)
    expect(retrieved?.metadata.title).toBe('Integration Test')
  })

  it('search finds created document', async () => {
    await client.createDocument({
      workspace: 'test',
      type: 'page',
      title: 'Searchable Document'
    })

    const results = await client.search('searchable')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].title).toContain('Searchable')
  })

  it('query filters correctly', async () => {
    await client.createDocument({ workspace: 'ws1', type: 'page', title: 'A' })
    await client.createDocument({ workspace: 'ws1', type: 'page', title: 'B' })
    await client.createDocument({ workspace: 'ws2', type: 'page', title: 'C' })

    const result = await client.query({
      type: 'page',
      filters: [{ field: 'workspace', operator: 'eq', value: 'ws1' }]
    })

    expect(result.items).toHaveLength(2)
  })
})
```

### 3. P2P Sync Tests

Test sync between simulated peers.

```typescript
// packages/network/test/sync.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createNode, createSyncProtocol } from '../src'
import { createDocument, getDocumentState } from '@xnet/data'
import { generateIdentity } from '@xnet/identity'

describe('P2P Sync', () => {
  let peer1: Awaited<ReturnType<typeof createNode>>
  let peer2: Awaited<ReturnType<typeof createNode>>

  beforeEach(async () => {
    const id1 = generateIdentity()
    const id2 = generateIdentity()

    peer1 = await createNode({
      did: id1.identity.did,
      privateKey: id1.privateKey,
      config: { bootstrapPeers: [], enableDHT: false, signalingServers: [], enableRelay: false }
    })

    peer2 = await createNode({
      did: id2.identity.did,
      privateKey: id2.privateKey,
      config: { bootstrapPeers: [], enableDHT: false, signalingServers: [], enableRelay: false }
    })
  })

  afterEach(async () => {
    // Cleanup
  })

  it('syncs document state between peers', async () => {
    // This test would require actual network connection
    // Simplified: test sync protocol message handling
    const syncProtocol = createSyncProtocol(peer1)

    const { identity, privateKey } = generateIdentity()
    const doc = createDocument({
      id: 'sync-test',
      workspace: 'test',
      type: 'page',
      title: 'Sync Test',
      createdBy: identity.did,
      signingKey: privateKey
    })

    syncProtocol.register(doc)
    // Would test actual sync
  })
})
```

### 4. Storage Tests

Test each storage adapter.

```typescript
// packages/storage/src/adapters/indexeddb.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { IndexedDBAdapter } from './indexeddb'

describe('IndexedDBAdapter', () => {
  let adapter: IndexedDBAdapter

  beforeEach(async () => {
    adapter = new IndexedDBAdapter()
    await adapter.open()
  })

  afterEach(async () => {
    await adapter.clear()
    await adapter.close()
  })

  // Run standard storage tests
  runStorageAdapterTests(() => adapter)
})

// Shared test suite for all adapters
function runStorageAdapterTests(getAdapter: () => StorageAdapter) {
  it('stores and retrieves document', async () => {
    const adapter = getAdapter()
    const doc = {
      id: 'test-1',
      content: new Uint8Array([1, 2, 3]),
      metadata: { created: Date.now(), updated: Date.now(), type: 'page' },
      version: 1
    }

    await adapter.setDocument('test-1', doc)
    const retrieved = await adapter.getDocument('test-1')

    expect(retrieved?.id).toBe('test-1')
  })

  it('lists documents with prefix', async () => {
    const adapter = getAdapter()
    await adapter.setDocument('ws1/doc1', createTestDoc('ws1/doc1'))
    await adapter.setDocument('ws1/doc2', createTestDoc('ws1/doc2'))
    await adapter.setDocument('ws2/doc1', createTestDoc('ws2/doc1'))

    const ws1Docs = await adapter.listDocuments('ws1/')
    expect(ws1Docs).toHaveLength(2)
  })

  it('deletes document', async () => {
    const adapter = getAdapter()
    await adapter.setDocument('to-delete', createTestDoc('to-delete'))
    await adapter.deleteDocument('to-delete')

    const result = await adapter.getDocument('to-delete')
    expect(result).toBeNull()
  })
}

function createTestDoc(id: string) {
  return {
    id,
    content: new Uint8Array(),
    metadata: { created: Date.now(), updated: Date.now(), type: 'page' },
    version: 1
  }
}
```

## Test Commands

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage

# Run specific package tests
pnpm --filter @xnet/crypto test

# Run tests matching pattern
pnpm test -- --grep "hashing"

# Run benchmarks
pnpm test -- --bench
```

## CI Pipeline

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v3
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install

      - name: Type check
        run: pnpm typecheck

      - name: Lint
        run: pnpm lint

      - name: Test with coverage
        run: pnpm test:coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          files: ./coverage/coverage-final.json
          fail_ci_if_error: false

  build:
    runs-on: ubuntu-latest
    needs: test
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install
      - run: pnpm build
```

## Manual Testing Checklist

For UI features, use this manual checklist:

### Editor
- [ ] Create new page, type text
- [ ] Bold/italic with keyboard shortcuts
- [ ] Create headings (H1, H2, H3)
- [ ] Create bullet list
- [ ] Create numbered list
- [ ] Create code block
- [ ] Undo/redo works

### Navigation
- [ ] Sidebar shows documents
- [ ] Clicking document opens it
- [ ] Back/forward buttons work
- [ ] Cmd+K opens search

### Sync
- [ ] Open same document in two browsers
- [ ] Type in one, changes appear in other
- [ ] Cursor positions sync
- [ ] Offline edits sync when reconnected

### Tasks
- [ ] Create task with checkbox
- [ ] Check/uncheck task
- [ ] Set due date
- [ ] Set priority

## Coverage Requirements

| Package | Statement | Branch | Function |
|---------|-----------|--------|----------|
| @xnet/core | 90% | 85% | 90% |
| @xnet/crypto | 95% | 90% | 95% |
| @xnet/identity | 85% | 80% | 85% |
| @xnet/storage | 80% | 75% | 80% |
| @xnet/data | 80% | 75% | 80% |
| @xnet/network | 70% | 65% | 70% |
| @xnet/query | 85% | 80% | 85% |
| @xnet/react | 75% | 70% | 75% |
| @xnet/sdk | 80% | 75% | 80% |

## Next Step

Proceed to [15-infrastructure.md](./15-infrastructure.md)
