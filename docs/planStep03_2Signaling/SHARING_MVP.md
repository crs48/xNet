# Sharing MVP: Early Testing Strategy

> Getting two Electron instances to sync the same document

## The Problem

To test P2P sync, we need:

1. Two separate "users" (different identities/storage)
2. A way to share a document between them
3. Both connected to the same signaling room

Currently, running `pnpm dev` twice would use the **same database** (`~/Library/Application Support/xnet-desktop/xnet-data/xnet.db`), which defeats the purpose of testing sync.

## Current State Analysis

### What Works

| Component               | Status          | Notes                          |
| ----------------------- | --------------- | ------------------------------ |
| Y.Doc sync via y-webrtc | **Works**       | Room = `xnet-doc-{documentId}` |
| Signaling server        | **Works**       | Runs on port 4444              |
| DID generation          | **Works**       | `packages/identity/`           |
| Ed25519 signing         | **Works**       | `packages/crypto/`             |
| UCAN tokens             | **Implemented** | Not yet enforced               |

### What's Missing

| Component         | Status          | Blocker                         |
| ----------------- | --------------- | ------------------------------- |
| Storage isolation | Not implemented | Both instances use same DB      |
| Share link/invite | Not implemented | No way to "send" doc ID to peer |
| Permission check  | Not enforced    | Anyone with doc ID can join     |
| NodeStore sync    | **Broken**      | Room = user DID, not doc ID     |

### Critical Bug: NodeStore Sync

The `useNodeSync` hook creates rooms based on **user DID**, not document ID:

```typescript
// packages/react/src/hooks/useNodeSync.ts
const provider = new WebrtcProvider(`xnet-nodes-${peerId}`, ...)
```

This means two users editing the same document will be in **different rooms** for property sync. Only the Y.Doc content (rich text) syncs correctly.

## Proposed MVP: Dual Instance Development Mode

### Approach: Profile-based Storage Isolation

Run two Electron instances with different data directories:

```bash
# Terminal 1 - User A (default profile)
pnpm dev

# Terminal 2 - User B (separate profile)
pnpm dev:user2
```

### Implementation

#### 1. Add Profile Support to Electron Main Process

```typescript
// apps/electron/src/main/index.ts
const profile = process.env.XNET_PROFILE || 'default'
const dataPath = join(app.getPath('userData'), `xnet-data-${profile}`)
```

#### 2. Add Dev Script for Second User

```json
// apps/electron/package.json
{
  "scripts": {
    "dev": "concurrently -k -n signal,electron -c blue,green \"pnpm run dev:signaling\" \"pnpm run dev:electron\"",
    "dev:user2": "cross-env XNET_PROFILE=user2 electron-vite dev",
    "dev:both": "concurrently -k -n signal,user1,user2 -c blue,green,yellow \"pnpm run dev:signaling\" \"pnpm run dev:electron\" \"sleep 2 && pnpm run dev:user2\""
  }
}
```

#### 3. Simple Share UI (Clipboard-based)

For MVP, just copy/paste the document ID:

```tsx
// Share button in PageView
<button onClick={() => navigator.clipboard.writeText(docId)}>
  Copy Share Link
</button>

// Join dialog
const [joinId, setJoinId] = useState('')
<input value={joinId} onChange={e => setJoinId(e.target.value)} />
<button onClick={() => navigate(`/doc/${joinId}`)}>
  Join Document
</button>
```

### Testing Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    TESTING FLOW                              │
└─────────────────────────────────────────────────────────────┘

1. Start both instances:
   $ pnpm dev:both

   This starts:
   - Signaling server (port 4444)
   - Electron User A (default profile)
   - Electron User B (user2 profile)

2. User A creates a document:
   - Click "New Page"
   - Type some content
   - Click "Copy Share Link" → doc ID in clipboard

3. User B joins:
   - Click "Join Document"
   - Paste doc ID
   - Document opens with synced content

4. Both edit simultaneously:
   - Changes should appear in real-time
   - Signaling server logs show pub/sub activity
