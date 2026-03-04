# Off-Main-Thread Architecture: Moving Storage, Sync, Crypto, and Queries Off the UI Thread

> **Status**: ✅ IMPLEMENTED - The `@xnetjs/data-bridge` package provides off-main-thread architecture

## Implementation Status

The off-main-thread architecture has been implemented at `packages/data-bridge/`:

- [x] **DataBridge Interface** - `types.ts` with unified API for all platforms
- [x] **Main Thread Bridge** - `main-thread-bridge.ts` for direct access (fallback)
- [x] **Worker Bridge** - `worker-bridge.ts` for Web Worker communication
- [x] **Data Worker** - `worker/data-worker.ts` runs NodeStore off-thread
- [x] **Native Bridge** - `native-bridge.ts` for React Native JSI
- [x] **Query Cache** - `query-cache.ts` for efficient reactive updates
- [x] **Binary State** - `utils/binary-state.ts` for efficient Y.Doc transfer
- [x] **Create Bridge** - `create-bridge.ts` factory for platform detection

The architecture allows React hooks to work identically whether the backend runs on the main thread, in a Web Worker, or via Electron IPC.

---

> Can we move all heavy computation — storage, queries, sync, crypto, Yjs merging — off the main thread, hide the complexity behind React hooks, and make the UI permanently smooth? A deep exploration of multithreading strategies across Web, Electron, and Expo.

## Original Context

### The Problem

JavaScript is single-threaded. Every millisecond the main thread spends hashing, signing, querying, or merging Yjs documents is a millisecond the UI can't respond to user input. At 60fps, each frame has a 16.6ms budget. A single Ed25519 verify (~2ms) + BLAKE3 hash (~0.5ms) + Yjs merge (~1-5ms) on an incoming sync update eats 20-45% of a frame. When multiple updates arrive simultaneously — which is the normal case in collaborative editing — the main thread stalls, the cursor stutters, and the app feels broken.

This is not a theoretical problem. Here's what xNet does on the main thread today:

| Operation                           | Where                           | Cost       | Frequency                    |
| ----------------------------------- | ------------------------------- | ---------- | ---------------------------- |
| Ed25519 sign                        | Renderer (web), Main (Electron) | ~1-2ms     | Every outgoing Yjs update    |
| Ed25519 verify                      | Renderer (web), Main (Electron) | ~2-3ms     | Every incoming Yjs update    |
| BLAKE3 hash                         | Renderer (web), Main (Electron) | ~0.1-0.5ms | Every sign/verify/blob       |
| Y.applyUpdate                       | Renderer (web+Electron)         | ~1-50ms    | Every incoming update        |
| Y.encodeStateAsUpdate               | Renderer (web), Main (Electron) | ~1-50ms    | Every save, every sync       |
| NodeStore signChange                | Renderer (web+Electron)         | ~2-4ms     | Every create/update/delete   |
| IndexedDB listNodes                 | Renderer (web+Electron)         | ~1-100ms   | Every useQuery re-evaluation |
| JSON.stringify for where comparison | Renderer (web+Electron)         | ~0.1ms     | Every render cycle           |
| ELK.js graph layout                 | Renderer (web+Electron)         | ~10-500ms  | Every canvas re-layout       |
| Blob chunk + hash                   | Renderer (web), Main (Electron) | ~1-50ms    | Every file upload            |

### The Goal

**Move everything except React rendering off the main thread.** The main thread should do exactly two things: (1) render pixels, (2) handle user input. Everything else — storage, queries, sync, crypto, Yjs — runs elsewhere. React hooks should be the only API developers touch, and the hooks should look identical whether the backend is on the main thread, in a Web Worker, in an Electron main process, or in a native thread on mobile.

```
┌─────────────────────────────────────┐
│          Main Thread (UI)           │
│                                     │
│  React components                   │
│  useQuery() → data                  │
│  useMutate() → create/update        │
│  useNode() → Y.Doc binding          │
│  Event handlers                     │
│  Canvas rendering                   │
│                                     │
│  ← Only receives: data snapshots,   │
│     reactive updates, loading states│
│  → Only sends: mutations, queries   │
└──────────────┬──────────────────────┘
               │ postMessage / IPC / JSI
┌──────────────▼──────────────────────┐
│        Data Thread (Worker)         │
│                                     │
│  NodeStore + query engine           │
│  Y.Doc pool + merge engine          │
│  Ed25519 sign/verify                │
│  BLAKE3 hashing                     │
│  WebSocket sync                     │
│  IndexedDB / SQLite / OPFS          │
│  Search index (MiniSearch)          │
│  Blob chunking + hashing            │
│  ELK.js graph layout                │
└─────────────────────────────────────┘
```

### What This Exploration Covers

1. **Audit**: Where computation runs today, per platform
2. **Primitives**: Web Workers, SharedWorker, Comlink, Electron worker_threads/utility process, Expo JSI/worklets
3. **Prior Art**: How LiveStore, cr-sqlite, wa-sqlite, Electric SQL, Figma, Linear, and others solve this
4. **Architecture**: The "data thread" pattern — one worker that owns all state
5. **Communication**: Structured clone vs transferable vs SharedArrayBuffer vs Comlink proxies
6. **React Integration**: How hooks hide worker complexity with zero API change
7. **Platform-Specific Strategies**: Web, Electron, Expo — each has different optimal approaches
8. **Yjs Considerations**: Can Y.Doc live entirely off-thread? What about TipTap bindings?
9. **Cost/Benefit Analysis**: Is it worth the complexity? Where's the ROI highest?
10. **Migration Plan**: How to get there incrementally

## Part 1: Current Architecture Audit

### Web App (apps/web)

**Everything runs on the main thread.** No Web Workers at all.

```
Main Thread
├── React rendering
├── IndexedDB (NodeStore) — async but shares event loop
├── IndexedDB (BlobStore) — async but shares event loop
├── Y.Doc creation + merging — synchronous, CPU-bound
├── Ed25519 sign/verify (pure JS @noble/curves) — synchronous
├── BLAKE3 hashing (pure JS @noble/hashes) — synchronous
├── WebSocket sync (SyncManager) — async I/O, sync processing
├── MiniSearch (if used) — synchronous
├── TipTap editor — DOM mutations
└── Canvas + ELK.js layout — synchronous
```

**Pain points**: During collaborative editing with 3+ peers, incoming Yjs updates can stack up. Each requires verify (~2ms) + applyUpdate (~1-50ms) + possibly signChange for derived NodeStore changes. A burst of 10 updates = 30-500ms of main-thread blocking. The user sees the editor freeze.

### Electron App (apps/electron)

**Split across two processes, but poorly distributed:**

```
Main Process (Node.js)
├── better-sqlite3 storage — SYNCHRONOUS, blocks main process
├── Y.Doc pool (BSM) — CPU-bound merging on main process
├── Ed25519 sign/verify — per-update on main process
├── BLAKE3 hashing — per-update on main process
├── WebSocket connection (ws) — async I/O
├── IPC message handling
├── Window management (BrowserWindow)
└── Rate limiting, peer scoring

Renderer Process (Chromium)
├── React rendering
├── IndexedDB (NodeStore) — async
├── Y.Doc mirror — duplicated from main process
├── TipTap editor
├── Canvas + ELK.js
└── IPC communication
```

**Pain points**:

1. **Main process is overloaded**: SQLite (synchronous!), Yjs merging, and crypto ALL run on Electron's main process. This blocks window management — resizing, moving, menu clicks can stutter during heavy sync.
2. **Y.Doc is duplicated**: The BSM maintains the "source of truth" Y.Doc in main process, but the renderer needs its own copy for TipTap binding. Updates are serialized, sent via IPC (as `number[]` arrays — not even Transferable!), then deserialized and applied in the renderer. This is double work.
3. **Binary data crosses IPC as number arrays**: `Array.from(update)` for every Yjs update, every blob. This copies every byte individually instead of using Transferable ArrayBuffers.

### Expo / React Native (future)

Not yet built, but the constraints are known:

- No Web Workers (different threading model)
- JSI (JavaScript Interface) enables synchronous native calls from JS
- Worklets (react-native-reanimated) run JS on a separate thread
- Native modules (Turbo Modules) can run on any thread
- Hermes engine (or JSC) on the JS thread
- Native SQLite via `expo-sqlite` runs on a native thread with async bridge

