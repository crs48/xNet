# Plan: Unified Node + Document Architecture

## Overview

Simplify the React hooks API to a clean, unified system:

| Hook          | Purpose                                           |
| ------------- | ------------------------------------------------- |
| `useQuery`    | Read properties (metadata only)                   |
| `useMutate`   | Write properties                                  |
| `useDocument` | Load Node + Y.Doc with auto-sync and persistence  |
| `useEditor`   | TipTap editor bound to a Y.Doc from `useDocument` |

---

## 1. Schema Changes

### 1.1 Update Schema type

**File:** `packages/data/src/schema/types.ts`

- Add `DocumentType = 'yjs' | 'automerge'`
- Replace `hasContent: boolean` with `document?: DocumentType`
- Export `DocumentType`

### 1.2 Update defineSchema

**File:** `packages/data/src/schema/define.ts`

- Replace `hasContent?: boolean` option with `document?: DocumentType`
- Update schema object creation

### 1.3 Update built-in schemas

| File                                           | Change                                 |
| ---------------------------------------------- | -------------------------------------- |
| `packages/data/src/schema/schemas/page.ts`     | `hasContent: true` → `document: 'yjs'` |
| `packages/data/src/schema/schemas/task.ts`     | `hasContent: true` → `document: 'yjs'` |
| `packages/data/src/schema/schemas/database.ts` | Remove `hasContent: false`             |

### 1.4 Update schema exports

**File:** `packages/data/src/schema/index.ts`

- Export `DocumentType`

### 1.5 Update schema tests

**File:** `packages/data/src/schema/schema.test.ts`

- Update references from `hasContent` to `document`

---

## 2. Storage Changes

### 2.1 Update NodeState

**File:** `packages/data/src/store/types.ts`

```typescript
export interface NodeState {
  // ... existing fields ...

  /** Serialized CRDT document (Yjs: Uint8Array from Y.encodeStateAsUpdate) */
  documentContent?: Uint8Array
}
```

### 2.2 Update NodeStorageAdapter

**File:** `packages/data/src/store/types.ts`

Add methods:

```typescript
getDocumentContent(nodeId: NodeId): Promise<Uint8Array | null>
setDocumentContent(nodeId: NodeId, content: Uint8Array): Promise<void>
```

### 2.3 Update MemoryNodeStorageAdapter

**File:** `packages/data/src/store/memory-adapter.ts`

- Add `private documentContentStore = new Map<NodeId, Uint8Array>()`
- Implement `getDocumentContent` and `setDocumentContent`
- Update `clear()` to also clear document content

---

## 3. React Hooks

### 3.1 Rewrite useDocument

**File:** `packages/react/src/hooks/useDocument.ts`

```typescript
export interface UseDocumentOptions {
  /** Signaling servers for y-webrtc */
  signalingServers?: string[]
  /** Disable auto-sync (default: false) */
  disableSync?: boolean
  /** Debounce persistence delay in ms (default: 1000) */
  persistDebounce?: number
}

export interface UseDocumentResult<P extends Record<string, PropertyBuilder>> {
  /** Node properties (LWW synced) */
  data: TypedNode<P> | null
  /** Yjs document instance */
  doc: Y.Doc | null
  /** Loading state */
  loading: boolean
  /** Error state */
  error: Error | null
  /** Has unsaved changes */
  isDirty: boolean
  /** Last persistence timestamp */
  lastSavedAt: number | null
  /** Sync connection status */
  syncStatus: 'offline' | 'connecting' | 'connected'
  /** Connected peer count */
  peerCount: number
  /** Manual save trigger */
  save: () => Promise<void>
  /** Reload from storage */
  reload: () => Promise<void>
}
```

**Implementation:**

1. Load Node properties via NodeStore
2. Check if schema has `document: 'yjs'`
3. If yes, load `documentContent` from storage
4. Create `Y.Doc` with `guid: nodeId`
5. Apply stored state via `Y.applyUpdate()`
6. Create y-webrtc provider with room `xnet-doc-${nodeId}`
7. Subscribe to doc updates:
   - Debounced save (default 1000ms)
   - Track `isDirty` and `lastSavedAt`
8. Track sync status and peer count from provider
9. Cleanup on unmount: destroy provider, flush pending saves

**Default signaling servers:** Use `['ws://localhost:4444']` for dev, configurable via options or environment.

### 3.2 Update useEditor

**File:** `packages/react/src/hooks/useEditor.ts`

Update to work with the new `useDocument`:

```typescript
export interface UseEditorOptions {
  /** Y.Doc from useDocument */
  doc: Y.Doc | null
  /** Field name in the Y.Doc (default: 'content') */
  field?: string
  /** Placeholder text */
  placeholder?: string
  /** Read-only mode */
  readOnly?: boolean
}

export interface UseEditorResult {
  /** TipTap editor instance */
  editor: Editor | null
  /** Current content as HTML */
  content: string
  /** Whether editor is focused */
  focused: boolean
}
```

**Implementation:**

- Create TipTap editor with Yjs collaboration extension
- Bind to `doc.getXmlFragment(field)`
- Handle cleanup on unmount

**Usage pattern:**

```tsx
function PageEditor({ pageId }: { pageId: string }) {
  const { data, doc, isDirty, lastSavedAt } = useDocument(PageSchema, pageId)
  const { editor } = useEditor({ doc })

  return (
    <div>
      <h1>{data?.properties.title}</h1>
      <EditorContent editor={editor} />
      {isDirty && <span>Saving...</span>}
    </div>
  )
}
```

