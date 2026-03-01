# @xnet packages

Core xNet packages for decentralized data, sync, UI, and tooling.

## Packages

### Foundation

| Package                      | Description                                           | Tests | Status |
| ---------------------------- | ----------------------------------------------------- | ----- | ------ |
| [@xnet/core](./core)         | Types, content addressing (CIDs), permissions, RBAC   | 5     | Stable |
| [@xnet/crypto](./crypto)     | BLAKE3 hashing, Ed25519 signing, XChaCha20 encryption | 4     | Stable |
| [@xnet/identity](./identity) | DID:key generation, UCAN tokens, passkey storage      | 4     | Stable |

### Infrastructure

| Package                    | Description                                             | Tests | Status |
| -------------------------- | ------------------------------------------------------- | ----- | ------ |
| [@xnet/storage](./storage) | SQLite/memory adapters and blob storage                 | 4     | Stable |
| [@xnet/sync](./sync)       | Change\<T\>, Lamport clocks, hash chains, Yjs security  | 10    | Stable |
| [@xnet/data](./data)       | Schema system, NodeStore, 16 property helpers, Yjs CRDT | 10    | Stable |
| [@xnet/network](./network) | libp2p node, y-webrtc provider, security suite          | 1     | Stable |
| [@xnet/query](./query)     | Local query engine, MiniSearch FTS, federation          | 2     | Stable |
| [@xnet/hub](./hub)         | Signaling, sync relay, backup, FTS5, sharding           | 0     | Stable |

### Application

| Package                        | Description                                         | Tests | Status |
| ------------------------------ | --------------------------------------------------- | ----- | ------ |
| [@xnet/react](./react)         | useQuery, useMutate, useNode, hub/plugin hooks      | 2     | Stable |
| [@xnet/sdk](./sdk)             | Unified SDK re-exports and client bootstrap         | 1     | Stable |
| [@xnet/editor](./editor)       | TipTap editor, slash commands, wikilinks, drag-drop | 23    | Stable |
| [@xnet/ui](./ui)               | Base UI primitives, composed components, theme      | 0     | Stable |
| [@xnet/views](./views)         | Table, Board, Gallery, Timeline, Calendar           | 7     | Stable |
| [@xnet/canvas](./canvas)       | Infinite canvas, R-tree, ELK.js layout              | 4     | Stable |
| [@xnet/devtools](./devtools)   | 9-panel debug suite                                 | 2     | Stable |
| [@xnet/history](./history)     | Time machine, undo/redo, audit, blame, diff         | 3     | Stable |
| [@xnet/plugins](./plugins)     | Plugin registry, sandbox, AI generation, MCP        | 8     | Stable |
| [@xnet/telemetry](./telemetry) | Privacy-preserving telemetry, tiered consent        | 0     | Stable |
| [@xnet/formula](./formula)     | Expression parser, evaluator, built-in functions    | 4     | Stable |
| [@xnet/vectors](./vectors)     | HNSW vector index, semantic + hybrid search         | 4     | Stable |

### Tooling

| Package                            | Description                                            | Tests | Status |
| ---------------------------------- | ------------------------------------------------------ | ----- | ------ |
| [@xnet/cli](./cli)                 | CLI commands for schema diff/migration and diagnostics | -     | Stable |
| [@xnet/data-bridge](./data-bridge) | Bridge abstraction for off-main-thread data access     | -     | Stable |

## Dependency Graph

```mermaid
flowchart TD
    core["@xnet/core"]
    crypto["@xnet/crypto"]
    identity["@xnet/identity"]
    storage["@xnet/storage"]
    sync["@xnet/sync"]
    data["@xnet/data"]
    network["@xnet/network"]
    query["@xnet/query"]
    react["@xnet/react"]
    sdk["@xnet/sdk"]
    editor["@xnet/editor"]
    ui["@xnet/ui"]
    views["@xnet/views"]
    canvas["@xnet/canvas"]
    devtools["@xnet/devtools"]
    history["@xnet/history"]
    plugins["@xnet/plugins"]
    telemetry["@xnet/telemetry"]
    formula["@xnet/formula"]
    vectors["@xnet/vectors"]
    hub["@xnet/hub"]

    core --> crypto --> identity
    core --> storage
    crypto --> storage
    core --> sync
    crypto --> sync
    identity --> sync

    identity --> data
    storage --> data
    sync --> data

    core --> network
    crypto --> network
    identity --> network
    data --> network

    core --> query
    data --> query
    identity --> query
    network --> query
    storage --> query

    core --> hub
    crypto --> hub
    identity --> hub
    data --> hub
    sync --> hub

    core --> history
    data --> history
    sync --> history

    core --> plugins
    data --> plugins

    core --> telemetry
    data --> telemetry

    core --> react
    crypto --> react
    data --> react
    identity --> react
    history --> react
    plugins --> react

    core --> sdk
    crypto --> sdk
    identity --> sdk
    storage --> sdk
    data --> sdk
    network --> sdk
    query --> sdk

    data --> editor
    ui --> editor

    core --> views
    data --> views
    react --> views
    ui --> views

    core --> canvas
    data --> canvas
    react --> canvas
    ui --> canvas
    vectors --> canvas

    history --> devtools
    ui --> devtools
    views --> devtools

    core --> vectors
    storage --> vectors
```

## Build Order

```mermaid
flowchart LR
    core --> crypto --> identity --> sync
    core --> storage
    sync --> data
    storage --> data
    identity --> data
    data --> network --> query --> sdk
    data --> react --> sdk
    data --> hub
    data --> history --> react
    data --> plugins --> react
    data --> telemetry
    ui --> editor
    data --> editor
    ui --> views
    react --> views
    ui --> canvas
    react --> canvas
    storage --> vectors --> canvas
    history --> devtools
    ui --> devtools
    views --> devtools
    formula
```

## Development

```bash
# Build all packages
pnpm build

# Test all packages
pnpm test

# Test single package
pnpm --filter @xnet/data test

# Run a single test file
pnpm --filter @xnet/sync vitest run src/clock.test.ts

# Test with pattern matching
pnpm --filter @xnet/data vitest run -t "NodeStore"

# Watch mode
pnpm --filter @xnet/sync test:watch

# Type check
pnpm typecheck
```
