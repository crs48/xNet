# AI-Collaborative Editing via MCP and Yjs

> Giving AI agents the same power over xNet content that Claude Code has over an Obsidian vault — but with rich text, structured data, canvases, and real-time collaboration. An exploration of MCP server design, headless Yjs editing, and the "AI as a Yjs peer" pattern.

## Context

### The Obsidian Benchmark

When Claude Code operates on an Obsidian vault, it has **total power**: read any file, write any file, search across all files, create new files, edit specific sections. The vault is just a directory of Markdown files — the same abstraction Claude Code uses for code. This makes Obsidian the most AI-accessible knowledge tool that exists today.

xNet stores data differently — structured nodes in a NodeStore (IndexedDB/SQLite) and rich text in Yjs CRDTs (`Y.XmlFragment`). This is better for collaboration and conflict resolution, but it means AI agents can't just `cat` a file. They need a structured API. That API is MCP.

### The Three Tiers of AI Access

| Tier                           | What the AI can do                                                                  | MCP complexity                               | User value                                              |
| ------------------------------ | ----------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------- |
| **1. Node CRUD**               | Create, read, update, delete nodes. Query databases. Manage properties.             | Low — wraps NodeStore                        | High — "add a task," "find all pages tagged X"          |
| **2. Rich text editing**       | Read and write page content as Markdown. Insert, replace, delete sections.          | Medium — Markdown ↔ Y.XmlFragment conversion | Very high — "write a summary," "rewrite this paragraph" |
| **3. Real-time collaboration** | Join a document as a Yjs peer. Stream edits character-by-character. Show AI cursor. | High — Yjs protocol + streaming              | Impressive but niche                                    |

**This exploration focuses on Tiers 1 and 2**, which cover 95% of use cases. Tier 3 (the OpenAI Canvas-style "AI types in real-time") is a future direction discussed at the end.

### Reference: OpenAI Canvas

Lee Byron's talk [**"Teaching Models to Collaborate"**](https://youtu.be/kQSfXSliBzU?si=m-9lY0S-hGCaSk6y) (Sync Conf 2025, San Francisco — [auto-generated captions available on YouTube](https://www.youtube.com/watch?v=kQSfXSliBzU)) describes how OpenAI built ChatGPT Canvas. Key insights:

1. **Regex parsing of the token stream** to extract structured editing operations as the model generates them
2. **Custom document representation** — the model doesn't see HTML, it sees a simplified format and emits operations like "replace lines 5-10"
3. **Simulated typing** — tokens are buffered and replayed at human speed so edits appear natural
4. **Synced state** — the model's view of the document stays consistent with the user's view, even during concurrent editing

This is relevant to xNet because we already have the real-time sync infrastructure (Yjs + WebSocket relay) — we just need to let AI agents connect to it.

## Part 1: How xNet Stores Content Today

### The Y.Doc Structure

Every xNet node with `document: 'yjs'` in its schema gets a `Y.Doc`. The internal structure depends on the content type:

**Page (rich text)**:

```
Y.Doc (guid: nodeId)
├── Y.XmlFragment('content')     ← TipTap/ProseMirror rich text
│     ├── Y.XmlElement('paragraph')
│     │     └── Y.XmlText("Hello world")
│     ├── Y.XmlElement('heading', { level: 2 })
│     │     └── Y.XmlText("Section title")
│     ├── Y.XmlElement('bulletList')
│     │     └── Y.XmlElement('listItem')
│     │           └── Y.XmlElement('paragraph')
│     │                 └── Y.XmlText("Item 1")
│     └── ...
│
└── Y.Map('meta')                ← NodeStore property cache
      ├── '_schemaId' → 'xnet://xnet.fyi/Page'
      ├── 'title' → 'My Page Title'
      └── 'icon' → '📝'
```

**Canvas**:

```
Y.Doc (guid: nodeId)
├── Y.Map('nodes')               ← { nodeId: CanvasNode (plain JSON) }
├── Y.Map('edges')               ← { edgeId: CanvasEdge (plain JSON) }
├── Y.Map('metadata')            ← { title, created, updated }
└── Y.Map('meta')                ← NodeStore property cache
```

**Database**:

```
Y.Doc (guid: nodeId)
├── Y.Map('data')                ← Database rows, view configs
├── Y.Map('meta')                ← NodeStore property cache
└── ...
```

### The Dual Storage System

xNet uses **two parallel storage systems**:

