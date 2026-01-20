# 07: Base Type Naming Research

> Comprehensive research on alternatives to "Document" for the unified container type

**Status:** Research complete, decision pending

## The Problem

We need a name for the base type that encompasses:

- **Page** - rich text documents
- **Database** - schema definitions
- **Item** - rows in a database
- **Canvas** - spatial layouts

The term "Document" creates confusion because:

1. In common usage, "document" = "a page/file" (like a Word doc)
2. We already have `Page` as a subtype
3. Users might think Page and Document are synonymous
4. "Document" implies text-focused, but Database and Canvas aren't text

---

## Research Across Domains

### 1. Database/Data Systems

| Term         | System             | Meaning                           | Fit for xNet                        |
| ------------ | ------------------ | --------------------------------- | ----------------------------------- |
| **Entity**   | Datomic            | Collection of facts sharing an ID | ⭐⭐⭐⭐ Good - universal, flexible |
| **Datom**    | Datomic            | Atomic fact (E-A-V-T)             | ❌ Too granular                     |
| **Document** | MongoDB, CouchDB   | JSON object, primary data unit    | ⭐⭐⭐ Current term                 |
| **Entry**    | Contentful, Strapi | Content item based on type        | ⭐⭐⭐ Simple but generic           |

**Datomic's Approach:**

- A **datom** is atomic: `[entity-id, attribute, value, transaction]`
- An **entity** is a collection of datoms with the same entity-id
- You asked about this - datom doesn't fit because our "documents" aren't atomic

### 2. Knowledge Management

| Term         | System           | Meaning                              | Fit for xNet         |
| ------------ | ---------------- | ------------------------------------ | -------------------- |
| **Node**     | Tana, Roam       | Universal unit, everything is a node | ⭐⭐⭐⭐⭐ Excellent |
| **Block**    | Notion, Roam     | Smallest addressable content unit    | ❌ Too granular      |
| **Page**     | Notion, Obsidian | Container for blocks                 | ❌ Already a subtype |
| **Supertag** | Tana             | Type classification for nodes        | ❌ Different purpose |

**Tana's Model:**

- Everything is a **node** - a bullet, a page, a database row
- **Supertags** add type to nodes (like making a node a "Task")
- Fields on supertags define schema
- This is very close to our model!

### 3. Graph Databases

| Term       | System        | Meaning                           | Fit for xNet          |
| ---------- | ------------- | --------------------------------- | --------------------- |
| **Node**   | Neo4j, Dgraph | Entity with labels and properties | ⭐⭐⭐⭐⭐ Universal  |
| **Thing**  | TypeDB        | Root type, everything is a thing  | ⭐⭐ Too casual       |
| **Vertex** | Graph theory  | Point in a graph                  | ⭐⭐ Too mathematical |

### 4. Semantic Web / RDF

| Term         | System      | Meaning                      | Fit for xNet                             |
| ------------ | ----------- | ---------------------------- | ---------------------------------------- |
| **Resource** | RDF, W3C    | Anything identifiable by URI | ⭐⭐⭐⭐ Strong - implies addressability |
| **Thing**    | Schema.org  | Root type of all things      | ⭐⭐⭐ Standard but casual               |
| **Subject**  | RDF triples | The thing being described    | ⭐⭐ Too abstract                        |

**W3C/RDF Approach:**

- A **resource** is anything with identity (URI/IRI)
- Fits perfectly with our `xnet://did:key:.../` addressing
- JSON-LD uses this terminology

### 5. Content Systems

| Term         | System     | Meaning              | Fit for xNet      |
| ------------ | ---------- | -------------------- | ----------------- |
| **Entry**    | Contentful | Content item         | ⭐⭐⭐ Generic    |
| **Document** | Sanity     | Schema-typed content | ⭐⭐⭐ Same issue |
| **Asset**    | Various    | Binary/media files   | ❌ Wrong meaning  |

### 6. Programming Languages

