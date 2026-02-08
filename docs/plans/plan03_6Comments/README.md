# xNet Implementation Plan - Step 03.6: Commenting System

> Universal commenting: comment on anything, anywhere -- text selections, database cells, canvas objects, or entire Nodes.

## Executive Summary

This plan adds a commenting system to xNet following the **Universal Social Primitives** pattern. Comments are first-class Nodes with a **schema-agnostic `target` relation** -- meaning one Comment schema works for all content types.

```typescript
// Universal comments: same pattern for any Node type
const comment = await store.create({
  schemaId: 'xnet://xnet.dev/Comment',
  properties: {
    target: pageId, // Any Node ID -- Page, Post, Task, etc.
    targetSchema: 'xnet://xnet.dev/Page', // Optimization hint
    anchorType: 'text',
    anchorData: JSON.stringify({ startRelative, endRelative, quotedText }),
    content: 'This needs to handle the null case.',
    inReplyTo: null // null = root comment, or parent comment ID
  }
})

// Reply in the same thread
const reply = await store.create({
  schemaId: 'xnet://xnet.dev/Comment',
  properties: {
    target: pageId,
    targetSchema: 'xnet://xnet.dev/Page',
    anchorType: 'node', // Replies don't need positional anchors
    anchorData: '{}',
    content: 'Good catch, I will fix it.',
    inReplyTo: comment.id // Links to parent comment
  }
})
```

## Universal Primitive Pattern

This implementation follows [0030_UNIVERSAL_SOCIAL_PRIMITIVES.md](../../explorations/0030_[_]_UNIVERSAL_SOCIAL_PRIMITIVES.md):

| Principle                       | Implementation                                                    |
| ------------------------------- | ----------------------------------------------------------------- |
| **Schema-agnostic `target`**    | `relation({ required: true })` with no `target` schema constraint |
| **`targetSchema` optimization** | Text field storing the target's schema IRI for query optimization |
| **Threading via `inReplyTo`**   | Single Comment schema handles both root comments and replies      |
| **Universal hook**              | `useComments(nodeId)` works on any Node                           |

## Design Principles

| Principle                 | Implementation                                                 |
| ------------------------- | -------------------------------------------------------------- |
| **Comment on anything**   | Universal Comment schema + polymorphic anchor system           |
| **Inline-first**          | Popover on click/hover -- no sidebar required to read comments |
| **Comments are Nodes**    | Same sync, permissions, query, and history as user data        |
| **Real-time**             | Existing Change propagation handles all comment operations     |
| **GitHub-style markdown** | Plain text storage, GFM rendered at display time               |
| **Consistent ordering**   | Lamport clock for order, wall time for display                 |
| **Edit history free**     | Event-sourced Changes give full revision history automatically |

## Architecture Overview

```mermaid
flowchart TB
    subgraph "Data Layer (Universal Primitive)"
        COMMENT[Comment Schema<br/>target: any Node<br/>inReplyTo: threading]
        ANCHOR[Anchor Data<br/>text | cell | canvas | node]
        COMMENT --> ANCHOR
    end

    subgraph "Editor Integration"
        MARK[CommentMark Extension]
        PLUGIN[CommentPopover Plugin]
        RELPOS[Yjs RelativePosition]
        MARK --> RELPOS
        PLUGIN --> MARK
    end

    subgraph "UI Components"
        POPOVER[CommentPopover]
        SIDEBAR[CommentSidebar]
        INDICATORS[Comment Indicators]
    end

    subgraph "Surface Types"
        EDITOR[Rich Text Editor]
        DATABASE[Database Views]
        CANVAS[Canvas]
    end

    COMMENT --> POPOVER
    COMMENT --> SIDEBAR
    COMMENT --> INDICATORS

    EDITOR --> MARK
    DATABASE --> INDICATORS
    CANVAS --> INDICATORS
```

## Key Types

