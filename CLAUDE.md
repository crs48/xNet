# CLAUDE.md - AI Agent Context

## What This Is

**xNet** = Decentralized data infrastructure AND application. Local-first, P2P-synced, user-owned data.

xNet is both the underlying infrastructure and the user-facing app — one product, one brand. It starts with documents and databases, then expands via plugins to support ERP, MCP integrations, and more.

> **The Big Picture**: Infrastructure for a new internet where data is user-owned, globally addressable, and works from personal notes to planetary-scale indexes. See `docs/VISION.md`.

**Current focus**: Daily-driver personal productivity app. See `docs/ROADMAP.md` for the 6-month plan.

## Data Model

Schema-first, Node-based architecture:

- Everything is a `Node` — schemas define type (Page, Database, Task, etc.)
- `defineSchema()` with TypeScript inference and IRI namespacing
- Schemas use globally unique IRIs: `xnet://xnet.dev/Page`, `xnet://did:key:.../Recipe`

### Sync Strategies

| Data Type              | Sync Mechanism      | Conflict Resolution   |
| ---------------------- | ------------------- | --------------------- |
| Rich text (wiki pages) | Yjs CRDT            | Character-level merge |
| Structured data        | NodeStore + Lamport | Field-level LWW       |

## Packages (All Implemented)

```
packages/
  core/       # CIDs, permissions, types
  crypto/     # BLAKE3, Ed25519, XChaCha20
  identity/   # DID:key, UCAN tokens
  storage/    # IndexedDB adapter, snapshots
  sync/       # Lamport clocks, Change<T>, hash chains
  data/       # Schema system, NodeStore, Yjs, 15 property types
  network/    # libp2p, y-webrtc, security (rate-limit, peer-scoring)
  query/      # Local engine, MiniSearch full-text
  react/      # useQuery, useMutate, useDocument, sync manager
  sdk/        # Unified client, browser/node presets
  editor/     # TipTap with 10 extensions, slash commands, drag-drop
  ui/         # Radix primitives, theme system
  views/      # Table, Board, Calendar, Timeline, Gallery
  vectors/    # HNSW index, hybrid search
  canvas/     # Infinite canvas with spatial indexing (ELK layout)
  formula/    # Expression parser + evaluator
  telemetry/  # Privacy-first, consent-gated metrics
  devtools/   # 7 debug panels, tree-shaking for prod
```

### Key Relationships

```
crypto ──> identity ──> storage ──> sync ──> data ──> network ──> query
                                      │
                                      └──────────────> react ──> sdk
```

## Apps

```
apps/
  electron/   # Desktop — full features (pages, databases, canvas, sharing)
  web/        # PWA — pages only (database/canvas views not yet wired)
  expo/       # Mobile — WebView editor, basic navigation
```

## Testing

```bash
pnpm vitest run                    # All tests (~350 total)
pnpm --filter @xnet/data test      # Single package
```

## Do

- Read code before making assumptions — grep, don't guess
- Use Mermaid diagrams in docs
- Follow `docs/ROADMAP.md` priorities

## Don't

- Add features beyond what's requested
- Write UI tests (manual testing only)
- Skip unit tests for core packages
- Use heavyweight frameworks
- Store computed values (formula, rollup) — compute at read

## Key Docs

- `docs/ROADMAP.md` — **6-month plan: daily driver → hub → multiplayer**
- `docs/VISION.md` — Long-term vision
- `docs/explorations/LANDSCAPE_ANALYSIS.md` — Competition analysis
- `docs/TRADEOFFS.md` — Why hybrid sync