### 3.3 Keep useQuery and useMutate

No changes needed - they handle properties only.

### 3.4 Delete old hooks

**Remove files:**

- `packages/react/src/hooks/useDocumentSync.ts`
- `packages/react/src/hooks/useDocument.test.tsx` (will be rewritten)

### 3.5 Update exports

**File:** `packages/react/src/index.ts`

```typescript
// Core data hooks
export { useQuery, ... } from './hooks/useQuery'
export { useMutate, ... } from './hooks/useMutate'

// Document hooks
export { useDocument, type UseDocumentOptions, type UseDocumentResult } from './hooks/useDocument'
export { useEditor, type UseEditorOptions, type UseEditorResult } from './hooks/useEditor'

// Provider
export { NodeStoreProvider, useNodeStore, ... } from './hooks/useNodeStore'

// Sync & presence (keep for now)
export { useSync, ... } from './hooks/useSync'
export { usePresence, ... } from './hooks/usePresence'
export { useNodeSync, ... } from './hooks/useNodeSync'

// Identity
export { useIdentity, ... } from './hooks/useIdentity'

// Remove old XNetProvider exports if no longer needed
```

---

## 4. Tests

### 4.1 Schema tests

**File:** `packages/data/src/schema/schema.test.ts`

- Update `hasContent` → `document` assertions

### 4.2 Storage tests

**File:** `packages/data/src/store/store.test.ts`

- Add tests for `getDocumentContent`/`setDocumentContent` on adapter

### 4.3 useDocument tests

**File:** `packages/react/src/hooks/useDocument.test.tsx` (rewrite)

- Test loading node with Y.Doc
- Test Y.Doc hydration from stored content
- Test debounced persistence
- Test `isDirty` / `lastSavedAt` tracking
- Test sync status

### 4.4 useEditor tests

**File:** `packages/react/src/hooks/useEditor.test.tsx` (if exists, update)

- Test editor creation with Y.Doc
- Test content sync

---

## 5. App Updates

### 5.1 Check for old hook usage

**Directories to check:**

- `apps/web/`
- `apps/electron/`
- `apps/expo/`

**Search for:**

- `useDocument` (update to new signature)
- `useDocumentSync` (remove, functionality merged into `useDocument`)
- `useEditor` (update to pass `doc` from `useDocument`)
- `XNetProvider` (check if still needed or can migrate to `NodeStoreProvider`)

### 5.2 Update imports

Replace old patterns:

```typescript
// Old
const { data: doc } = useDocument(docId)
const { connected } = useDocumentSync({ document: doc })

// New
const { data, doc, syncStatus } = useDocument(PageSchema, pageId)
```

---

## 6. Documentation

### 6.1 Update README.md

Update React hooks section to show:

```tsx
// Define schema with document support
const PageSchema = defineSchema({
  name: 'Page',
  namespace: 'xnet://myapp/',
  properties: {
    title: text({ required: true }),
    icon: text()
  },
  document: 'yjs' // Enables collaborative Y.Doc
})

// Read properties only (lightweight)
function PageList() {
  const { data: pages } = useQuery(PageSchema)
  return pages.map((p) => <li>{p.properties.title}</li>)
}

// Full document editing with real-time sync
function PageEditor({ pageId }) {
  const { data, doc, isDirty, lastSavedAt, syncStatus, peerCount } = useDocument(PageSchema, pageId)
  const { editor } = useEditor({ doc })

  return (
    <div>
      <h1>{data?.properties.title}</h1>
      <span>
        {syncStatus} ({peerCount} peers)
      </span>
      <EditorContent editor={editor} />
      {isDirty ? 'Saving...' : `Saved ${lastSavedAt}`}
    </div>
  )
}

// Write properties
function PageSettings({ pageId }) {
  const { data } = useQuery(PageSchema, pageId)
  const { update } = useMutate()

  return (
    <input
      value={data?.properties.title}
      onChange={(e) => update(pageId, { title: e.target.value })}
    />
  )
}
```

---

## 7. Implementation Order

1. **Schema changes** (types, define, built-in schemas, tests)
2. **Storage changes** (NodeState, adapter interface, memory adapter)
3. **useDocument hook** (new implementation)
4. **useEditor hook** (update to use Y.Doc from useDocument)
5. **Delete old hooks** (useDocumentSync)
6. **Update exports** (index.ts)
7. **Run tests** (fix any failures)
8. **App updates** (web, electron, expo)
9. **README update**

---

## 8. Decisions Made

| Question          | Decision                                                    |
| ----------------- | ----------------------------------------------------------- |
| Room naming       | `xnet-doc-${nodeId}`                                        |
| Default signaling | `['ws://localhost:4444']` for dev, configurable via options |
| Awareness         | Not exposed in v1, can add later as separate hook or option |
| Editor hook       | Keep and update to accept `doc` from `useDocument`          |

---

## Status

- [x] Schema changes (document field already existed in types.ts)
- [x] Storage changes (getDocumentContent/setDocumentContent added to NodeStore)
- [x] useDocument hook (implemented with Y.Doc, y-webrtc sync, persistence)
- [x] useEditor hook (already compatible - accepts ydoc prop)
- [x] Delete old hooks (useDocumentSync deprecated, not deleted)
- [x] Update exports (SyncStatus exported)
- [x] Tests (9 useDocument tests passing)
- [x] README update
- [ ] App updates (deferred - apps use XNetProvider/XDocument, separate migration)