```typescript
// Anchor types (polymorphic)
type AnchorType = 'text' | 'cell' | 'row' | 'column' | 'canvas-position' | 'canvas-object' | 'node'

// Text anchor (Yjs-relative positions)
interface TextAnchor {
  startRelative: string // Base64-encoded Y.encodeRelativePosition
  endRelative: string
  quotedText: string // Fallback for orphaned anchors
}

// Database anchors
interface CellAnchor {
  rowId: string
  propertyKey: string
}
interface RowAnchor {
  rowId: string
}
interface ColumnAnchor {
  propertyKey: string
}

// Canvas anchors
interface CanvasPositionAnchor {
  x: number
  y: number
}
interface CanvasObjectAnchor {
  objectId: string
  offsetX?: number
  offsetY?: number
}

// Comment (unified schema)
interface Comment {
  target: string // Any Node ID (schema-agnostic)
  targetSchema?: string // e.g., 'xnet://xnet.dev/Page' (optimization)
  inReplyTo?: string // Root comment ID (flat threading - all replies point to root)
  anchorType: AnchorType
  anchorData: string // JSON-encoded anchor
  content: string // GitHub-flavored markdown (plain text, rendered at display)
  resolved: boolean // Thread state (root comment only)
  attachments?: string[] // File IDs
  replyToUser?: string // Pseudo reply-to for UI (not structural)
  replyToCommentId?: string

  // From Node system:
  lamportTime: number // Consistent ordering across peers
  wallTime: number // Human-readable display time
}
```

## Universal Hook Pattern

Following the exploration's hook pattern:

```typescript
// packages/react/src/hooks/useComments.ts

function useComments(nodeId: NodeId) {
  // Returns: { comments, addComment, replyTo, resolveThread, count }
  // Queries: all Comment nodes where target == nodeId
  // Groups: by thread (inReplyTo chain)
  // Supports: nested threading via inReplyTo
}

// Usage examples (same hook for everything!)
function PageHeader({ page }) {
  const { comments, addComment, count } = useComments(page.id)
  return <CommentButton count={count} onClick={showCommentsPanel} />
}

function PostCard({ post }) {
  const { comments, addComment } = useComments(post.id)
  return <CommentThread comments={comments} onAdd={addComment} />
}

function RecordDetail({ record }) {
  const { comments, addComment } = useComments(record.id)
  return <CommentSidebar comments={comments} onAdd={addComment} />
}
```

## Implementation Phases

### Phase 1: Data Model & Editor Comments (Week 1-2)

| Task | Document                                         | Description                                      |
| ---- | ------------------------------------------------ | ------------------------------------------------ |
| 1.1  | [01-comment-schemas.md](./01-comment-schemas.md) | Universal Comment schema (merged thread+comment) |
| 1.2  | [02-comment-mark.md](./02-comment-mark.md)       | TipTap Mark extension for text highlighting      |
| 1.3  | [03-anchoring.md](./03-anchoring.md)             | Anchoring strategies for all surface types       |

**Validation Gate:**

- [ ] Comment schema defined with schema-agnostic `target` relation
- [ ] `targetSchema` optimization field included
- [ ] Threading via `inReplyTo` works
- [ ] CommentMark highlights text with comment ID attribute
- [ ] Yjs RelativePosition captures survive concurrent edits
- [ ] All tests pass

### Phase 2: UI Components (Week 2-3)

| Task | Document                                               | Description                                        |
| ---- | ------------------------------------------------------ | -------------------------------------------------- |
| 2.1  | [04-comment-popover.md](./04-comment-popover.md)       | Inline popover (hover preview + click full thread) |
| 2.2  | [05-editor-integration.md](./05-editor-integration.md) | ProseMirror plugin + useComments hook              |

**Validation Gate:**

- [ ] Popover appears on hover (preview) and click (full thread)
- [ ] Reply input works inline
- [ ] Resolve/reopen actions work
- [ ] Comment creation from text selection works end-to-end
- [ ] `useComments(nodeId)` hook works universally

### Phase 3: Database & Canvas (Week 3-4)

| Task | Document                                             | Description                                          |
| ---- | ---------------------------------------------------- | ---------------------------------------------------- |
| 3.1  | [06-database-comments.md](./06-database-comments.md) | Cell, row, column commenting in table/board views    |
| 3.2  | [07-canvas-comments.md](./07-canvas-comments.md)     | Position pins + object attachment (Figma/Miro style) |

**Validation Gate:**

- [ ] Database cells show comment indicators
- [ ] Canvas pins render in overlay layer
- [ ] Canvas object comments follow object movement
- [ ] Same `useComments` hook used across all surfaces

### Phase 4: Thread Lifecycle & Polish (Week 4-5)

| Task | Document                                           | Description                                           |
| ---- | -------------------------------------------------- | ----------------------------------------------------- |
| 4.1  | [08-thread-lifecycle.md](./08-thread-lifecycle.md) | Orphaned anchors, overlapping comments, notifications |

**Validation Gate:**