| Term       | Language          | Meaning                  | Fit for xNet                        |
| ---------- | ----------------- | ------------------------ | ----------------------------------- |
| **Object** | JS/TS             | Key-value structure      | ⭐⭐ Overloaded                     |
| **Record** | TS, Rust, Clojure | Typed field collection   | ⭐⭐⭐ Conflicts with @xnet/records |
| **Struct** | Rust, C, Go       | Product type with fields | ⭐⭐ Too low-level                  |
| **Map**    | Clojure           | Associative data         | ⭐⭐ Too generic                    |

### 7. File Systems

| Term      | System | Meaning             | Fit for xNet           |
| --------- | ------ | ------------------- | ---------------------- |
| **Inode** | UNIX   | Metadata structure  | ⭐ Too low-level       |
| **File**  | Plan 9 | Universal interface | ⭐⭐ Wrong connotation |

### 8. Academic/Information Science

| Term         | Domain            | Meaning                     | Fit for xNet            |
| ------------ | ----------------- | --------------------------- | ----------------------- |
| **Artifact** | Software/History  | Human-made object           | ⭐⭐⭐ Implies creation |
| **Object**   | Digital libraries | Storable/retrievable entity | ⭐⭐ Overloaded         |
| **Unit**     | General           | Single complete thing       | ⭐⭐ Too abstract       |

---

## Analysis of Top Candidates

### Node ⭐⭐⭐⭐⭐

**Meaning:** A point in a graph that can have properties and connections.

**Pros:**

- Universal: Page is a Node, Database is a Node, Item is a Node, Canvas is a Node
- Graph semantics: xNet is fundamentally a graph (CRDTs, links, references)
- Industry alignment: Tana, Roam, Neo4j, Dgraph all use this
- No conflicts with existing types
- Implies connectivity and relationships
- Short, memorable

**Cons:**

- Technical connotation (DOM nodes, network nodes, Node.js)
- Might feel "cold" or "programmer-y" to non-technical users
- Less intuitive for end users than "document"

**Usage:**

```typescript
type NodeType = 'page' | 'database' | 'item' | 'canvas'

interface Node {
  id: string
  type: NodeType
  // ...
}
```

---

### Resource ⭐⭐⭐⭐

**Meaning:** Anything identifiable by a URI/IRI in the semantic web.

**Pros:**

- W3C standard terminology
- Implies addressability (fits `xnet://` URI scheme)
- Universal - literally anything can be a resource
- JSON-LD/RDF compatible
- Already used in RESTful API design

**Cons:**

- Overloaded (HTTP resources, system resources, game resources)
- Might confuse with file/system resources
- More abstract than "document"

**Usage:**

```typescript
interface Resource {
  '@id': string // URI
  '@type': ResourceType
  // ...
}
```

---

### Entity ⭐⭐⭐⭐

**Meaning:** A thing that exists independently and can be identified.

**Pros:**

- Database terminology (ER diagrams, Datomic)
- Universal - any identifiable thing
- Familiar to developers
- Works for all our subtypes

**Cons:**

- ER diagram connotation might imply relational modeling
- Slightly corporate/enterprise feeling
- "Entity" often used for game objects

**Usage:**

```typescript
interface Entity {
  entityId: string
  entityType: 'page' | 'database' | 'item' | 'canvas'
  // ...
}
```

---

### Document ⭐⭐⭐ (Current)

**Meaning:** A self-contained unit of content/data.

**Pros:**

- Familiar to everyone
- MongoDB, CouchDB precedent
- Already in use
- Works for unstructured content

**Cons:**