| Data                                                       | Storage                        | Sync                                   | Conflict Resolution   |
| ---------------------------------------------------------- | ------------------------------ | -------------------------------------- | --------------------- |
| Structured properties (title, status, due date, relations) | NodeStore (IndexedDB/SQLite)   | Signed `Change<T>` with Lamport clocks | Per-field LWW         |
| Rich text content                                          | Y.Doc binary state             | Yjs CRDT protocol                      | Character-level merge |
| Canvas elements                                            | Y.Doc (Y.Map with JSON values) | Yjs CRDT protocol                      | Object-level LWW      |

The `Y.Map('meta')` inside each Y.Doc is a **read-only mirror** of NodeStore properties, maintained by the MetaBridge for sync purposes. Property updates MUST go through the NodeStore (which signs them with Ed25519).

### What This Means for MCP

An MCP server for xNet needs to interact with BOTH systems:

1. **NodeStore** for structured data (creating nodes, updating properties, querying)
2. **Y.Doc** for content (reading/writing rich text, canvas elements, database rows)

The NodeStore already has a clean async API. The Y.Doc requires either:

- **Headless Yjs manipulation** (create a Y.Doc, modify it, encode as binary update)
- **Markdown ↔ Y.XmlFragment conversion** (for human/AI-friendly content representation)

## Part 2: Prior Art — How Other Tools Expose AI Editing

### Obsidian + Claude Code

**Approach**: File system. All content is Markdown files. Claude Code reads/writes them directly.

**Strengths**: Zero friction, full power, no special API needed.
**Weaknesses**: No real-time collaboration. Merge conflicts on concurrent edits. Can't represent rich formatting that Markdown doesn't support. File renames break links.

### Notion MCP Server (community)

Several community MCP servers exist for Notion. They expose:

- `search_pages(query)` — full-text search
- `get_page(id)` — read page content as Markdown (converted from Notion blocks)
- `create_page(parent_id, title, content)` — create with Markdown content
- `update_page(id, content)` — full content replacement
- `append_to_page(id, content)` — append Markdown to existing page
- `query_database(database_id, filter, sort)` — Notion database queries
- `create_database_entry(database_id, properties)` — add rows

**Key insight**: Notion converts its proprietary block format to/from Markdown for the MCP interface. The AI never sees Notion's internal JSON — it works with Markdown. This is the right pattern for xNet.

### tldraw + AI (makereal)

tldraw's "Make Real" feature lets AI generate and modify canvas elements:

- AI reads the canvas state as a JSON description of shapes
- AI outputs new/modified shapes as JSON
- tldraw applies the changes to its Yjs-backed store

**Key insight**: For canvas/structured content, JSON is the right format (not Markdown).

### Cursor / Windsurf / Claude Code

Code editors give AI access via:

- Read file contents (equivalent to our "get page content")
- Edit file ranges (equivalent to our "replace section")
- Search across files (equivalent to our "search pages")
- Apply diffs (equivalent to our "apply content patch")

The pattern is: **read the full document → AI proposes changes → apply targeted edits**. Not "stream characters." This is Tier 2 in our framework.

### Summary

Every successful AI-tool integration converges on the same pattern:

1. **Read** content in a human-readable format (Markdown for text, JSON for structured data)
2. **Write** content by replacing or appending, not by streaming characters
3. **Search** across all content
4. **Structured queries** for database-like content
5. Content format conversion happens **inside the tool**, not in the AI

## Part 3: The xNet MCP Server Design

### Package Structure

```
packages/mcp/
├── src/
│   ├── index.ts              # Entry point (stdio or HTTP transport)
│   ├── server.ts             # MCP server setup, tool registration
│   ├── tools/
│   │   ├── nodes.ts          # Tier 1: Node CRUD + query
│   │   ├── pages.ts          # Tier 2: Rich text read/write
│   │   ├── canvas.ts         # Tier 2: Canvas element manipulation
│   │   ├── database.ts       # Tier 1/2: Database query + row editing
│   │   ├── search.ts         # Full-text search across all content
│   │   └── workspace.ts      # Workspace info, schema listing
│   ├── converters/
│   │   ├── yjs-to-markdown.ts    # Y.XmlFragment → Markdown
│   │   ├── markdown-to-yjs.ts    # Markdown → Y.XmlFragment operations
│   │   └── canvas-json.ts        # Canvas ↔ JSON
│   └── bridge.ts             # Connects to running xNet instance
├── package.json
└── tsconfig.json
```

### Connection Architecture