```

## Implementation Tasks

### Phase 1: Storage Isolation (30 min)

- [ ] Add `XNET_PROFILE` env var support to Electron main
- [ ] Update `dev:user2` script
- [ ] Test that two instances have separate databases

### Phase 2: Share UI (1 hour)

- [ ] Add "Copy Document ID" button to document header
- [ ] Add "Join Document" input/button to sidebar or command palette
- [ ] Show sync status indicator (connected peers count)

### Phase 3: Fix NodeStore Sync (2 hours)

- [ ] Change `useNodeSync` room to `xnet-doc-{docId}` pattern
- [ ] Or: Create per-document NodeStore sync alongside Y.Doc
- [ ] Test that property changes sync (title, etc.)

### Phase 4: Basic Verification (Future)

- [ ] Sign changes with user's Ed25519 key
- [ ] Verify signatures on incoming changes
- [ ] Reject changes from unknown signers (or flag them)

## Architecture Decision: Room Naming

### Option A: Document-centric rooms (Recommended)

```
Room: xnet-doc-{documentId}
- Y.Doc content syncs here
- NodeStore changes sync here
- All users editing same doc in same room
```

**Pros**: Simple, works for collaboration
**Cons**: No isolation between workspaces

### Option B: Workspace + Document rooms

```
Room: xnet-{workspaceId}-{documentId}
- Workspace provides permission boundary
- Users must have workspace access
```

**Pros**: Better security model
**Cons**: More complex, need workspace key sharing

### Recommendation

Start with **Option A** for MVP testing. Add workspace scoping when we implement proper permissions.

## Security Considerations (Future)

For MVP testing, we accept these limitations:

1. **No encryption** - Data travels in cleartext over WebRTC
2. **No permission check** - Anyone with doc ID can join
3. **No identity verification** - Peers not authenticated

These are fine for local development testing. Production sharing will need:

- UCAN tokens for permission
- Workspace key encryption
- Signature verification on all changes

## Quick Start Implementation

### Minimum Changes for Testing Today

1. **main/index.ts** - Add profile support:

```typescript
const profile = process.env.XNET_PROFILE || 'default'
const userDataPath = app.getPath('userData')
const dataPath = join(userDataPath, `xnet-data-${profile}`)
```

2. **package.json** - Add scripts:

```json
"dev:user2": "cross-env XNET_PROFILE=user2 electron-vite dev"
```

3. **Install cross-env**:

```bash
pnpm add -D cross-env
```

4. **Test**:

```bash
# Terminal 1
pnpm dev

# Terminal 2
pnpm run dev:user2
```

Then manually copy a document ID from User A's URL bar to User B.

## Future: Presence & Collaboration UX

### Awareness (Who's Here)

Yjs has built-in awareness protocol for showing active collaborators:

```typescript
import { Awareness } from 'y-protocols/awareness'

// Each user broadcasts their presence
awareness.setLocalState({
  user: { name: 'Alice', color: '#ff0000' },
  cursor: { x: 100, y: 200 }
})

// Listen for other users
awareness.on('change', () => {
  const states = awareness.getStates() // Map of clientId -> state
})
```

**UI Elements to Add:**

- Avatar stack showing active editors (top-right of document)
- Colored cursors with name labels in editor
- "X people viewing" indicator

### Cursor Sync Per Document Type

We want cursor presence in ALL document types, not just rich text:

#### 1. Pages (Rich Text Editor)

TipTap + Yjs supports collaborative cursors via `@tiptap/extension-collaboration-cursor`:

```typescript
import CollaborationCursor from '@tiptap/extension-collaboration-cursor'

const editor = new Editor({
  extensions: [
    Collaboration.configure({ document: ydoc }),
    CollaborationCursor.configure({
      provider: webrtcProvider,
      user: { name: 'Alice', color: '#ff0000' }
    })
  ]
})
```

**Shows:** Text cursor position, selection highlight with user color/name label.

#### 2. Databases (Table/Board View)

Need custom implementation - no built-in TipTap support:

```typescript
// Broadcast what cell/row user is focused on
awareness.setLocalState({
  user: { name: 'Alice', color: '#ff0000' },
  focus: {
    type: 'database',
    rowId: 'row-123',
    columnId: 'status', // Which cell
    view: 'table' // or 'board'
  }
})
```

**Shows:**

- **Table view**: Highlighted cell border in user's color
- **Board view**: Card outline glow when someone is viewing/editing it
- Row-level indicator if editing any cell in that row

#### 3. Canvas (Infinite Canvas)

Need custom implementation for spatial cursor:

```typescript
// Broadcast cursor position on canvas
awareness.setLocalState({
  user: { name: 'Alice', color: '#ff0000' },
  cursor: {
    type: 'canvas',
    x: 450, // Canvas coordinates
    y: 230,
    viewport: {
      // So we can show "Alice is viewing over there" arrow
      x: 0,
      y: 0,
      zoom: 1.0
    }
  },
  selection: ['node-1', 'node-2'] // Selected nodes
})
```

**Shows:**

- Cursor with name label floating on canvas
- Selection outlines in user's color when they select nodes
- "User is off-screen →" indicator pointing to their location
- Mini-map could show other users' viewport positions

### Shared Awareness Infrastructure

All three document types can share the same awareness instance per document:

```typescript
// In useDocument or a new usePresence hook
const awareness = provider.awareness

