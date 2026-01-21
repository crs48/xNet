# CLAUDE.md - AI Agent Context

## What This Is

**xNet** = Decentralized data infrastructure for the internet. Local-first, P2P-synced, user-owned data.  
**xNotes** = Notion-like productivity app built on xNet. The interface that seeds the global namespace.

> **The Big Picture**: xNet is not just an SDK — it's infrastructure for a new internet where data is user-owned, globally addressable, and works from personal notes to planetary-scale indexes (decentralized search, federated social, etc.). See `docs/VISION.md` for the full vision.

## Data Model (Current)

The xNet data model uses a **schema-first, Node-based architecture**:

- Everything is a `Node` (universal container)
- A `Schema` defines what the Node is (Page, Database, Task, etc.)
- Schemas are defined in code via `defineSchema()` with TypeScript inference
- Schemas use globally unique IRIs: `xnet://xnet.dev/Page`, `xnet://did:key:.../Recipe`

### Sync Strategies

| Data Type              | Package      | Sync Mechanism      | Conflict Resolution   |
| ---------------------- | ------------ | ------------------- | --------------------- |
| Rich text (wiki pages) | `@xnet/data` | Yjs CRDT            | Character-level merge |
| Structured data        | `@xnet/data` | NodeStore + Lamport | Field-level LWW       |

Rich text uses Yjs CRDT for fine-grained character merging. Structured data (Nodes) uses event-sourced changes with Lamport timestamps and last-writer-wins per property.

## Package Map

```
packages/
  core/       # Types, content addressing (CIDs), permissions
  crypto/     # BLAKE3 hashing, Ed25519 signing, XChaCha20 encryption
  identity/   # DID:key generation, UCAN tokens, key management
  storage/    # IndexedDB adapter, snapshot management
  sync/       # Lamport timestamps, Change<T>, hash chains, SyncProvider
  data/       # Schema system, NodeStore, Yjs CRDT, document operations
  network/    # libp2p node, y-webrtc provider, DID resolution
  query/      # Local query engine, full-text search (Lunr.js)
  react/      # useNode, useNodes, useNodeSync, useDocument hooks
  sdk/        # Unified client, browser/node presets
  editor/     # TipTap-based collaborative editor
  ui/         # Shared components
  views/      # Table/Board view components (WIP)
  vectors/    # Embeddings (placeholder)
  canvas/     # Infinite canvas (placeholder)
  formula/    # Formula engine (placeholder)
```

## Key Relationships

```
crypto ──> identity ──> storage ──> sync ──> data ──> network ──> query
                                      │
                                      └──────────────> react ──> sdk
```

## Apps

```
apps/
  electron/   # Desktop (macOS)
  expo/       # Mobile (iOS)
  web/        # PWA (TanStack Router)
```

## Testing

```bash
pnpm vitest run packages/sync packages/data  # Core tests (140 total)
pnpm --filter @xnet/data test                # Single package
pnpm test:coverage                           # With coverage (>80% required)
```

## Do

- Use Mermaid diagrams in markdown files to visualize architecture, data flows, and sequences
- Prefer diagrams over walls of text for system relationships and processes

## Don't

- Don't add features beyond what's requested
- Don't write UI tests (manual testing only)
- Don't skip unit tests for core packages
- Don't use heavyweight frameworks
- Don't store computed property values (rollup, formula) - compute at read time

## Key Docs

- `docs/VISION.md` - **The big picture: micro-to-macro data sovereignty**
- `docs/planStep02_1DataModelConsolidation/HANDOFF.md` - **Implementation status and examples**
- `docs/planStep02_1DataModelConsolidation/README.md` - Schema-first architecture plan
- `docs/planStep03_1TelemetryAndNetworkSecurity/README.md` - **Telemetry & network security plan**
- `docs/TELEMETRY_DESIGN.md` - Full telemetry design exploration with research
- `docs/TRADEOFFS.md` - Why hybrid sync (Yjs + event-sourcing)
- `docs/PERSISTENCE_ARCHITECTURE.md` - Storage durability tiers