The MCP server needs access to the NodeStore and Y.Doc storage. Three options:

**Option A: In-process (Electron main/utility process)**

```
Claude Code ──stdio──► MCP Server (in utility process)
                            │
                            ├── NodeStore (direct access)
                            ├── SQLite (direct access)
                            └── Y.Doc pool (direct access)
```

Best for Electron. The MCP server runs as a child process spawned by the Electron app, sharing the same database. Zero IPC overhead for data access.

**Option B: HTTP bridge (standalone)**

```
Claude Code ──stdio──► MCP Server ──HTTP──► xNet Local API (port 31415)
                                                │
                                                ├── NodeStore
                                                └── Y.Doc storage
```

Works with any running xNet instance. The Local API (`apps/electron/src/main/local-api.ts`) already exists on port 31415 — it just needs to be extended with content editing endpoints.

**Option C: Direct storage access (headless)**

```
Claude Code ──stdio──► MCP Server (standalone Node.js process)
                            │
                            ├── SQLite (same DB file)
                            └── IndexedDB (via fake-indexeddb or direct file)
```

Works without xNet running. The MCP server opens the same database files directly. Dangerous for concurrent access but useful for offline/batch operations.

**Recommendation**: Start with **Option B** (HTTP bridge) because the Local API already exists. Move to **Option A** when the utility process architecture from [Exploration 0043](./0043_OFF_MAIN_THREAD_ARCHITECTURE.md) is built.

### Tier 1 Tools: Node CRUD + Query

These tools wrap the NodeStore. No Y.Doc access needed.

#### `xnet_list_schemas`

```typescript
// Returns all registered schemas with their properties
{
  schemas: [
    {
      id: 'xnet://xnet.fyi/Task',
      name: 'Task',
      properties: [
        { name: 'title', type: 'text', required: true },
        { name: 'status', type: 'select', options: ['todo', 'in_progress', 'done'] },
        { name: 'parent', type: 'relation', target: 'xnet://xnet.fyi/Task' },
        { name: 'assignee', type: 'person' }
      ],
      hasDocument: true // whether this schema has Y.Doc content
    }
  ]
}
```

#### `xnet_query_nodes`

```typescript
// Parameters
{
  schema: "Task",                    // schema name or IRI
  where?: {                          // property filters
    status: "todo",
    assignee: "did:key:z6Mk..."
  },
  orderBy?: { createdAt: "desc" },
  limit?: 50,
  offset?: 0,
  include_content?: boolean          // if true, include Markdown body for pages
}

// Returns
{
  nodes: [{
    id: "abc-123",
    schema: "Task",
    properties: {
      title: "Fix the bug",
      status: "todo",
      assignee: "did:key:z6Mk...",
      parent: "def-456"
    },
    content?: "# Fix the bug\n\nThis task is about...",  // if include_content
    createdAt: "2026-01-15T10:30:00Z",
    updatedAt: "2026-01-20T14:22:00Z"
  }],
  total: 42
}
```

#### `xnet_create_node`

```typescript
// Parameters
{
  schema: "Task",
  properties: {
    title: "New task from AI",
    status: "todo",
    parent: "project-123"
  },
  content?: "# Task Description\n\nDetails here..."  // Markdown, for schemas with Y.Doc
}

// Returns
{ id: "new-node-id", createdAt: "..." }
```

#### `xnet_update_node`

```typescript
// Parameters
{
  id: "abc-123",
  properties?: {           // only include properties to change
    status: "done"
  }
}

// Returns
{ success: true, updatedAt: "..." }
```

#### `xnet_delete_node`

```typescript
// Parameters
{
  id: 'abc-123'
}

// Returns
{
  success: true
}
```

### Tier 2 Tools: Rich Text Editing

These tools interact with Y.Doc content via Markdown conversion.

#### `xnet_get_page_content`

```typescript
// Parameters
{
  id: "page-123",
  format?: "markdown" | "plain_text"   // default: markdown
}

// Returns
{
  id: "page-123",
  title: "My Page",
  content: "# My Page\n\nSome **bold** text and a [link](https://...).\n\n## Section 2\n\n- Item 1\n- Item 2\n",
  word_count: 42,
  last_edited: "2026-01-20T14:22:00Z"
}
```

**How this works internally**:

1. Load the Y.Doc from storage (`store.getDocumentContent(nodeId)`)
2. Create a `Y.Doc`, apply the stored binary state
3. Walk the `Y.XmlFragment('content')` tree
4. Convert each `Y.XmlElement` / `Y.XmlText` to Markdown
5. Return the Markdown string