- **Conflicts conceptually with Page** (a "document" is usually text-like)
- Implies text-focused (Database, Canvas aren't text)
- Users might confuse Document and Page
- Overloaded in common usage

---

### Record ⭐⭐⭐

**Meaning:** A collection of named fields with values.

**Pros:**

- Implies structure
- TypeScript `Record<K, V>` is familiar
- Database connotation (a record in a table)

**Cons:**

- **Conflicts with @xnet/records package**
- Implies tabular data specifically
- "Record" sounds like "database row" (we have Item for that)

---

### Entry ⭐⭐⭐

**Meaning:** An item added to a collection.

**Pros:**

- Simple, neutral
- CMS terminology (Contentful, Strapi)
- No conflicts

**Cons:**

- Too generic
- "Entry" sounds like "log entry" or "dictionary entry"
- Doesn't convey the richness of what we're storing

---

### Thing ⭐⭐

**Meaning:** The most generic possible term.

**Pros:**

- Schema.org uses this as root type
- Can't be more universal
- Honest about what it is

**Cons:**

- Too casual/colloquial
- Lacks gravitas
- "What's a Thing?" is not a great developer experience

---

### Content ⭐⭐⭐

**Meaning:** Information/material contained in something.

**Pros:**

- Broad enough for all types
- "Content management" is familiar
- Neutral

**Cons:**

- Usually refers to what's _inside_ something, not the container
- "Content" is the stuff, not the envelope

---

## The Document vs Page Tension

The core issue you identified:

```
Common understanding:     Our model:
┌──────────────┐         ┌──────────────┐
│   Document   │   vs    │   Document   │ ← Base type
│   = a file   │         │   ├── Page   │ ← Rich text
│   = a page   │         │   ├── Database│
└──────────────┘         │   ├── Item   │
                         │   └── Canvas │
                         └──────────────┘
```

A user thinks "I'm editing a document" when they're editing a Page. But our `Document` is the abstract parent type.

---

## Recommendation

### If we want graph semantics: **Node**

```typescript
// Everything is a Node
interface Node {
  id: string
  type: 'page' | 'database' | 'item' | 'canvas'
  // ...
}

// Type-specific interfaces
interface Page extends Node {
  type: 'page'
  content: Y.Doc
}
interface Database extends Node {
  type: 'database'
  schema: PropertyDefinition[]
}
interface Item extends Node {
  type: 'item'
  properties: Record<string, unknown>
}
interface Canvas extends Node {
  type: 'canvas'
  content: Y.Doc
}
```

**Why:** xNet is fundamentally a graph of connected nodes. Documents link to each other, items reference other items, databases contain items. The graph model is central.

### If we want semantic web alignment: **Resource**

```typescript
interface Resource {
  '@id': string // xnet://did:key:z6Mk.../workspace/node-id
  '@type': 'Page' | 'Database' | 'Item' | 'Canvas'
  // ...
}
```

**Why:** JSON-LD compatibility, W3C standards, future interoperability with Solid/ActivityPub.

### If we want to keep it simple: **Document** (status quo)

Keep Document but be very clear in documentation that "Document is the base type, Page is a type of Document."

---

## Decision Matrix

| Criterion           | Node       | Resource   | Entity     | Document |
| ------------------- | ---------- | ---------- | ---------- | -------- |
| Layperson clarity   | ⭐⭐⭐     | ⭐⭐       | ⭐⭐⭐     | ⭐⭐⭐⭐ |
| Technical accuracy  | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐   | ⭐⭐⭐   |
| No subtype conflict | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐     |
| Industry precedent  | ⭐⭐⭐⭐   | ⭐⭐⭐⭐   | ⭐⭐⭐⭐   | ⭐⭐⭐⭐ |
| JSON-LD fit         | ⭐⭐⭐     | ⭐⭐⭐⭐⭐ | ⭐⭐⭐     | ⭐⭐⭐   |
| Short/memorable     | ⭐⭐⭐⭐⭐ | ⭐⭐⭐     | ⭐⭐⭐⭐   | ⭐⭐⭐⭐ |
| **Total**           | **25**     | **25**     | **23**     | **21**   |

---

## Conclusion

**Node** and **Resource** are tied as best alternatives to Document.

- Use **Node** if you want to emphasize the graph/outliner nature of xNet
- Use **Resource** if you want to emphasize semantic web/JSON-LD alignment
- Keep **Document** if the alternatives feel worse and clear docs can resolve ambiguity

**Current decision:** Keep `Document` for now, with option to revisit later.

---

[← Back to Package Naming](./06-package-naming-proposal.md) | [Back to README](./README.md)
