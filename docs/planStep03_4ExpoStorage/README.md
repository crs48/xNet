# Plan Step 03.4: Expo/Mobile Storage Durability

## Problem Statement

IndexedDB and other web storage APIs are **not durable on mobile platforms**:

### iOS (WKWebView)

- **7-day eviction**: Safari's Intelligent Tracking Prevention (ITP) deletes all script-writable storage (IndexedDB, LocalStorage, SessionStorage, Cache API) after 7 days of Safari use without user interaction on the site
- **Storage pressure**: System can evict data when device storage is low
- **No guaranteed persistence**: Even `navigator.storage.persist()` doesn't guarantee data retention on iOS

### Android (WebView)

- **System cleanup**: Android can clear WebView storage under memory pressure
- **Less aggressive than iOS**: But still not guaranteed durable
- **App data clearing**: Users can clear app data which removes WebView storage

### Why This Matters for xNet

xNet is a local-first application where user data sovereignty is paramount. Users expect their documents, databases, and settings to persist reliably. Data loss is unacceptable for a productivity tool.

While P2P sync can recover data from peers, this requires:

1. The user to have synced with another device/peer
2. That peer to be online and reachable
3. Network connectivity

We cannot rely on sync as a backup strategy for local storage durability.

## Current Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      xNet Apps                          │
├─────────────┬─────────────────────┬─────────────────────┤
│   Electron  │        Web          │       Expo          │
│  (Desktop)  │       (PWA)         │      (Mobile)       │
├─────────────┼─────────────────────┼─────────────────────┤
│  IndexedDB  │     IndexedDB       │     IndexedDB       │
│  (Durable)  │  (Best-effort)      │   (NOT DURABLE)     │
└─────────────┴─────────────────────┴─────────────────────┘
```

- **Electron**: IndexedDB is durable (no browser eviction policies apply)
- **Web**: IndexedDB is best-effort (acceptable for PWA with sync)
- **Expo/Mobile**: IndexedDB is NOT durable (unacceptable for local-first app)

## Proposed Solutions

### Option 1: expo-sqlite

Use SQLite via `expo-sqlite` package for all structured data storage.

```typescript
import * as SQLite from 'expo-sqlite'

const db = SQLite.openDatabase('xnet.db')
```

**Pros:**

- Native storage, fully durable
- Well-maintained Expo package
- Familiar SQL interface
- Good performance

**Cons:**

- Different API than IndexedDB (need adapter)
- Synchronous API can block JS thread
- Need to manage schema migrations

### Option 2: react-native-mmkv

Use MMKV (WeChat's key-value storage) for fast, durable storage.

```typescript
import { MMKV } from 'react-native-mmkv'

const storage = new MMKV()
storage.set('node:123', JSON.stringify(nodeData))
```

**Pros:**

- Extremely fast (30x faster than AsyncStorage)
- Native storage, fully durable
- Simple key-value API
- Synchronous access

**Cons:**

- Key-value only (no indexing/querying)
- Would need to build query layer on top
- Third-party package (not Expo-maintained)

### Option 3: op-sqlite

Use `op-sqlite` for high-performance SQLite with modern features.

**Pros:**

- Fastest SQLite implementation for React Native
- Supports concurrent reads
- Native storage, fully durable

**Cons:**

- Requires native module linking
- May complicate Expo build process

### Option 4: Hybrid Approach

Use different storage backends per platform with a unified adapter interface:

```typescript
interface StorageAdapter {
  getNode(id: string): Promise<Node | null>;
  setNode(id: string, node: Node): Promise<void>;
  deleteNode(id: string): Promise<void>;
  query(filter: QueryFilter): Promise<Node[]>;
}

// Platform-specific implementations
class IndexedDBStorageAdapter implements StorageAdapter { ... }
class SQLiteStorageAdapter implements StorageAdapter { ... }
class MMKVStorageAdapter implements StorageAdapter { ... }
```

**Pros:**

- Best storage for each platform
- Unified API for app code
- Can optimize per-platform

**Cons:**

- More code to maintain
- Potential subtle behavior differences
- Testing complexity

## Recommendation

**Option 4 (Hybrid)** with these specifics:

| Platform | Storage Backend | Package                 |
| -------- | --------------- | ----------------------- |
| Electron | IndexedDB       | `@xnet/data` (existing) |
| Web      | IndexedDB       | `@xnet/data` (existing) |
| iOS      | SQLite          | `expo-sqlite`           |
| Android  | SQLite          | `expo-sqlite`           |

This approach:

1. Keeps working code for Electron/Web unchanged
2. Uses Expo-maintained package for mobile (better long-term support)
3. SQLite is battle-tested and appropriate for structured data
4. We already have the adapter pattern in `@xnet/data`

## Implementation Notes

### Adapter Interface

We already have `NodeStorageAdapter` interface in `@xnet/data`:

```typescript
// packages/data/src/storage/types.ts
interface NodeStorageAdapter {
  get(id: string): Promise<StoredNode | null>
  set(id: string, node: StoredNode): Promise<void>
  delete(id: string): Promise<void>
  list(prefix?: string): Promise<string[]>
}
```

We would create a new `SQLiteNodeStorageAdapter` implementing this interface.

### Y.Doc Storage

Y.Doc binary state also needs durable storage. Options:

1. Store as BLOB in SQLite alongside node metadata
2. Separate table for Y.Doc states
3. File-based storage for large documents

### Migration Path

1. Create `SQLiteNodeStorageAdapter` in `@xnet/data`
2. Add platform detection in Expo app
3. Use SQLite adapter on mobile, IndexedDB on web
4. Test sync between platforms (data format must match)

## Open Questions

1. **Should we use the same SQLite for both NodeStore and Y.Doc state?**
   - Single DB is simpler but could have locking issues
   - Separate DBs add complexity but better isolation

2. **Do we need migrations for SQLite schema changes?**
   - Our data is schema-first (defined in code)
   - But SQLite tables need explicit schema

3. **How do we handle Expo Go vs production builds?**
   - `expo-sqlite` works in Expo Go
   - Some alternatives require custom dev client

4. **What about offline-first sync queue?**
   - Need durable storage for pending sync operations
   - Must survive app restarts

## Priority

**Medium** - Not blocking current development but required before mobile production release.

Current focus is on:

1. P2P sync working in Electron (planStep03_2)
2. Basic sharing flow (planStep03_3)

Mobile storage durability should be addressed when we return to Expo development.

## References

- [MDN: Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- [WebKit: Full Third-Party Cookie Blocking](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)
- [WebKit: 7-Day Cap on Script-Writable Storage](https://webkit.org/blog/8613/intelligent-tracking-prevention-2-1/)
- [expo-sqlite docs](https://docs.expo.dev/versions/latest/sdk/sqlite/)
- [react-native-mmkv](https://github.com/mrousavy/react-native-mmkv)