## Part 2: Threading Primitives Per Platform

### Web: Web Workers

```typescript
// Dedicated Worker — one-to-one with a page
const worker = new Worker('data-worker.js')
worker.postMessage({ type: 'query', schema: 'Task', where: { status: 'done' } })
worker.onmessage = (e) => console.log(e.data) // result

// SharedWorker — shared across tabs
const shared = new SharedWorker('data-worker.js')
shared.port.postMessage({ type: 'query', ... })
shared.port.onmessage = (e) => console.log(e.data)
```

**Key characteristics**:

- Runs in a separate OS thread — truly parallel
- Communicates via `postMessage()` — structured clone (deep copy by default)
- Can use Transferable objects (ArrayBuffer, MessagePort, OffscreenCanvas) for zero-copy transfer
- Has access to: IndexedDB, fetch, WebSocket, crypto.subtle, OPFS
- Does NOT have access to: DOM, window, document, localStorage
- SharedWorker: shared across same-origin tabs — perfect for deduplicating sync connections

**What can live in a Web Worker**:
| Component | In Worker? | Notes |
|-----------|-----------|-------|
| NodeStore | Yes | IndexedDB is available in workers |
| Query engine | Yes | No DOM needed |
| Y.Doc pool | Yes | No DOM needed |
| Ed25519/BLAKE3 | Yes | Pure computation |
| WebSocket sync | Yes | WebSocket API available |
| MiniSearch | Yes | Pure computation |
| Blob chunking | Yes | File API available |
| ELK.js layout | Yes | Pure computation |
| TipTap | **No** | Needs DOM |
| React | **No** | Needs DOM |

### Web: Origin Private File System (OPFS)

OPFS is a high-performance file system accessible only from workers (for the synchronous API):

```typescript
// In a Worker — synchronous access (fast!)
const root = await navigator.storage.getDirectory()
const fileHandle = await root.getFileHandle('xnet.db', { create: true })
const accessHandle = await fileHandle.createSyncAccessHandle()

// Synchronous reads/writes — no event loop contention
accessHandle.write(data, { at: offset })
accessHandle.read(buffer, { at: offset })
accessHandle.flush()
accessHandle.close()
```

**Why OPFS matters**: SQLite WASM can use OPFS as its storage backend. Unlike IndexedDB (which has transaction overhead and limited concurrency), OPFS with `createSyncAccessHandle()` gives SQLite-WASM near-native file I/O performance — but **only from a Worker thread**. This is the key architectural insight: moving to SQLite-on-WASM-in-a-Worker gives us both off-main-thread execution AND better storage performance.

### Web: Comlink (Worker RPC)