#### `xnet_update_page_content`

```typescript
// Parameters
{
  id: "page-123",

  // Option 1: Replace entire content
  content?: "# New Content\n\nFull replacement.",

  // Option 2: Targeted edits (more efficient, preserves undo history)
  operations?: [
    { type: "append", content: "\n\n## New Section\n\nAppended text." },
    { type: "prepend", content: "Note: This page was updated by AI.\n\n" },
    {
      type: "replace",
      search: "## Old Section Title",     // text to find
      replace: "## Updated Section Title"  // replacement text
    },
    {
      type: "insert_after",
      search: "## Section 2",
      content: "\nNew paragraph after Section 2.\n"
    },
    {
      type: "delete",
      search: "## Section to Remove"       // deletes from heading to next heading
    }
  ]
}

// Returns
{ success: true, updatedAt: "..." }
```

**How `operations` work internally**:

For each operation, the MCP server:

1. Loads the Y.Doc
2. Walks the `Y.XmlFragment('content')` to find the target location
3. Performs the Yjs edit operation (`Y.XmlText.insert`, `Y.XmlElement.delete`, etc.)
4. Encodes the update (`Y.encodeStateAsUpdate`)
5. Stores the new state

**Why targeted edits matter**: Full content replacement destroys Yjs CRDT history. If a human is simultaneously editing the same document, their changes would be lost. Targeted edits (append, insert_after, replace) generate minimal Yjs operations that merge correctly with concurrent human edits.

#### `xnet_search`

```typescript
// Parameters
{
  query: "authentication bug",
  schemas?: ["Page", "Task"],        // filter by schema type
  limit?: 20
}

// Returns
{
  results: [{
    id: "page-456",
    schema: "Page",
    title: "Auth System Design",
    excerpt: "...the **authentication** **bug** was caused by...",
    score: 0.95,
    properties: { /* all properties */ }
  }]
}
```

### Tier 2 Tools: Canvas Editing

#### `xnet_get_canvas`

```typescript
// Parameters
{ id: "canvas-123" }

// Returns
{
  id: "canvas-123",
  title: "Architecture Diagram",
  nodes: [{
    id: "node-1",
    type: "card",
    linkedNodeId: "page-456",
    position: { x: 100, y: 200, width: 300, height: 200 },
    properties: { title: "Auth Service", color: "blue" }
  }],
  edges: [{
    id: "edge-1",
    source: "node-1",
    target: "node-2",
    label: "calls"
  }]
}
```

#### `xnet_update_canvas`

```typescript
// Parameters
{
  id: "canvas-123",
  add_nodes?: [{ type: "card", position: { x: 400, y: 200, width: 200, height: 150 }, properties: { title: "New Service" } }],
  update_nodes?: [{ id: "node-1", position: { x: 150, y: 250 } }],
  remove_nodes?: ["node-3"],
  add_edges?: [{ source: "node-1", target: "node-4", label: "depends on" }],
  remove_edges?: ["edge-2"]
}
```

### Tier 2 Tools: Database Editing

#### `xnet_query_database`

```typescript
// Parameters
{
  id: "db-123",              // database node ID
  filter?: {
    and: [
      { property: "Status", operator: "equals", value: "Active" },
      { property: "Priority", operator: "gte", value: 3 }
    ]
  },
  sort?: [{ property: "Created", direction: "desc" }],
  limit?: 100
}

// Returns
{
  schema: { /* database schema with all columns */ },
  rows: [{
    id: "row-1",
    properties: { Name: "Alice", Status: "Active", Priority: 5 }
  }],
  total: 42
}
```

## Part 4: The Markdown ↔ Y.XmlFragment Converter

This is the hardest and most important piece. It bridges the gap between what AI agents work with (Markdown) and what xNet stores (Y.XmlFragment CRDT).

### Y.XmlFragment → Markdown (Reading)

Walk the Y.XmlFragment tree and emit Markdown:

````typescript
function xmlFragmentToMarkdown(fragment: Y.XmlFragment): string {
  const lines: string[] = []

  for (const child of fragment.toArray()) {
    if (child instanceof Y.XmlElement) {
      lines.push(xmlElementToMarkdown(child))
    } else if (child instanceof Y.XmlText) {
      lines.push(xmlTextToMarkdown(child))
    }
  }

  return lines.join('\n\n')
}