// Generic presence state
interface PresenceState {
  user: {
    id: string // DID or client ID
    name: string // Display name
    color: string // Assigned color
  }
  lastActive: number

  // Document-type-specific cursor info
  cursor?: PageCursor | DatabaseCursor | CanvasCursor
}

type PageCursor = {
  type: 'page'
  // TipTap handles this internally
}

type DatabaseCursor = {
  type: 'database'
  rowId?: string
  columnId?: string
  view: 'table' | 'board'
}

type CanvasCursor = {
  type: 'canvas'
  x: number
  y: number
  selection: string[]
}
```

### Implementation Priority

| Feature                    | Complexity | Value  | Priority                          |
| -------------------------- | ---------- | ------ | --------------------------------- |
| Page cursors (TipTap)      | Low        | High   | P1 - Use existing extension       |
| Avatar stack (who's here)  | Low        | High   | P1 - Just render awareness states |
| Canvas cursors             | Medium     | High   | P2 - Custom render layer          |
| Database cell focus        | Medium     | Medium | P3 - Custom highlight logic       |
| Off-screen user indicators | Medium     | Low    | P4 - Nice to have                 |
| Mini-map with users        | High       | Low    | P5 - Future                       |

### Color Assignment

Need consistent colors per user across sessions:

```typescript
// Deterministic color from DID
function getUserColor(did: string): string {
  const hash = hashString(did)
  const hue = hash % 360
  return `hsl(${hue}, 70%, 50%)`
}

// Or pick from a palette
const COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', ...]
function getUserColor(did: string): string {
  const index = hashString(did) % COLORS.length
  return COLORS[index]
}
```

// Listen for other users
awareness.on('change', () => {
const states = awareness.getStates() // Map of clientId -> state
})

````

**UI Elements to Add:**

- Avatar stack showing active editors (top-right of document)
- Colored cursors with name labels in editor
- "X people viewing" indicator

### Cursor Sync (Where They Are)

TipTap + Yjs supports collaborative cursors via `@tiptap/extension-collaboration-cursor`:

```typescript
import CollaborationCursor from '@tiptap/extension-collaboration-cursor'

const editor = new Editor({
  extensions: [
    Collaboration.configure({ document: ydoc }),
    CollaborationCursor.configure({
      provider: webrtcProvider,
      user: { name: 'Alice', color: '#ff0000' }
    })
  ]
})
````

### Permission Management (Future)

Currently, anyone with a document ID can join. Future needs:

| Feature                 | Implementation                                   |
| ----------------------- | ------------------------------------------------ |
| Owner can revoke access | Store ACL in document metadata, check on connect |
| View-only sharing       | UCAN with limited capabilities (read, no write)  |
| Expiring links          | UCAN with `exp` (expiration) claim               |
| Remove user from doc    | Awareness message to disconnect, plus ACL update |

**Data Model:**

```typescript
interface DocumentACL {
  owner: DID // Creator's DID
  editors: DID[] // Can read + write
  viewers: DID[] // Can read only
  public: boolean // Anyone with link can view
}
```

**Revocation Flow:**

1. Owner removes user from ACL
2. ACL change syncs via CRDT
3. Removed user's client sees ACL change
4. Client disconnects from sync (or is ignored by peers)

This requires solving:

- How to identify peers (DID exchange on connect)
- How to enforce permissions in decentralized system
- What happens if removed user has local copy (they keep it, but no more updates)

### Share Granularity (Future)

Current: Share entire Page/Database/Canvas

Future possibilities:

- Share a specific database row
- Share a specific block/section of a page
- Share a filtered view of a database
- Transclusion (embed shared content in another doc)

This requires content-addressable blocks with their own IDs.

## Open Questions

1. **Should we fix NodeStore sync first?**
   - Y.Doc sync works, so rich text will sync
   - Title/properties won't sync until NodeStore is fixed
   - Could defer this and just test Y.Doc sync first

2. **How should "Join Document" work in the UI?**
   - Command palette (Cmd+K)?
   - Sidebar button?
   - URL scheme (`xnet://join/doc-id`)?

3. **Do we want `dev:both` to auto-open the same doc?**
   - Could have User B auto-navigate to a test doc
   - Makes repeated testing faster

4. **How do we show sync status?**
   - Connected/disconnected indicator
   - Number of peers currently syncing
   - Last sync timestamp

5. **Identity for presence - where does user name come from?**
   - Currently just DID (not human-readable)
   - Need profile/settings for display name
   - Or derive from DID (first 8 chars?)

---

## Related Documents

- [README.md](./README.md) - Full signaling implementation plan
- [packages/identity/](../../packages/identity/) - DID and UCAN implementation
- [packages/react/src/hooks/useDocument.ts](../../packages/react/src/hooks/useDocument.ts) - Current sync implementation