Raw `postMessage` is painful. [Comlink](https://github.com/nicolo-ribaudo/nicolo-ribaudo) (by the Chrome team) wraps workers in a proxy that makes remote calls look like local async calls:

```typescript
// worker.ts
import { expose } from 'comlink'

const store = {
  async query(schemaId: string, where: Record<string, unknown>) {
    return db.listNodes({ schemaId }).filter(matchesWhere(where))
  },
  async mutate(change: NodeChange) {
    return db.applyChange(change)
  }
}
expose(store)

// main.ts
import { wrap } from 'comlink'

const store = wrap<typeof store>(new Worker('worker.ts'))
const tasks = await store.query('xnet://xnet.fyi/Task', { status: 'done' })
// Looks like a local call, but executes in the worker
```

**Comlink handles**: serialization, deserialization, error propagation, transferables, callbacks (via `proxy()`), and cleanup. The API surface is tiny (~1KB). This is the recommended approach for xNet — it turns the "data thread" into what feels like an async local API.

### Electron: Utility Process

Electron 22+ introduced `utilityProcess` — a lightweight Node.js process (lighter than `BrowserWindow`, heavier than `worker_threads`):

```typescript
// main.ts
import { utilityProcess } from 'electron'

const dataProcess = utilityProcess.fork('data-worker.js')
dataProcess.postMessage({ type: 'query', ... })
dataProcess.on('message', (msg) => { ... })

// data-worker.js (runs in its own V8 isolate)
process.parentPort.on('message', (msg) => {
  // Full Node.js API available: fs, crypto, better-sqlite3, etc.
  const result = db.query(msg.data)
  process.parentPort.postMessage(result)
})
```

**Why `utilityProcess` over `worker_threads`**:

- Has its own V8 isolate (crash isolation)
- Can be sandboxed
- Has `MessagePort` for fast binary transfer
- Does NOT block the main process
- Can use native modules (better-sqlite3) directly

This is the perfect home for the BSM + SQLite storage in Electron.

### Electron: worker_threads

Node.js worker threads share memory via `SharedArrayBuffer` and communicate via `MessagePort`:

```typescript
import { Worker, isMainThread, parentPort } from 'worker_threads'

if (isMainThread) {
  const worker = new Worker(__filename)
  worker.postMessage({ type: 'sign', data: updateBytes })
  worker.on('message', (signed) => {
    /* use signed result */
  })
} else {
  parentPort.on('message', (msg) => {
    const signed = ed25519.sign(msg.data, privateKey)
    parentPort.postMessage(signed, [signed.buffer]) // transfer
  })
}
```

**Best use case**: A lightweight crypto worker that handles Ed25519 sign/verify in a thread pool. The data process (utilityProcess) could spawn worker_threads internally for parallel crypto operations.

### Expo / React Native: JSI and Turbo Modules

React Native's JSI (JavaScript Interface) allows synchronous calls between JS and native code:

```cpp
// C++ JSI host function — callable from JS synchronously
runtime.global().setProperty(
  runtime, "signEd25519",
  jsi::Function::createFromHostFunction(
    runtime, jsi::PropNameID::forUtf8(runtime, "signEd25519"), 2,
    [](jsi::Runtime& rt, const jsi::Value& thisVal,
       const jsi::Value* args, size_t count) -> jsi::Value {
      // This runs on the JS thread but in native (fast)
      auto data = args[0].asObject(rt).getArrayBuffer(rt);
      auto signature = nativeSign(data.data(rt), data.size(rt));
      return jsi::ArrayBuffer(rt, signature);
    }
  )
);
```

**Turbo Modules** can run on any thread:

```kotlin
// Kotlin Turbo Module
@ReactModule(name = "DataWorker")
class DataWorkerModule : NativeTurboModule {
  @ReactMethod
  fun query(schemaId: String, where: ReadableMap, promise: Promise) {
    // Runs on a native thread — not the JS thread
    backgroundExecutor.execute {
      val result = sqliteDb.query(schemaId, where)
      promise.resolve(result)
    }
  }
}
```

**Worklets** (react-native-reanimated) run JS on a separate thread:

```typescript
import { runOnJS, runOnUI } from 'react-native-reanimated'

// This function runs on the UI thread (native)
const handleLayout = useAnimatedStyle(() => {
  'worklet'
  // Can't call JS APIs here, but can call native
  return { transform: [{ scale: scale.value }] }
})
```

**Expo SQLite**: `expo-sqlite` already runs SQLite on a native background thread with async bridge. Queries don't block the JS thread. This is the right pattern for Expo — no need for a JS worker, just a native module.

## Part 3: Prior Art — Who's Doing This Well?

### Figma: "The Data Thread"

Figma pioneered the "data thread" architecture for their web app. Key insights:

1. **One dedicated worker** owns all document state (their equivalent of Y.Doc + NodeStore)
2. **The main thread has no state** — it only has a render cache (like React's virtual DOM)
3. **Communication is via typed binary messages** — not JSON, but custom binary serialization
4. **Optimistic rendering**: The main thread renders immediately on user input, then corrects when the data thread confirms
5. **WASM in the worker**: The actual document engine is C++ compiled to WASM, running in the worker. This gives native-speed merging and diffing.
6. **Canvas rendering on main thread**: Like us, they render to `<canvas>` on the main thread, but all layout computation happens in the worker.

**Result**: Figma's editor stays smooth even with 100+ components and multiple collaborators. The data thread can spend 50ms merging without any visible frame drop.

### Linear: "Sync Engine in a Worker"

Linear moved their entire sync engine into a Web Worker:

1. **IndexedDB in the worker** — all storage queries run off-thread
2. **Worker maintains reactive subscriptions** — when data changes, it posts deltas to the main thread
3. **Main thread has an in-memory cache** — a denormalized, read-optimized mirror of worker state
4. **Communication is via structured clone** — simple objects, not binary (they found the overhead acceptable for their data sizes)
5. **Service Worker for offline** — separate from the data worker

**Result**: Linear's app feels instant even with 10,000+ issues because the main thread never touches IndexedDB.

### LiveStore (livestore.io)

LiveStore is a local-first reactive database built specifically for the "off-main-thread" pattern:

1. **SQLite WASM in a Worker** with OPFS backend
2. **Reactive queries via Web Worker messages** — query results are subscriptions
3. **Materializer in the worker** — event-sourced state materializes in the worker
4. **Main thread gets snapshots** — denormalized query results sent via postMessage
5. **Works with React, Solid, etc.** — framework-agnostic reactive bindings

LiveStore is the closest existing project to what we want. Key differences:

- LiveStore is SQLite-first (we're IndexedDB-first today, migrating to SQLite)
- LiveStore doesn't handle Yjs (we need collaborative rich text)
- LiveStore doesn't do crypto (we sign everything)

### cr-sqlite / wa-sqlite

**cr-sqlite**: SQLite compiled to WASM with CRDT extensions. Runs in a Worker with OPFS backend. Conflict resolution happens at the database level (CRDTs embedded in triggers). Sync is via simple row-level changes.

**wa-sqlite**: Low-level SQLite WASM build with multiple VFS backends (IndexedDB, OPFS, memory). Used by cr-sqlite and many others. The key architectural choice: **synchronous SQLite API in a Worker** (because OPFS SyncAccessHandle is synchronous).

### Electric SQL

Electric SQL syncs Postgres to SQLite in the browser:

1. **SQLite WASM in a SharedWorker** — shared across tabs
2. **Server-sent events for sync** — shape subscriptions from Postgres
3. **Reactive bindings** — `useLiveQuery()` hook that re-runs on changes
4. **Optimistic writes** — mutations apply locally, sync asynchronously

### Summary: Industry Convergence

Every serious local-first app converges on the same architecture:

```
Main Thread              Data Worker
┌──────────┐            ┌──────────────┐
│ React/UI │◄──deltas──►│ SQLite/OPFS  │
│          │◄──results──│ CRDT engine  │
│ In-memory│──mutations─►│ Crypto       │
│ cache    │            │ Sync engine  │
│          │            │ Query engine │
└──────────┘            └──────────────┘
```

The pattern is:

1. One "data thread" (Web Worker / utility process / native thread) owns all mutable state
2. Main thread has a read-only cache, updated via deltas from the data thread
3. Mutations flow from main → data thread as simple command messages
4. Query results flow from data thread → main as snapshots or deltas
5. The data thread handles sync, storage, and conflict resolution autonomously

## Part 4: The xNet Data Thread Architecture

### Design Principles

1. **The main thread never touches storage.** No IndexedDB, no SQLite, no file I/O. Storage lives in the data thread.
2. **The main thread never does crypto.** No Ed25519, no BLAKE3, no XChaCha20. Crypto lives in the data thread.
3. **The main thread never does Yjs merging.** No Y.applyUpdate, no Y.encodeStateAsUpdate. Yjs lives in the data thread — except for the Y.Doc that TipTap binds to (see Part 8).
4. **Communication is message-based.** No shared mutable state between threads. Messages are structured clones with Transferable ArrayBuffers where possible.
5. **The React API doesn't change.** Developers use `useQuery()`, `useMutate()`, `useNode()` exactly as today. The hooks abstract away whether the backend is local, in a worker, or native.
6. **Fail-safe degradation.** If Web Workers aren't available (very old browsers, some WebViews), the system falls back to main-thread execution transparently.

### Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                   MAIN THREAD (UI)                       │
│                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐     │
│  │ useQuery()  │  │ useMutate() │  │  useNode()   │     │
│  │             │  │             │  │              │     │
│  │ reads from  │  │ sends cmd   │  │ binds Y.Doc  │     │
│  │ local cache │  │ to worker   │  │ (see Part 8) │     │
│  └──────┬──────┘  └──────┬──────┘  └──────┬───────┘     │
│         │                │                │              │
│  ┌──────▼────────────────▼────────────────▼───────┐     │
│  │              DataBridge (Proxy)                 │     │
│  │                                                 │     │
│  │  - Manages worker lifecycle                     │     │
│  │  - Routes messages (query, mutate, subscribe)   │     │
│  │  - Maintains in-memory cache of active queries  │     │
│  │  - Applies deltas to cache on worker updates    │     │
│  │  - Triggers React re-renders via useSyncExternal│     │
│  └───────────────────┬────────────────────────────┘     │
│                      │ postMessage / IPC / JSI           │
└──────────────────────┼──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│                  DATA THREAD (Worker)                    │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │              DataWorker (exposed via Comlink)     │   │
│  │                                                    │   │
│  │  query(schema, options) → NodeState[]              │   │
│  │  mutate(schema, op, data) → NodeState              │   │
│  │  subscribe(queryId, schema, options) → void        │   │
│  │  unsubscribe(queryId) → void                       │   │
│  │  acquireDoc(nodeId) → { stateVector, update }      │   │
│  │  applyDocUpdate(nodeId, update) → void             │   │
│  │  releaseDoc(nodeId) → void                         │   │
│  └───────────┬──────────────────────┬─────────────────┘ │
│              │                      │                    │
│  ┌───────────▼──────┐  ┌───────────▼──────────────┐    │
│  │   NodeStore      │  │    SyncEngine            │    │
│  │   + QueryEngine  │  │                          │    │
│  │   + SearchIndex  │  │  Y.Doc pool              │    │
│  │                  │  │  WebSocket connection     │    │
│  │  Ed25519 sign    │  │  Ed25519 verify          │    │
│  │  BLAKE3 hash     │  │  BLAKE3 hash             │    │
│  │  Change log      │  │  Rate limiter            │    │
│  └───────┬──────────┘  │  Peer scorer             │    │
│          │              └───────────┬──────────────┘    │
│  ┌───────▼──────────────────────────▼──────────────┐    │
│  │            Storage Layer                         │    │
│  │                                                  │    │
│  │  Web: SQLite-WASM + OPFS (sync access)          │    │
│  │  Electron: better-sqlite3 (native)              │    │
│  │  Expo: expo-sqlite (native bridge)              │    │
│  │  Fallback: IndexedDB                            │    │
│  └──────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

### The DataBridge: Main-Thread Proxy

The DataBridge is the only object the main thread interacts with. It's a thin proxy that:

1. **Manages the worker lifecycle**: Creates the worker, handles errors, restarts on crash
2. **Routes commands**: Serializes query/mutate calls into worker messages
3. **Maintains a cache**: Keeps the latest snapshot of every active query's results in main-thread memory
4. **Applies deltas**: When the worker sends a change notification, updates the cache and triggers React re-renders
5. **Handles subscriptions**: Maps React component subscriptions to worker-side query subscriptions

```typescript
// ─── DataBridge API ──────────────────────────────────────

interface DataBridge {
  // Query (returns cached result immediately, subscribes for updates)
  query<P>(schema: DefinedSchema<P>, options?: QueryOptions<P>): QuerySubscription<P>

  // Mutation (fire-and-forget to worker, returns optimistic result)
  create<P>(schema: DefinedSchema<P>, data: CreateProps<P>): Promise<NodeState>
  update(nodeId: NodeId, changes: Record<string, unknown>): Promise<NodeState>
  delete(nodeId: NodeId): Promise<void>

  // Document (Y.Doc lifecycle)
  acquireDoc(nodeId: NodeId): Promise<AcquiredDoc>
  releaseDoc(nodeId: NodeId): void

  // Lifecycle
  initialize(config: DataBridgeConfig): Promise<void>
  destroy(): void
}

interface QuerySubscription<P> {
  // Current snapshot (always synchronous — reads from cache)
  getSnapshot(): NodeState[]

  // Subscribe to changes (called when worker sends delta)
  subscribe(callback: () => void): () => void
}
```

This maps directly to React's `useSyncExternalStore`:

```typescript
function useQuery<P>(schema: DefinedSchema<P>, options?: QueryOptions<P>) {
  const bridge = useDataBridge()
  const subscription = useMemo(
    () => bridge.query(schema, options),
    [bridge, schema.iri, stableHash(options)]
  )

  const data = useSyncExternalStore(
    subscription.subscribe,
    subscription.getSnapshot,
    subscription.getSnapshot // server snapshot (SSR)
  )

  return { data, loading: data === LOADING_SENTINEL }
}
```

**Key insight**: `useSyncExternalStore` is React's blessed API for external state. It handles concurrent mode, tearing prevention, and batching automatically. The hook looks identical to today's `useQuery` — the developer doesn't know or care that data comes from a worker.

### The DataWorker: Worker-Side Engine

```typescript
// data-worker.ts — runs in Web Worker / utility process / native thread

import { expose } from 'comlink'

class DataWorker {
  private store: NodeStore
  private syncEngine: SyncEngine
  private subscriptions: Map<string, QuerySubscription>

  async initialize(config: WorkerConfig): Promise<void> {
    const storage = await createStorageAdapter(config.platform)
    this.store = new NodeStore(storage, config.identity)
    this.syncEngine = new SyncEngine(this.store, config.signaling)

    // Listen for store changes and push deltas to subscribed queries
    this.store.subscribe((change) => {
      for (const [id, sub] of this.subscriptions) {
        if (sub.matchesChange(change)) {
          const delta = sub.computeDelta(change)
          // Send delta to main thread (via Comlink callback)
          sub.onDelta(delta)
        }
      }
    })
  }

  async query(schemaId: string, options: QueryOptions): Promise<NodeState[]> {
    return this.store.query(schemaId, options)
  }

  async subscribe(
    queryId: string,
    schemaId: string,
    options: QueryOptions,
    onDelta: (delta: QueryDelta) => void
  ): Promise<NodeState[]> {
    const initial = await this.store.query(schemaId, options)
    this.subscriptions.set(queryId, new QuerySubscription(schemaId, options, onDelta))
    return initial
  }

  async unsubscribe(queryId: string): Promise<void> {
    this.subscriptions.delete(queryId)
  }

  async create(schemaId: string, data: Record<string, unknown>): Promise<NodeState> {
    return this.store.create(schemaId, data)
  }

  async update(nodeId: string, changes: Record<string, unknown>): Promise<NodeState> {
    return this.store.update(nodeId, changes)
  }

  async delete(nodeId: string): Promise<void> {
    return this.store.delete(nodeId)
  }
}

expose(new DataWorker())
```

## Part 5: Communication Strategies

### The Cost of postMessage

Every `postMessage` call has overhead:

1. **Structured clone**: Deep copy of the message object. For a `NodeState[]` of 100 nodes, this is ~0.1-1ms.
2. **Serialization/deserialization**: V8 encodes objects into a binary format, transfers them, and decodes on the other side.
3. **Event loop scheduling**: The receiving thread must wait for its current microtask to complete before processing the message.

**Measured overhead** (approximations from Chrome on modern hardware):

| Message size | Structured clone cost | With Transferable |
| ------------ | --------------------- | ----------------- |
| 1 KB         | ~0.01ms               | ~0.001ms          |
| 10 KB        | ~0.05ms               | ~0.005ms          |
| 100 KB       | ~0.5ms                | ~0.05ms           |
| 1 MB         | ~5ms                  | ~0.1ms            |
| 10 MB        | ~50ms                 | ~0.5ms            |

For typical xNet query results (10-100 nodes, ~1-10KB each), structured clone adds ~0.05-0.5ms per message. This is negligible compared to the computation saved by running queries off-thread.

### Strategy 1: Snapshot Transfer (Simple)

The simplest approach: the worker sends full query result snapshots.

```
Main Thread                     Data Worker
    │                               │
    │──subscribe(taskQuery)────────►│
    │                               │
    │◄──snapshot([t1, t2, t3])──────│  Full result set
    │                               │
    │  (user creates task t4)       │
    │──create(Task, {...})─────────►│
    │                               │
    │◄──snapshot([t1, t2, t3, t4])──│  Full result set again
    │                               │
```

**Pros**: Dead simple. No diffing logic. Cache is just "latest snapshot."
**Cons**: Wasteful for large result sets where only one item changed.
**When to use**: Result sets < 100 items (covers 90% of xNet queries).

### Strategy 2: Delta Transfer (Efficient)

For larger result sets, send only what changed:

```typescript
type QueryDelta =
  | { type: 'reset'; data: NodeState[] } // Full replacement
  | { type: 'add'; node: NodeState; index: number } // Insert at position
  | { type: 'remove'; nodeId: NodeId } // Remove by ID
  | { type: 'update'; nodeId: NodeId; changes: Partial<NodeState> } // Patch
  | { type: 'move'; nodeId: NodeId; fromIndex: number; toIndex: number } // Reorder
```

```
Main Thread                     Data Worker
    │                               │
    │──subscribe(taskQuery)────────►│
    │                               │
    │◄──{ type: 'reset',           │
    │     data: [t1, t2, t3] }─────│
    │                               │
    │  (user creates task t4)       │
    │──create(Task, {...})─────────►│
    │                               │
    │◄──{ type: 'add',             │
    │     node: t4, index: 3 }─────│  Only the diff
    │                               │
```

**Pros**: Minimal data transfer. Enables React to optimize re-renders (only affected list items update).
**Cons**: Requires worker to maintain per-subscription state and compute deltas.
**When to use**: Result sets > 100 items, or when individual item updates are frequent.

### Strategy 3: Transferable ArrayBuffers for Binary Data

For Yjs updates, blobs, and large binary payloads, use Transferable objects:

```typescript
// Worker sending a Y.Doc update to main thread
const update = Y.encodeStateAsUpdate(doc) // Uint8Array
// Transfer the ArrayBuffer (zero-copy — ownership moves to main thread)
postMessage({ type: 'doc-update', nodeId, update }, [update.buffer])

// After transfer, the worker's `update` is detached (length 0)
// Main thread receives the original buffer — no copy
```

**Critical for xNet**: Today, Electron's IPC sync manager converts Yjs updates to `number[]` arrays: `Array.from(update)`. For a 100KB Yjs update, this creates 100,000 individual number values, each boxed as a JavaScript Number. Using Transferable ArrayBuffer reduces this from ~5ms to ~0.01ms.

### Strategy 4: SharedArrayBuffer (Future / Advanced)

`SharedArrayBuffer` + `Atomics` enables true shared memory between threads:

```typescript
// Shared ring buffer between main thread and worker
const sab = new SharedArrayBuffer(1024 * 1024) // 1MB shared memory
const view = new Int32Array(sab)

// Worker writes
Atomics.store(view, 0, newValue)
Atomics.notify(view, 0) // Wake main thread

// Main thread reads
Atomics.wait(view, 0, oldValue) // Sleep until notified
const value = Atomics.load(view, 0)
```

**Current limitations**:

- Requires `Cross-Origin-Isolation` headers (`COOP` + `COEP`) — breaks many third-party resources
- Not available in all contexts (some WebViews)
- Complex to use correctly (data races, memory ordering)
- TC39 "Shared Structs" proposal (Stage 2) would make this ergonomic — but years away

**Verdict**: Not recommended for xNet v1. The structured clone + Transferable approach is fast enough and much simpler. Revisit when Shared Structs proposal advances.

## Part 6: React Hooks — Hiding the Complexity

### The Developer-Facing API

**Before (today) and After (with data thread) — identical:**

```typescript
// ─── Querying ─────────────────────────────────────────────
const { data: tasks } = useQuery(TaskSchema)
const { data: task } = useQuery(TaskSchema, taskId)
const { data: urgent } = useQuery(TaskSchema, {
  where: { status: 'urgent' },
  orderBy: { createdAt: 'desc' },
  limit: 10
})

// ─── Mutating ─────────────────────────────────────────────
const { create, update, remove } = useMutate(TaskSchema)
await create({ title: 'New task', status: 'todo' })
await update(taskId, { status: 'done' })

// ─── Rich text editing ───────────────────────────────────
const { editor, loading } = useNode(nodeId)
// editor is a TipTap Editor instance — works exactly as before
```

**Zero API changes.** The hooks internally switch from direct store access to DataBridge access, but the return types and behavior are identical.

### How useQuery Changes Internally

**Today** (packages/react/src/hooks/useQuery.ts):

```typescript
// Simplified — current implementation
function useQuery(schema, filterOrId) {
  const store = useNodeStore()
  const [data, setData] = useState([])

  useEffect(() => {
    // Loads ALL nodes from IndexedDB, filters in JS, sorts in JS
    store.list({ schemaId: schema.iri }).then((nodes) => {
      const filtered = filterNodes(nodes, filter.where)
      const sorted = sortNodes(filtered, filter.orderBy)
      setData(sorted)
    })

    // Subscribes to ALL store changes, re-filters on every change
    return store.subscribe((change) => {
      // Re-load, re-filter, re-sort... on every change
    })
  }, [schema, filter])

  return { data }
}
```

**After** (with DataBridge):

```typescript
function useQuery(schema, filterOrId) {
  const bridge = useDataBridge()

  // Create a stable subscription object
  const sub = useMemo(
    () => bridge.query(schema, normalizeOptions(filterOrId)),
    [bridge, schema.iri, stableHash(filterOrId)]
  )

  // useSyncExternalStore: React's blessed way to read external state
  const data = useSyncExternalStore(
    sub.subscribe, // How to subscribe to changes
    sub.getSnapshot, // How to get current value (synchronous!)
    sub.getSnapshot // Server snapshot for SSR
  )

  return { data, loading: data === null }
}
```

**What changes**:

1. No more `useState` + `useEffect` — uses `useSyncExternalStore` (concurrent-safe)
2. No more main-thread filtering/sorting — the worker does it
3. No more subscribing to ALL store changes — the worker filters subscription deltas
4. `getSnapshot()` is synchronous — reads from the in-memory cache, never blocks

### How useMutate Changes Internally

```typescript
function useMutate(schema) {
  const bridge = useDataBridge()

  const create = useCallback(
    async (data) => {
      // Optimistic: immediately add to relevant query caches
      const optimisticNode = bridge.optimisticCreate(schema, data)

      // Send to worker (async — worker does signing, storage, sync)
      try {
        const confirmedNode = await bridge.create(schema, data)
        bridge.confirmOptimistic(optimisticNode.id, confirmedNode)
      } catch (err) {
        bridge.rollbackOptimistic(optimisticNode.id)
        throw err
      }

      return optimisticNode
    },
    [bridge, schema]
  )

  return { create, update, remove }
}
```

**Key difference**: Optimistic updates. Because the worker takes 2-5ms to sign and store, the main thread can't wait. Instead, we:

1. Immediately create a "tentative" node in the cache
2. Send the mutation to the worker
3. When the worker confirms, replace the tentative with the real node
4. If the worker rejects (validation error), remove the tentative

This is the standard optimistic update pattern used by React Query, Apollo Client, and Convex.

### How useNode Changes (The Hard Part)

TipTap requires a `Y.Doc` in the same thread as the DOM. We can't put the Y.Doc entirely in the worker. This is the one exception to "everything off-thread." See Part 8 for the full analysis.

## Part 7: Platform-Specific Strategies

### Web: Dedicated Worker + OPFS + SQLite-WASM

```
┌─────────────────┐         ┌──────────────────────────┐
│   Main Thread   │         │    Data Worker            │
│                 │         │                          │
│   React app     │ Comlink │   SQLite-WASM + OPFS     │
│   DataBridge    │◄───────►│   NodeStore              │
│   Query cache   │         │   SyncEngine (WebSocket) │
│   TipTap+Y.Doc  │         │   Y.Doc pool             │
│                 │         │   Crypto (sign/verify)   │
│                 │         │   MiniSearch             │
└─────────────────┘         └──────────────────────────┘
```

**Migration path**:

1. **Phase 1**: Move NodeStore + query engine to worker (keep IndexedDB)
2. **Phase 2**: Add SQLite-WASM + OPFS in the worker (replace IndexedDB)
3. **Phase 3**: Move SyncEngine to worker (WebSocket in worker)
4. **Phase 4**: Move crypto to worker (already there if NodeStore is there)

**SharedWorker variant**: For multi-tab support, use SharedWorker so all tabs share one sync connection and one database:

```
Tab 1 Main Thread ──┐
Tab 2 Main Thread ──┼──► SharedWorker (DataWorker)
Tab 3 Main Thread ──┘         │
                              ├── SQLite-WASM + OPFS
                              ├── Single WebSocket
                              └── Single Y.Doc pool
```

SharedWorker eliminates tab conflicts on IndexedDB/OPFS and deduplicates the WebSocket connection. The tradeoff: SharedWorker has weaker browser support (no Safari until 18.4, released 2025) and more complex lifecycle management.

### Electron: Utility Process

```
┌──────────────────┐      ┌──────────────────────────────┐
│  Renderer Process│      │  Utility Process (Data)      │
│                  │      │                              │
│  React app       │ IPC  │  better-sqlite3              │
│  DataBridge      │◄────►│  NodeStore                   │
│  Query cache     │      │  SyncEngine (ws WebSocket)   │
│  TipTap + Y.Doc  │      │  Y.Doc pool                  │
│                  │      │  Crypto (sign/verify)        │
│                  │      │  ELK.js layout               │
└──────────────────┘      └──────────────────────────────┘

┌──────────────────┐
│  Main Process    │  ← Now lightweight: just window management
│                  │
│  BrowserWindow   │
│  Menus, dialogs  │
│  Auto-updater    │
│  Tray            │
└──────────────────┘
```

**This is a massive improvement over today** where the main process does SQLite + Yjs + crypto + sync AND window management. Moving data to a utility process means:

1. Window operations (resize, move, menu) never stutter
2. Heavy sync bursts don't affect window responsiveness
3. The renderer is also free — query results come via IPC from the utility process
4. If the data process crashes, the UI stays alive and can restart it

**IPC optimization**: Electron's `MessagePort` supports Transferable ArrayBuffers between processes. Use this for Yjs updates and blobs — zero-copy transfer instead of today's `Array.from(update)`.

```typescript
// Renderer → Utility Process via MessagePort (zero-copy)
const { port1, port2 } = new MessageChannel()
utilityProcess.postMessage({ type: 'init-channel' }, [port2])

// Send Yjs update — transfer ownership of the buffer
const update = Y.encodeStateAsUpdate(doc)
port1.postMessage({ type: 'doc-update', nodeId }, [update.buffer])
```

### Expo / React Native: Native Data Module

```
┌──────────────────┐      ┌──────────────────────────────┐
│  JS Thread       │      │  Native Thread(s)            │
│                  │      │                              │
│  React Native    │ JSI  │  expo-sqlite (SQLite)        │
│  DataBridge      │◄────►│  NodeStore (Kotlin/Swift)    │
│  Query cache     │      │  SyncEngine (native WS)      │
│  TipTap (?)      │ Turbo│  Crypto (native Ed25519)     │
│                  │Module │  Y.Doc (y-crdt Rust/WASM)   │
└──────────────────┘      └──────────────────────────────┘
```

**Expo's advantage**: Native modules inherently run on background threads. `expo-sqlite` already does this — queries return via async bridge without blocking the JS thread. The question is whether to:

**Option A**: Keep NodeStore in JS, use `expo-sqlite` as storage adapter

- Simpler: reuse existing TypeScript NodeStore
- But: JS-side sign/verify/hash still blocks JS thread

**Option B**: Move NodeStore to native (Kotlin/Swift)

- Complex: rewrite store logic in native
- But: everything truly off the JS thread

**Option C (Recommended)**: Keep NodeStore in JS, but offload crypto to native via JSI

- `expo-crypto` for Ed25519 — hardware-accelerated
- `expo-sqlite` for storage — native thread
- NodeStore orchestrates in JS but the heavy ops (crypto, storage) are native
- Yjs can use `y-crdt` (Rust compiled to native) for fast merging

## Part 8: The Y.Doc Problem — TipTap Needs the DOM Thread

### Why Y.Doc Can't Fully Live in the Worker

TipTap (our rich text editor) is built on ProseMirror, which requires a Y.Doc bound to its document model via `y-prosemirror`. This binding:

1. Observes Y.Doc changes and maps them to ProseMirror transactions
2. Observes ProseMirror transactions and maps them to Y.Doc operations
3. Must run synchronously with DOM updates (ProseMirror dispatches are synchronous)

If Y.Doc is in a worker, every keystroke would require:

```
Keystroke → ProseMirror transaction → postMessage to worker →
worker applies to Y.Doc → postMessage back → ProseMirror update → DOM
```

This round-trip (~2-5ms) would make typing feel laggy. ProseMirror expects synchronous document updates.

### Solution: Split Y.Doc Ownership

```
Main Thread                          Data Worker
┌────────────────────────┐          ┌────────────────────────┐
│  TipTap + ProseMirror  │          │  Y.Doc pool (inactive) │
│  ↕ (y-prosemirror)     │          │                        │
│  Y.Doc (active editing)│──update──►  Y.Doc (same nodeId)   │
│                        │◄─remote──│                        │
│  Only for currently    │  updates │  Stores to SQLite      │
│  edited document(s)    │          │  Signs updates         │
│                        │          │  Handles sync protocol │
│                        │          │  Verifies remote       │
└────────────────────────┘          └────────────────────────┘
```

**How it works**:

1. **When a document is opened for editing**: The main thread creates a Y.Doc. The worker sends the current state (via Transferable) to initialize it. The main thread binds this Y.Doc to TipTap.

2. **Local edits**: User types → ProseMirror → y-prosemirror → Y.Doc update (synchronous, on main thread). The update bytes are Transferred to the worker for signing, storage, and sync broadcast.

3. **Remote edits**: Worker receives remote update → verifies signature → applies to worker's Y.Doc → Transfers the update bytes to main thread → main thread applies to its Y.Doc → ProseMirror updates → DOM updates.

4. **When document is closed**: Main thread destroys its Y.Doc. Worker retains its copy for background sync.

**This is close to what Electron does today** (BSM has Y.Doc in main process, renderer has a mirror). The difference:

- Today: Both copies are in CPU-expensive processes (main + renderer)
- After: The main thread's Y.Doc only exists for actively-edited documents. The worker has all documents (for sync) and does all signing/verification.

### Crypto on Y.Doc Updates: Worker-Side Only

Currently, every outgoing Yjs update is signed on the main thread (web) or main process (Electron). Moving signing to the worker:

```
Main Thread                          Data Worker
    │                                    │
    │  User types "hello"                │
    │  Y.Doc produces update (32 bytes)  │
    │                                    │
    │──Transfer(update)─────────────────►│
    │  (zero-copy, ~0.01ms)              │
    │                                    │  Worker signs:
    │                                    │  BLAKE3(update) ~0.1ms
    │                                    │  Ed25519.sign() ~1.5ms
    │                                    │  Store to SQLite ~0.5ms
    │                                    │  WebSocket.send() ~0.1ms
    │                                    │
    │  Main thread is FREE during        │  Total: ~2.2ms
    │  all of this. No jank.             │  (but off-thread!)
    │                                    │
```

**Result**: The 2.2ms signing cost no longer affects frame budget. The main thread spent ~0.01ms on the Transfer.

## Part 9: Cost/Benefit Analysis

### What We Gain

**1. Permanently smooth UI (60fps guarantee)**

Every frame has 16.6ms. Today's main-thread budget:

| Operation       | Current cost | After (main thread) |
| --------------- | ------------ | ------------------- |
| React render    | 2-8ms        | 2-8ms (same)        |
| Ed25519 verify  | 2-3ms        | 0ms (worker)        |
| BLAKE3 hash     | 0.1-0.5ms    | 0ms (worker)        |
| Y.applyUpdate   | 1-50ms       | 0ms (worker)        |
| IndexedDB query | 1-100ms      | 0ms (worker)        |
| ELK.js layout   | 10-500ms     | 0ms (worker)        |
| **Total**       | **16-660ms** | **2-8ms**           |

With the data thread, the main thread only does React rendering. Even complex renders stay under 16.6ms.

**2. Better perceived latency for mutations**

With optimistic updates, mutations feel instant (<16ms) even though the actual storage/signing takes 2-5ms in the worker. Today, `await store.create(...)` blocks the UI for that full duration.

**3. Unblocked Electron main process**

Window resize, menu clicks, and app focus all go through Electron's main process. Today, a SQLite write or Yjs merge on the main process blocks all of these. Moving data to a utility process eliminates this entirely.

**4. Multi-tab deduplication (SharedWorker)**

With a SharedWorker on web:

- One WebSocket connection instead of N (one per tab)
- One database instance instead of N
- One sync engine instead of N
- Changes in one tab instantly appear in all others (no IndexedDB polling)

**5. Crash isolation**

If the data worker crashes (e.g., WASM OOM), the UI stays alive. The DataBridge can detect the crash, show a "reconnecting" toast, and restart the worker. Today, a crash in NodeStore brings down the entire page.

### What It Costs

**1. Implementation complexity**

Estimated effort:
| Component | Effort | Complexity |
|-----------|--------|------------|
| DataBridge (main thread proxy) | 2 weeks | Medium |
| DataWorker (worker entry point) | 1 week | Low |
| Comlink integration | 1 week | Low |
| Move NodeStore to worker | 1 week | Low (already async) |
| Move SyncEngine to worker | 2 weeks | Medium |
| Y.Doc split architecture | 3 weeks | High |
| Electron utility process migration | 2 weeks | Medium |
| Expo native module bridge | 3 weeks | High |
| Testing + debugging infrastructure | 2 weeks | Medium |
| **Total** | **~17 weeks** | |

This is significant. But it's also foundational — once built, every future feature benefits.

**2. Debugging complexity**

Worker code doesn't appear in the same DevTools context. Console logs, breakpoints, and stack traces cross thread boundaries. Mitigations:

- Comlink preserves stack traces across threads
- Chrome DevTools has Worker debugging (separate tab)
- Structured logging with `xnet:data-worker:debug` flag
- Our devtools panel can show worker state via messages

**3. Structured clone overhead**

Every query result crosses the thread boundary via structured clone. For typical xNet workloads (10-100 nodes per query), this adds ~0.05-0.5ms per update. Negligible compared to the computation saved. For large result sets (1000+ nodes), use delta transfer to minimize the cost.

**4. Latency for first query result**

The first query after page load requires a round-trip to the worker: main → worker → storage → worker → main. This adds ~1-5ms of latency compared to direct storage access. Mitigated by:

- Pre-warming the worker on page load
- Showing loading states (skeleton UI) during initialization
- Caching the last known state in localStorage for instant first paint

### Is It Worth It?

**Yes, unambiguously, for Electron.** The main process is already overloaded. Moving data to a utility process is a straightforward win with moderate effort. The alternative — continuing to block window management with SQLite and Yjs — is a UX dead end.

**Yes, for Web, but prioritize after Electron.** The web app currently works for small datasets. As datasets grow and multi-user collaboration intensifies, the main-thread-blocking will become unacceptable. The Web Worker migration is the right long-term architecture, but the Electron utility process migration should come first (more users, more pain).

**For Expo, native modules already solve this.** `expo-sqlite` runs on a native thread. The main work is building the DataBridge abstraction so the React hooks work identically. Offloading crypto to native JSI modules is also straightforward.

**The key insight**: The DataBridge abstraction is platform-agnostic. Build it once, and the platform-specific backend (Worker / utility process / native module) is swappable. The React hooks never change.

## Part 10: Migration Plan

### Phase 0: DataBridge Abstraction (2 weeks)

Create the `DataBridge` interface and implement a **main-thread backend** that delegates directly to NodeStore. This changes zero behavior but introduces the abstraction layer that all future phases plug into.

```typescript
// Phase 0: DataBridge with main-thread backend (no worker yet)
class MainThreadDataBridge implements DataBridge {
  private store: NodeStore

  async query(schema, options) {
    // Same as today — direct store access
    return this.store.list({ schemaId: schema.iri })
  }
}
```

All React hooks (`useQuery`, `useMutate`) switch from direct store access to DataBridge. Tests pass. Behavior is identical.

### Phase 1: Electron Utility Process (3 weeks)

Move BSM + SQLite storage from main process to utility process. The renderer's DataBridge talks to the utility process via IPC + MessagePort.

```
Before: Renderer ──IPC──► Main Process (SQLite + BSM + Yjs + Crypto)
After:  Renderer ──IPC──► Utility Process (SQLite + BSM + Yjs + Crypto)
        Main Process = just window management
```

**Why Electron first**: Most users are on Electron. Main process blocking is the most visible problem. Utility process is well-supported and well-documented.

### Phase 2: Web Worker (3 weeks)

Create the `WorkerDataBridge` implementation. Move NodeStore + SyncEngine to a Dedicated Worker. Use Comlink for RPC.

```typescript
// Phase 2: DataBridge with Web Worker backend
class WorkerDataBridge implements DataBridge {
  private worker: Remote<DataWorker>

  constructor() {
    this.worker = wrap<DataWorker>(new Worker('data-worker.js'))
  }

  async query(schema, options) {
    return this.worker.query(schema.iri, options)
  }
}
```

### Phase 3: Y.Doc Split (3 weeks)

Implement the split Y.Doc architecture from Part 8. Main thread owns the editing Y.Doc, worker owns the sync/storage Y.Doc. Updates flow via Transferable ArrayBuffers.

### Phase 4: SQLite-WASM + OPFS (2 weeks)

Replace IndexedDB with SQLite-WASM in the worker, using OPFS for storage. This is independent of the worker migration — it's a storage backend swap within the worker.

### Phase 5: SharedWorker for Multi-Tab (2 weeks)

Upgrade from Dedicated Worker to SharedWorker for multi-tab deduplication. Requires lifecycle management (last tab closes → worker dies) and tab-to-tab subscription routing.

### Phase 6: Expo Native Bridge (3 weeks)

Implement `NativeDataBridge` using Turbo Modules. The DataBridge interface is the same; the backend talks to `expo-sqlite` and native crypto instead of a Web Worker.

## Part 11: The SharedWorker Multi-Tab Strategy

### Why SharedWorker

Without SharedWorker, each tab creates its own worker:

```
Tab 1: Worker → WebSocket → Server
Tab 2: Worker → WebSocket → Server
Tab 3: Worker → WebSocket → Server
3 copies of: SQLite/IndexedDB, Y.Doc pool, search index, sync engine
```

With SharedWorker:

```
Tab 1 ──┐
Tab 2 ──┼──► SharedWorker → WebSocket → Server
Tab 3 ──┘
1 copy of: SQLite/IndexedDB, Y.Doc pool, search index, sync engine
```

**Benefits**:

- 1 WebSocket instead of N
- 1 database lock instead of N competing
- Changes in one tab instantly visible in all others
- Lower memory usage (one search index, one Y.Doc pool)

### Browser Support

| Browser        | SharedWorker | Notes                             |
| -------------- | ------------ | --------------------------------- |
| Chrome         | Yes          | Since Chrome 4                    |
| Firefox        | Yes          | Since Firefox 29                  |
| Edge           | Yes          | Since Edge 79                     |
| Safari         | Yes          | Since Safari 18.4 (2025) — recent |
| Safari iOS     | **No**       | Not supported                     |
| Chrome Android | **No**       | Not supported                     |

**Strategy**: Use SharedWorker when available, fall back to Dedicated Worker. The DataBridge abstraction handles this transparently:

```typescript
function createDataBridge(config: DataBridgeConfig): DataBridge {
  if (typeof SharedWorker !== 'undefined' && config.preferShared) {
    return new SharedWorkerDataBridge(config)
  }
  if (typeof Worker !== 'undefined') {
    return new DedicatedWorkerDataBridge(config)
  }
  // Fallback: main-thread (no worker support)
  return new MainThreadDataBridge(config)
}
```

## Part 12: Deep Dive — Worker-Compatible Storage

### IndexedDB in Workers

IndexedDB is available in Web Workers with the same API as the main thread. This is the simplest migration — move the existing `IndexedDBNodeStorageAdapter` to the worker, no code changes needed.

**Limitation**: IndexedDB transactions are asynchronous and have per-transaction overhead (~0.5-2ms per transaction). For write-heavy workloads (bulk sync), this is slow. Each `appendChange` + `setNode` is currently a separate transaction.

**Quick win**: Batch writes into single transactions:

```typescript
// Before (2 transactions per mutation)
await storage.appendChange(change)
await storage.setNode(node)

// After (1 transaction for both)
const tx = db.transaction(['changes', 'nodes'], 'readwrite')
tx.objectStore('changes').add(change)
tx.objectStore('nodes').put(node)
await tx.done
```

### SQLite-WASM + OPFS in Workers

The gold standard for web storage performance:

```typescript
// In the Data Worker
import sqlite3InitModule from '@sqlite.org/sqlite-wasm'

const sqlite3 = await sqlite3InitModule()
const db = new sqlite3.oo1.OpfsDb('/xnet.db') // OPFS backend

db.exec(`
  CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY,
    schema_id TEXT NOT NULL,
    properties TEXT NOT NULL, -- JSON
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted INTEGER DEFAULT 0
  )
`)

// Synchronous queries in the worker — fast!
const results = db.exec({
  sql: 'SELECT * FROM nodes WHERE schema_id = ? AND deleted = 0 ORDER BY created_at DESC LIMIT ?',
  bind: [schemaId, limit],
  returnValue: 'resultRows',
  rowMode: 'object'
})
```

**Performance comparison** (approximate, for 10,000 nodes):

| Operation          | IndexedDB        | SQLite-WASM + OPFS |
| ------------------ | ---------------- | ------------------ |
| Full scan          | ~50ms            | ~5ms               |
| Indexed lookup     | ~2ms             | ~0.2ms             |
| Insert             | ~2ms             | ~0.1ms             |
| Batch insert (100) | ~100ms           | ~2ms               |
| Count              | ~50ms (scan)     | ~0.5ms (COUNT)     |
| Full-text search   | N/A (MiniSearch) | ~1ms (FTS5)        |

SQLite-WASM + OPFS is ~10x faster for reads and ~10-50x faster for batch writes. The synchronous API (available only in workers with OPFS `SyncAccessHandle`) eliminates the transaction overhead that plagues IndexedDB.

### wa-sqlite as Alternative

[wa-sqlite](https://nicolo-ribaudo.github.io/nicolo-ribaudo) is another SQLite WASM build with more VFS options:

- **OPFS SyncAccessHandle VFS**: Same approach as @sqlite.org/sqlite-wasm
- **OPFS Access Handle Pool VFS**: Pre-allocates file handles for lower latency
- **IndexedDB VFS**: Uses IndexedDB as SQLite's storage — slower than OPFS but works on main thread

For xNet, the official `@sqlite.org/sqlite-wasm` is preferred (maintained by the SQLite team), but wa-sqlite is a viable alternative if we need custom VFS behavior.

## Part 13: Advanced — Crypto Acceleration

### Current: Pure JavaScript (@noble/\*)

All crypto operations use `@noble/hashes` (BLAKE3) and `@noble/curves` (Ed25519). These are well-audited, constant-time pure JavaScript implementations. Performance:

| Operation      | @noble (pure JS) | WebCrypto API    | WASM (e.g., libsodium) |
| -------------- | ---------------- | ---------------- | ---------------------- |
| Ed25519 sign   | ~1.5ms           | N/A (no Ed25519) | ~0.1ms                 |
| Ed25519 verify | ~2.5ms           | N/A (no Ed25519) | ~0.2ms                 |
| BLAKE3 (1KB)   | ~0.1ms           | N/A (no BLAKE3)  | ~0.01ms                |
| SHA-256 (1KB)  | ~0.05ms          | ~0.01ms          | ~0.01ms                |

### Option: WASM Crypto in the Worker

Since crypto now runs in the worker (not the main thread), we can use WASM implementations without worrying about main-thread impact:

```typescript
// In the Data Worker — WASM crypto
import { sign, verify } from '@aspect-build/aspect-libsodium-wasm'

// 10-15x faster than @noble
const signature = sign(message, privateKey) // ~0.1ms vs ~1.5ms
const valid = verify(message, signature, publicKey) // ~0.2ms vs ~2.5ms
```

**Available WASM crypto libraries**:

- `libsodium-wasm`: Full libsodium (Ed25519, BLAKE2b, XChaCha20, Argon2). ~200KB WASM.
- `@aspect-build/aspect-libsodium-wasm`: Smaller build with just signing.
- `tweetnacl-wasm`: Minimal signing-only build. ~50KB.
- Custom BLAKE3 WASM: Compile the reference BLAKE3 Rust implementation to WASM.

**Recommendation**: Keep `@noble/*` for now (it's audited, well-tested, and the overhead is zero since it runs off-thread). If crypto becomes a bottleneck even in the worker (e.g., verifying 100 updates/second during bulk sync), switch to WASM. The worker architecture makes this swap invisible to the rest of the system.

## Part 14: Advanced — ELK.js Layout Off-Thread

ELK.js (Eclipse Layout Kernel) is used for the canvas graph layout. It's CPU-intensive (10-500ms) and currently runs on the main thread, freezing the UI during re-layout.

Moving ELK.js to the data worker is straightforward — it's pure computation with no DOM dependencies:

```typescript
// In the Data Worker
import ELK from 'elkjs'

const elk = new ELK()

async function computeLayout(graph: ElkNode): Promise<ElkNode> {
  return elk.layout(graph)
}
```

The main thread sends the graph structure to the worker, the worker computes the layout, and sends back positioned nodes. The canvas renders a loading/placeholder state during computation and animates nodes to their final positions when the layout arrives.

**Progressive layout**: For large graphs, the worker can send partial layouts as they're computed:

```
Worker → Main: { phase: 'rough', positions: [...] }  // ~50ms
Worker → Main: { phase: 'refined', positions: [...] } // ~200ms
Worker → Main: { phase: 'final', positions: [...] }   // ~500ms
```

The canvas renders each phase, so the user sees the graph "settling" rather than staring at a blank canvas for 500ms.

## Part 15: Testing Strategy

### Unit Testing Workers

Workers can be tested without a browser using `vitest` with the `web-worker` environment:

```typescript
// vitest.config.ts
export default {
  test: {
    environment: 'happy-dom' // or 'jsdom'
    // Mock Worker constructor
  }
}
```

For the DataBridge, test the main-thread backend first (Phase 0). This validates all logic without worker complexity. Then integration-test the worker backend using Playwright or real browser tests.

### Integration Testing the DataBridge

```typescript
describe('DataBridge', () => {
  // Test with main-thread backend (fast, no worker overhead)
  describe('MainThreadDataBridge', () => {
    it('should query nodes', async () => {
      const bridge = new MainThreadDataBridge(memoryStore)
      const result = await bridge.query(TaskSchema, { where: { status: 'done' } })
      expect(result).toHaveLength(3)
    })
  })

  // Test with worker backend (requires browser environment)
  describe('WorkerDataBridge', () => {
    it('should query nodes identically', async () => {
      const bridge = new WorkerDataBridge(workerUrl)
      const result = await bridge.query(TaskSchema, { where: { status: 'done' } })
      expect(result).toHaveLength(3) // Same result as main-thread
    })
  })
})
```

### Debugging Worker State

Add a debug mode that exposes worker state via DevTools:

```typescript
// data-worker.ts
if (globalThis.__XNET_DEBUG__) {
  // Expose store state for DevTools
  globalThis.__store = store
  globalThis.__syncEngine = syncEngine
}
```

Our existing devtools panel (7 panels) can communicate with the worker via its own MessagePort to display NodeStore state, sync status, and query performance metrics.

## Part 16: Future — TC39 Shared Structs

The TC39 "JavaScript Structs" proposal (Stage 2 as of December 2024) introduces:

1. **Structs**: Fixed-layout objects (sealed, no prototype pollution)
2. **Shared Structs**: Fixed-layout objects shareable across agents (threads) without copying
3. **SharedArray**: Arrays shareable across agents
4. **Mutex / Condition**: High-level synchronization primitives

```javascript
// Proposal syntax (future)
shared struct NodeState {
  id = '';
  schemaId = '';
  createdAt = 0;
  updatedAt = 0;
  deleted = false;
  // properties would need to be a SharedArray or nested shared struct
}

// Both threads can read/write the same object — no postMessage needed
const node = new NodeState()
node.id = 'abc-123'
// Accessible from both main thread and worker simultaneously
```

**Impact on xNet**: If Shared Structs land (optimistically 2027-2028), the entire DataBridge communication layer could be replaced with shared memory. Query results would be shared struct arrays that both threads access directly — no structured clone, no Transferable, no delta tracking. The DataBridge would become a thin synchronization wrapper.

**Current recommendation**: Don't wait for this. Build with postMessage + Comlink now. The DataBridge abstraction means we can swap the transport layer later without changing any application code.

## Open Questions

1. **Comlink vs custom protocol**: Comlink is ~1KB and handles 90% of cases. But it doesn't support streaming responses (e.g., progressive query results) or backpressure. Should we use Comlink for simple RPC and a custom MessagePort protocol for streaming?

2. **Worker bundle size**: The data worker bundles NodeStore, SyncEngine, crypto, Yjs, and potentially SQLite-WASM. This could be 1-5MB. Should the worker be lazy-loaded? Should SQLite-WASM be loaded on demand?

3. **Cold start latency**: Worker creation + WASM initialization + storage open adds ~50-200ms on page load. The main thread shows stale/cached data during this. Is this acceptable, or do we need a ServiceWorker to pre-warm?

4. **Optimistic update rollback UX**: If the worker rejects a mutation (e.g., validation error), the optimistic update must be rolled back. How should this look in the UI? Toast notification? Inline error? Undo-style "your change was reverted"?

5. **Worker crash recovery**: If the data worker crashes, all in-flight mutations and subscriptions are lost. Should the DataBridge persist a mutation log (in localStorage?) so it can replay after restart? Or is "show error, user retries" sufficient?

6. **SQLite-WASM licensing**: The official `@sqlite.org/sqlite-wasm` is public domain. But the OPFS VFS implementation and the worker wrapper have different licensing. Verify compatibility with xNet's license.

7. **Y.Doc memory in the worker**: The worker keeps all Y.Docs in memory for sync. With 100+ documents open, this could be significant. Should the worker evict unused Y.Docs to storage and re-hydrate on demand?

8. **Multiple workers**: Should we have one worker (simple) or multiple (e.g., one for storage, one for sync, one for crypto)? One worker avoids coordination overhead. Multiple workers parallelize CPU-bound operations. For xNet's scale, one worker is likely sufficient — revisit if profiling shows bottlenecks.

9. **React 19 `use()` and Suspense**: React 19's `use()` hook can read promises directly. Should `useQuery` return a Suspense-compatible promise that resolves when the worker responds? This would give us free `<Suspense fallback={...}>` support.

10. **Service Worker integration**: Should the data worker and the Service Worker (for offline/PWA) share state? Or should they be independent? Sharing could eliminate duplicate caching, but the Service Worker has very different lifecycle constraints (killed aggressively by the browser).

## Conclusion

Moving computation off the main thread is not optional for a serious local-first app. Every peer that joins a collaboration session multiplies the incoming updates, each requiring crypto verification and CRDT merging. Without off-thread architecture, the UI jank scales linearly with peer count.

The good news: JavaScript's worker infrastructure is mature, the patterns are proven (Figma, Linear, LiveStore), and xNet's existing async architecture (NodeStorageAdapter, SyncEngine) maps cleanly to a worker model. The DataBridge abstraction can be built incrementally — Phase 0 changes zero behavior but introduces the seam that all future phases exploit.

The recommended priority:

1. **DataBridge abstraction** (main-thread backend) — immediate, low risk, enables everything else
2. **Electron utility process** — highest user impact, well-understood technology
3. **Web Worker + Comlink** — second highest impact, proven patterns
4. **SQLite-WASM + OPFS** — performance multiplier within the worker
5. **Y.Doc split** — hardest, but necessary for smooth collaborative editing
6. **Expo native bridge** — when mobile becomes a priority

The key architectural insight: **the DataBridge is the abstraction**. Build it first, and the threading model becomes a pluggable implementation detail that can evolve independently of application code.