- [ ] Orphaned threads show in "Detached" section with quoted text
- [ ] Overlapping comment highlights show thread picker
- [ ] Comment count badges on Nodes in navigation
- [ ] @mention parsing works

## Real-Time Sync

Comments sync via the existing `Change<NodePayload>` mechanism -- no new infrastructure:

| Operation      | Mechanism                          | Conflict Resolution       |
| -------------- | ---------------------------------- | ------------------------- |
| Create comment | New Node creation                  | No conflict (unique IDs)  |
| Add reply      | New Comment Node with `inReplyTo`  | No conflict (unique IDs)  |
| Edit comment   | Property update                    | LWW per-property          |
| Resolve thread | Property update (`resolved: true`) | LWW -- last resolver wins |
| Delete comment | Soft-delete Node                   | LWW on `deleted` flag     |

## Edit History (Free)

Because comments are Nodes and all mutations are event-sourced as `Change<NodePayload>` records, full edit history comes for free.

## Success Criteria

After completing this plan:

1. **Comment on text** -- Select text, comment, see inline popover
2. **Comment on database** -- Cell/row/column indicators with popovers
3. **Comment on canvas** -- Figma-style pins and object attachment
4. **Comment on any Node** -- Universal `useComments(nodeId)` hook
5. **Real-time sync** -- All comment operations sync to peers
6. **Inline UX** -- Popovers on hover/click, no sidebar required
7. **Thread management** -- Resolve, reopen, delete, orphan handling
8. **Tests pass** -- Unit tests for schemas, anchoring, popover logic

## Content Features

### GitHub-Flavored Markdown

Comments are stored as plain text with GitHub-flavored markdown, rendered at display time:

- **Formatting**: `**bold**`, `*italic*`, `` `code` ``, code blocks with syntax highlighting
- **Lists**: Ordered, unordered, and task lists (`- [ ] todo`)
- **Links**: `[text](url)` and autolinks
- **Blockquotes**: `> quoted text`

### References (parsed at render time)

| Syntax             | Purpose                   | Example                        |
| ------------------ | ------------------------- | ------------------------------ |
| `@username`        | Mention a user            | `@alice what do you think?`    |
| `@did:key:z6Mk...` | Mention by DID            | `@did:key:z6MkpTH...`          |
| `#commentId`       | Reference another comment | `As I noted in #abc123...`     |
| `[[nodeId]]`       | Link to any Node          | `See [[page-xyz]] for context` |

### Pseudo Reply-To

For "replying to @alice" UI without nested threading:

- `replyToUser` - DID of user being replied to
- `replyToCommentId` - Comment being referenced

Stored as metadata, not structural `inReplyTo` nesting.

### Ordering

- **Lamport time** for consistent ordering across all peers
- **Wall time** for human-readable "2 min ago" display

## What's NOT in This Plan

Deferred to future work:

- **Rich text comments** -- Yjs Doc per comment (upgrade path exists if needed)
- **Push notifications** -- @mention triggers push (in-app badges only for now)
- **Other social primitives** -- Like, React, Bookmark, Boost, Pin, Flag (see exploration)
- **Comment permissions** -- Fine-grained ACL beyond Node-level UCAN
- **Comment search** -- Full-text search across all comments
- **Comment export** -- Export threads as markdown/PDF

## Dependencies

| Component         | Depends On                             |
| ----------------- | -------------------------------------- |
| Comment schema    | `@xnet/data` (defineSchema, NodeStore) |
| CommentMark       | `@xnet/editor` (TipTap extensions)     |
| Anchoring (text)  | `yjs` (RelativePosition)               |
| CommentPopover    | `@xnet/ui` (Popover primitive)         |
| Database comments | `@xnet/views` (table/board views)      |
| Canvas comments   | `@xnet/canvas` (canvas package)        |

## Reference Documents

- [0030_UNIVERSAL_SOCIAL_PRIMITIVES.md](../../explorations/0030_[_]_UNIVERSAL_SOCIAL_PRIMITIVES.md) -- Universal social primitives pattern
- [COMMENTING_SYSTEM.md](../../explorations/0014_[x]_COMMENTING_SYSTEM.md) -- Full design exploration
- [TipTap Comments](https://tiptap.dev/docs/comments/getting-started/overview) -- TipTap's approach (reference)
- [Figma Multiplayer](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/) -- Canvas collaboration patterns

---

[Back to Main Plan](../plan00Setup/README.md) | [Start Implementation](./01-comment-schemas.md)
