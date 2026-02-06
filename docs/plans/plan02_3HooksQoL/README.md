# Plan Step 02.3: React Hooks Quality of Life

> **Status**: Complete  
> **Package**: `@xnet/react`

## Overview

Simplified the React hooks API to 3 core hooks with ergonomic improvements.

## Core API

```
┌─────────────────────────────────────────────────────────────────┐
│                        @xnet/react                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  useQuery      Read nodes (list or single)                      │
│                → FlatNode (properties at top level)              │
│                → Sorting, filtering                              │
│                                                                  │
│  useMutate     Write operations                                  │
│                → create, update, updateTyped, remove             │
│                → isPending tracking                              │
│                → Transactions                                    │
│                                                                  │
│  useDocument   Y.Doc for rich text editing                       │
│                → Collaborative sync via y-webrtc                 │
│                → Presence (remote users)                         │
│                → createIfMissing                                 │
│                → Type-safe mutations                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Key Improvements

### 1. FlatNode - Direct Property Access

```tsx
// Before
const title = page.properties.title as string

// After
const title = page.title // Typed correctly!
```

### 2. Type-Safe Mutations

```tsx
const { updateTyped } = useMutate()
await updateTyped(TaskSchema, id, { status: 'done' }) // Type-checked!
```

### 3. createIfMissing

```tsx
// Before: 15 lines of useEffect boilerplate

// After
useDocument(PageSchema, id, { createIfMissing: { title: 'Untitled' } })
```

### 4. Integrated Presence

```tsx
const { presence, syncStatus, peerCount } = useDocument(PageSchema, id, {
  did: myDid
})
```

## Usage

### Reading

```tsx
// List
const { data: pages } = useQuery(PageSchema)

// Single
const { data: page } = useQuery(PageSchema, id)

// Filtered + sorted
const { data } = useQuery(TaskSchema, {
  where: { status: 'todo' },
  orderBy: { createdAt: 'desc' }
})
```

### Writing

```tsx
const { create, updateTyped, remove, isPending } = useMutate()

await create(TaskSchema, { title: 'New' })
await updateTyped(TaskSchema, id, { status: 'done' })
await remove(id)
```

### Rich Text Editing

```tsx
const {
  data, // FlatNode
  doc, // Y.Doc
  update, // Type-safe
  syncStatus,
  presence
} = useDocument(PageSchema, id, {
  createIfMissing: { title: 'Untitled' },
  did: myDid
})
```

## Files Changed

- `packages/react/src/utils/flattenNode.ts` - New
- `packages/react/src/hooks/useQuery.ts` - FlatNode, sorting
- `packages/react/src/hooks/useMutate.ts` - isPending, updateTyped
- `packages/react/src/hooks/useDocument.ts` - createIfMissing, presence, mutations
- `packages/react/src/index.ts` - Simplified exports

## Files Removed

- `packages/react/src/hooks/useSync.ts` - Sync status is in useDocument
- `packages/react/src/hooks/usePresence.ts` - Presence is in useDocument