function xmlElementToMarkdown(el: Y.XmlElement): string {
  const tag = el.nodeName
  const attrs = el.getAttributes()

  switch (tag) {
    case 'paragraph':
      return childrenToInlineMarkdown(el)

    case 'heading':
      const level = attrs.level || 1
      return '#'.repeat(level) + ' ' + childrenToInlineMarkdown(el)

    case 'bulletList':
      return el
        .toArray()
        .map(
          (item) => '- ' + xmlElementToMarkdown(item) // listItem → paragraph
        )
        .join('\n')

    case 'orderedList':
      return el
        .toArray()
        .map((item, i) => `${i + 1}. ` + xmlElementToMarkdown(item))
        .join('\n')

    case 'listItem':
      return el
        .toArray()
        .map((child) => xmlElementToMarkdown(child))
        .join('\n')

    case 'codeBlock':
      const lang = attrs.language || ''
      return '```' + lang + '\n' + childrenToPlainText(el) + '\n```'

    case 'blockquote':
      return el
        .toArray()
        .map((child) => '> ' + xmlElementToMarkdown(child))
        .join('\n')

    case 'horizontalRule':
      return '---'

    case 'taskList':
      return el
        .toArray()
        .map((item) => {
          const checked = item.getAttribute('checked') ? 'x' : ' '
          return `- [${checked}] ` + childrenToInlineMarkdown(item)
        })
        .join('\n')

    case 'table':
      return tableToMarkdown(el)

    case 'image':
      return `![${attrs.alt || ''}](${attrs.src})`

    default:
      // Unknown block type — render as HTML comment
      return `<!-- xnet:${tag} -->\n` + childrenToPlainText(el) + '\n<!-- /xnet -->'
  }
}

function childrenToInlineMarkdown(el: Y.XmlElement): string {
  let result = ''
  for (const child of el.toArray()) {
    if (child instanceof Y.XmlText) {
      // Y.XmlText stores formatting as delta attributes
      const delta = child.toDelta()
      for (const op of delta) {
        let text = op.insert as string
        const attrs = op.attributes || {}
        if (attrs.bold) text = `**${text}**`
        if (attrs.italic) text = `*${text}*`
        if (attrs.code) text = '`' + text + '`'
        if (attrs.strike) text = `~~${text}~~`
        if (attrs.link) text = `[${text}](${attrs.link.href})`
        result += text
      }
    }
  }
  return result
}
````

### Markdown → Y.XmlFragment Operations (Writing)

This is harder. We can't just "set" the Y.XmlFragment to new content — that would destroy CRDT history and break concurrent editing. Instead, we need to:

1. Parse the incoming Markdown into an AST
2. Diff the AST against the current Y.XmlFragment state
3. Generate minimal Yjs operations (insert, delete, format)

**For full content replacement** (simple but lossy):

```typescript
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'

function replaceContent(fragment: Y.XmlFragment, markdown: string): void {
  // Parse markdown to AST
  const ast = unified().use(remarkParse).use(remarkGfm).parse(markdown)

  // Clear existing content
  while (fragment.length > 0) {
    fragment.delete(0, 1)
  }

  // Build Y.XmlElement tree from AST
  for (const node of ast.children) {
    const yElement = astNodeToYxml(node)
    if (yElement) {
      fragment.push([yElement])
    }
  }
}

function astNodeToYxml(node: MdastNode): Y.XmlElement | null {
  switch (node.type) {
    case 'paragraph': {
      const el = new Y.XmlElement('paragraph')
      const text = new Y.XmlText()
      inlineNodesToYText(text, node.children)
      el.push([text])
      return el
    }
    case 'heading': {
      const el = new Y.XmlElement('heading')
      el.setAttribute('level', node.depth)
      const text = new Y.XmlText()
      inlineNodesToYText(text, node.children)
      el.push([text])
      return el
    }
    // ... etc for each node type
  }
}
```

**For targeted edits** (preserves CRDT history):

