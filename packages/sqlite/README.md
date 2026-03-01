# @xnet/sqlite

Unified SQLite adapter for xNet across all platforms (Electron, Web, Expo).

## Installation

```bash
pnpm add @xnet/sqlite
```

## Features

- **Unified interface** -- Same `SQLiteAdapter` API across all platforms
- **Platform adapters** -- better-sqlite3 (Electron), sqlite-wasm (Web), expo-sqlite (Expo)
- **Schema management** -- Version tracking and migrations
- **Full-text search** -- FTS5 integration helpers
- **Diagnostics** -- Query analysis and database stats

## Usage

### Memory Adapter (Testing)

```typescript
import { createMemorySQLiteAdapter } from '@xnet/sqlite/memory'

const db = await createMemorySQLiteAdapter()

// Query data
const rows = await db.query('SELECT * FROM nodes WHERE schema_id = ?', ['xnet://Page/1.0'])

// Insert data
await db.run('INSERT INTO nodes (id, schema_id, ...) VALUES (?, ?, ...)', [id, schemaId, ...])

// Transactions
await db.transaction(async () => {
  await db.run(...)
  await db.run(...)
})

await db.close()
```

### Electron (better-sqlite3)

```typescript
import { createElectronSQLiteAdapter } from '@xnet/sqlite/electron'

const db = await createElectronSQLiteAdapter({
  path: 'xnet.db',
  // Optional WAL mode (default: true)
  walMode: true
})
```

### Web (sqlite-wasm + OPFS)

```typescript
import { createWebSQLiteAdapter } from '@xnet/sqlite/web'

const db = await createWebSQLiteAdapter({
  path: 'xnet.db'
})
```

### Expo (expo-sqlite)

```typescript
import { createExpoSQLiteAdapter } from '@xnet/sqlite/expo'

const db = await createExpoSQLiteAdapter({
  path: 'xnet.db'
})
```

## API

### SQLiteAdapter Interface

```typescript
interface SQLiteAdapter {
  // Query execution
  query<T>(sql: string, params?: unknown[]): Promise<T[]>
  queryOne<T>(sql: string, params?: unknown[]): Promise<T | null>
  run(sql: string, params?: unknown[]): Promise<RunResult>
  exec(sql: string): Promise<void>

  // Transactions
  transaction<T>(fn: () => Promise<T>): Promise<T>
  beginTransaction(): Promise<void>
  commit(): Promise<void>
  rollback(): Promise<void>

  // Prepared statements
  prepare(sql: string): Promise<PreparedStatement>

  // Schema
  getSchemaVersion(): Promise<number>
  setSchemaVersion(version: number): Promise<void>
  applySchema(version: number, sql: string): Promise<boolean>

  // Lifecycle
  isOpen(): boolean
  close(): Promise<void>

  // Utilities
  getDatabaseSize(): Promise<number>
  vacuum(): Promise<void>
  checkpoint(): Promise<number>
}
```

### FTS5 Helpers

```typescript
import { updateNodeFTS, searchNodes, rebuildFTS } from '@xnet/sqlite'

// Update FTS index for a node
await updateNodeFTS(db, nodeId, title, content)

// Search nodes
const results = await searchNodes(db, 'search query', { limit: 10 })

// Rebuild entire FTS index
await rebuildFTS(db, (current, total) => {
  console.log(`Progress: ${current}/${total}`)
})
```

### Diagnostics

```typescript
import { getDatabaseStats, explainQuery, timeQuery } from '@xnet/sqlite'

// Get database statistics
const stats = await getDatabaseStats(db)
console.log(`Tables: ${stats.tableCount}, Size: ${stats.totalSizeBytes} bytes`)

// Analyze a query
const plan = await explainQuery(db, 'SELECT * FROM nodes WHERE schema_id = ?', ['xnet://Page/1.0'])
console.log(plan)

// Time a query
const { result, durationMs } = await timeQuery(db, async () => {
  return db.query('SELECT * FROM nodes')
})
console.log(`Query took ${durationMs}ms`)
```

## Schema

The package includes a unified schema (`SCHEMA_DDL`) with the following tables:

### Core Tables

- `nodes` - Entity registry
- `node_properties` - Property storage with LWW
- `changes` - Event log

### Yjs Tables

- `yjs_state` - Document state
- `yjs_updates` - Incremental updates
- `yjs_snapshots` - Time travel

### Storage Tables

- `blobs` - Content-addressed binary storage
- `documents` - Generic document storage
- `updates` - @xnet/storage compatibility
- `snapshots` - @xnet/storage compatibility

### Metadata Tables

- `_schema_version` - Schema tracking
- `sync_state` - Sync metadata

### FTS5 Virtual Table

- `nodes_fts` - Full-text search index

## Platform Support

| Platform | Adapter                 | SQLite Engine    | FTS5 |
| -------- | ----------------------- | ---------------- | ---- |
| Electron | `ElectronSQLiteAdapter` | better-sqlite3   | Yes  |
| Web      | `WebSQLiteAdapter`      | @sqlite.org/wasm | Yes  |
| Expo     | `ExpoSQLiteAdapter`     | expo-sqlite      | Yes  |
| Test     | `MemorySQLiteAdapter`   | sql.js           | No\* |

\* sql.js does not include FTS5 extension. FTS-related tests are skipped.

## Browser Support (Web)

The Web adapter requires:

- Cross-Origin-Opener-Policy: same-origin
- Cross-Origin-Embedder-Policy: require-corp
- Chrome 102+, Firefox 111+, Safari 16.4+, Edge 102+

```typescript
import { checkBrowserSupport } from '@xnet/sqlite'

const support = await checkBrowserSupport()
if (!support.supported) {
  console.warn('SQLite not supported:', support.reason)
}
```

## Testing

```bash
pnpm --filter @xnet/sqlite test
```

## Dependencies

- `sql.js` - WebAssembly SQLite (for memory adapter)
- `better-sqlite3` - Native SQLite for Node.js (Electron)
- `@sqlite.org/sqlite-wasm` - Official SQLite WASM (Web)
- `expo-sqlite` - Expo SQLite (React Native)