```typescript
function appendContent(fragment: Y.XmlFragment, markdown: string): void {
  const ast = unified().use(remarkParse).use(remarkGfm).parse(markdown)
  for (const node of ast.children) {
    const yElement = astNodeToYxml(node)
    if (yElement) fragment.push([yElement])
  }
}

function insertAfterHeading(
  fragment: Y.XmlFragment,
  headingText: string,
  markdown: string
): boolean {
  // Find the heading
  for (let i = 0; i < fragment.length; i++) {
    const child = fragment.get(i)
    if (child instanceof Y.XmlElement && child.nodeName === 'heading') {
      const text = xmlElementToPlainText(child)
      if (text.includes(headingText)) {
        // Parse new content and insert after this heading
        const ast = unified().use(remarkParse).use(remarkGfm).parse(markdown)
        const elements = ast.children.map(astNodeToYxml).filter(Boolean)
        fragment.insert(i + 1, elements)
        return true
      }
    }
  }
  return false
}

function replaceSection(fragment: Y.XmlFragment, headingText: string, markdown: string): boolean {
  // Find section start (heading) and end (next heading of same or higher level)
  let startIdx = -1
  let endIdx = -1
  let level = 0

  for (let i = 0; i < fragment.length; i++) {
    const child = fragment.get(i)
    if (child instanceof Y.XmlElement && child.nodeName === 'heading') {
      const text = xmlElementToPlainText(child)
      if (startIdx === -1 && text.includes(headingText)) {
        startIdx = i
        level = child.getAttribute('level') || 1
      } else if (startIdx !== -1) {
        const thisLevel = child.getAttribute('level') || 1
        if (thisLevel <= level) {
          endIdx = i
          break
        }
      }
    }
  }

  if (startIdx === -1) return false
  if (endIdx === -1) endIdx = fragment.length

  // Delete old section
  fragment.delete(startIdx, endIdx - startIdx)

  // Insert new content
  const ast = unified().use(remarkParse).use(remarkGfm).parse(markdown)
  const elements = ast.children.map(astNodeToYxml).filter(Boolean)
  fragment.insert(startIdx, elements)

  return true
}
```

### Headless Yjs: No DOM Required

The critical insight is that **Yjs does not need a DOM**. Y.XmlFragment, Y.XmlElement, and Y.XmlText are pure data structures that happen to mirror XML/DOM concepts. You can create, manipulate, and serialize them in a plain Node.js process:

```typescript
import * as Y from 'yjs'

// Create a Y.Doc and manipulate it headlessly
const ydoc = new Y.Doc()
const fragment = ydoc.getXmlFragment('content')

// Add a heading
const heading = new Y.XmlElement('heading')
heading.setAttribute('level', 1)
const headingText = new Y.XmlText()
headingText.insert(0, 'Hello from AI')
heading.push([headingText])
fragment.push([heading])

// Add a paragraph with formatting
const para = new Y.XmlElement('paragraph')
const paraText = new Y.XmlText()
paraText.insert(0, 'This is ', { bold: null })
paraText.insert(8, 'bold', { bold: true })
paraText.insert(12, ' text.', { bold: null })
para.push([paraText])
fragment.push([para])

// Serialize for storage
const update = Y.encodeStateAsUpdate(ydoc)
// This binary update can be stored and later applied to any other Y.Doc
```

This is the foundation of the MCP server's content editing: it creates a Y.Doc, loads the existing state, applies Markdown-driven edits, and saves the result — all without a browser or DOM.

## Part 5: The "AI as Yjs Peer" Pattern (Tier 3)

### How It Would Work

Instead of the MCP tool returning a result and being done, the AI would **join the document's collaboration session** as a persistent peer:

```
User's Browser                       AI Agent (MCP)
┌──────────────┐                    ┌──────────────┐
│ TipTap Editor │                   │ Headless      │
│ Y.Doc         │                   │ Y.Doc         │
│               │                   │               │
│ ↕ Yjs sync    │                   │ ↕ Yjs sync    │
└───────┬───────┘                   └───────┬───────┘
        │                                   │
        └──────── Signaling Server ─────────┘
                  (WebSocket relay)
```

The AI's Y.Doc would sync via the same signaling server that human peers use. When the AI inserts text into its Y.Doc, the Yjs CRDT sync protocol automatically propagates the change to all connected clients. The user sees the AI's cursor appear (via Awareness protocol) and text appear character by character.

### Token Stream → Yjs Operations Pipeline

```
LLM token stream ("The quick brown fox...")
    │
    ▼
┌──────────────────────┐
│  Token buffer         │  Accumulates tokens until a "word" or "sentence" boundary
│                       │  Configurable: character-by-character or word-by-word
└────────┬─────────────┘
         │
         ▼
┌──────────────────────┐
│  Operation mapper     │  Maps accumulated text to Y.XmlText.insert() calls
│                       │  Handles formatting: if model outputs **bold**, detect
│                       │  and apply bold attribute
└────────┬─────────────┘
         │
         ▼
┌──────────────────────┐
│  Y.Doc mutation       │  Applies insert/format to the AI's local Y.Doc
│                       │  Yjs sync protocol automatically propagates
└────────┬─────────────┘
         │
         ▼
┌──────────────────────┐
│  Awareness update     │  Updates cursor position in Yjs Awareness
│                       │  Other clients see the AI's cursor moving
└──────────────────────┘
```

### Why This Is Hard (and Usually Not Worth It)

1. **MCP is request/response**, not streaming. The AI calls a tool, gets a result, and plans its next action. There's no built-in way to "keep a connection open and stream edits." You'd need to either extend MCP or use a separate WebSocket channel.

2. **LLM latency**: Even fast models take 50-200ms per token. Simulating "typing" at this speed looks unnaturally slow compared to real typing (which is 50-100ms per character for fast typists).

3. **Error recovery**: If the AI hallucinates mid-edit, you've already streamed half the content to other users. With the Tier 2 approach (full edit → apply), you can validate before applying.

4. **Complexity**: Managing a persistent Yjs connection, Awareness state, and streaming parser is an order of magnitude more complex than the Tier 2 tool approach.

**Recommendation**: Build Tier 1 and 2 first. They cover 95% of use cases. Tier 3 is a future exploration when MCP or the AI infrastructure supports streaming tool execution.

## Part 6: Comparison — xNet MCP vs Obsidian Vault Access

| Capability            | Obsidian (files)           | xNet MCP (Tier 1+2)                                                                |
| --------------------- | -------------------------- | ---------------------------------------------------------------------------------- |
| Read page content     | `cat page.md`              | `xnet_get_page_content(id)`                                                        |
| Write page content    | `echo > page.md`           | `xnet_update_page_content(id, content)`                                            |
| Search all pages      | `grep -r "query" vault/`   | `xnet_search(query)`                                                               |
| Create new page       | `touch page.md`            | `xnet_create_node(schema, props, content)`                                         |
| Edit specific section | `sed` or file edit         | `xnet_update_page_content(id, operations: [{ type: "replace", search, replace }])` |
| List all pages        | `find vault/ -name "*.md"` | `xnet_query_nodes(schema: "Page")`                                                 |
| Query structured data | Parse YAML frontmatter     | `xnet_query_nodes(schema: "Task", where: { status: "todo" })`                      |
| Update metadata       | Edit frontmatter           | `xnet_update_node(id, properties: { status: "done" })`                             |
| Backlinks             | grep for `[[page]]`        | `xnet_query_nodes(where: { target: pageId })` (via relation index)                 |
| Rich text formatting  | Native (Markdown)          | Converted (Markdown ↔ Y.XmlFragment)                                               |
| Real-time collab      | Not supported              | Automatic (Yjs CRDT merge)                                                         |
| Conflict resolution   | Manual (git merge)         | Automatic (CRDT)                                                                   |
| Canvas editing        | Not applicable             | `xnet_update_canvas(id, add_nodes, add_edges)`                                     |
| Database queries      | Not applicable             | `xnet_query_database(id, filter, sort)`                                            |

**Key advantage of xNet over Obsidian**: AI edits are CRDT operations. If a human is editing the same page simultaneously, the edits merge automatically. No lock files, no conflicts, no "file changed on disk" warnings.

**Key advantage of Obsidian over xNet**: Zero setup. Claude Code already knows how to read/write files. xNet requires installing the MCP server.

## Part 7: Plugin Development via MCP

An MCP server that understands xNet's plugin system could let AI agents **create and manage plugins**:

```typescript
// AI creates a new database view plugin
xnet_create_plugin({
  name: 'kanban-view',
  type: 'database-view',
  description: 'Kanban board view for databases with a Status column',
  code: `
    export default function KanbanView({ rows, schema }) {
      const statusCol = schema.properties.find(p => p.name === 'Status')
      const columns = statusCol?.options || ['Todo', 'In Progress', 'Done']
      // ... React component code
    }
  `
})
```

This is powerful but requires the plugin system from [Exploration 0006](./0006_PLUGIN_ARCHITECTURE.md) to be built first. For now, the MCP server should expose node/content CRUD.

## Part 8: Implementation Roadmap

### Phase 1: Node CRUD (1-2 weeks)

Build `packages/mcp/` with Tier 1 tools:

- `xnet_list_schemas`
- `xnet_query_nodes`
- `xnet_create_node`
- `xnet_update_node`
- `xnet_delete_node`
- `xnet_search`

Connect via HTTP to the existing Local API (port 31415). Extend the Local API as needed.

**This alone makes xNet useful for AI agents.** Creating tasks, querying databases, updating statuses — all the structured data operations that currently require the UI.

### Phase 2: Markdown Converter (2-3 weeks)

Build `yjs-to-markdown.ts` and `markdown-to-yjs.ts`:

- Handle all ProseMirror node types used by the TipTap editor
- Support roundtrip conversion (Markdown → Y.XmlFragment → Markdown ≈ original)
- Handle unsupported content gracefully (preserve as HTML comments)

Add Tier 2 tools:

- `xnet_get_page_content`
- `xnet_update_page_content` (with `operations` support)

### Phase 3: Canvas + Database Tools (1-2 weeks)

- `xnet_get_canvas` / `xnet_update_canvas`
- `xnet_query_database` / `xnet_create_database_entry` / `xnet_update_database_entry`

### Phase 4: In-Process MCP for Electron (1 week)

Move from HTTP bridge to in-process execution in the Electron utility process (per [Exploration 0043](./0043_OFF_MAIN_THREAD_ARCHITECTURE.md)). This eliminates HTTP overhead and gives direct access to NodeStore and Y.Doc storage.

### Phase 5 (Future): Streaming Collaboration (Tier 3)

If MCP evolves to support streaming tools, or if we build a separate WebSocket channel for AI collaboration, implement the "AI as Yjs peer" pattern from Part 5.

## Open Questions

1. **Markdown fidelity**: How lossy is the Y.XmlFragment → Markdown → Y.XmlFragment roundtrip? Some ProseMirror features (custom blocks, embeds, mentions) don't have standard Markdown equivalents. Should we use extended Markdown (MDX? custom directives?) or accept some loss?

2. **Authentication**: The MCP server runs locally, so localhost-only access is probably fine for v1. But if we want remote AI agents (cloud-hosted Claude, ChatGPT plugins), we need token auth. How does this interact with xNet's DID-based identity?

3. **Rate limiting**: AI agents can generate mutations much faster than humans. Should the MCP server rate-limit writes? The NodeStore already signs every change — 100 creates/second means 100 Ed25519 signatures.

4. **Undo integration**: If the AI makes a bad edit via MCP, can the user undo it? Yjs has undo manager, but it tracks by origin. MCP edits should use a distinct origin ("mcp-agent") so they can be undone as a group.

5. **Content length limits**: MCP tool results have practical token limits (Claude's context window). A 50,000-word page can't be returned as a single Markdown string. Should `xnet_get_page_content` support pagination (e.g., return sections)?

6. **Concurrent MCP access**: If two AI agents (or the same agent in two sessions) edit the same page simultaneously via MCP, the Yjs CRDT handles merging. But should the MCP server warn about concurrent access? Or is silent merge the right behavior?

7. **Schema-aware AI**: Should the MCP server include schema information in tool descriptions so the AI knows what properties are valid? E.g., the `xnet_create_node` tool description could dynamically list the properties for the chosen schema.

8. **Diff-based editing**: Instead of search-and-replace, should Tier 2 support unified diff format? AI models are good at generating diffs. The MCP server could parse the diff and apply it as targeted Y.XmlFragment operations.

## Conclusion

The xNet MCP server transforms xNet from a UI-only application into a programmable knowledge platform. The three-tier approach (Node CRUD → Rich text editing → Real-time collaboration) lets us ship value incrementally:

- **Tier 1** (Node CRUD) is straightforward — it's a thin wrapper around NodeStore with JSON serialization. An AI agent with Tier 1 access can already manage tasks, query databases, create pages, and update properties. This is equivalent to what Notion's community MCP servers provide.

- **Tier 2** (Rich text via Markdown) is the key differentiator. The Markdown ↔ Y.XmlFragment converter lets AI agents read and write rich text content naturally, while preserving the CRDT benefits (concurrent editing, offline support, merge without conflicts). This gives AI agents Obsidian-level power over xNet content.

- **Tier 3** (Real-time collaboration) is the future vision — inspired by OpenAI Canvas, but built on standard CRDT infrastructure (Yjs) rather than a proprietary sync protocol. When MCP or AI infrastructure supports streaming, xNet is uniquely positioned to offer it because the collaborative editing primitives already exist.

The Markdown converter is the hardest technical piece. Everything else is plumbing. Build that well, and xNet becomes the most AI-accessible local-first knowledge platform available.
