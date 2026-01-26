# xNet

Decentralized data infrastructure and application. Local-first, P2P-synced, user-owned data.

xNet is both the underlying infrastructure and the user-facing app — one product, one brand. It starts with documents and databases, then expands via plugins to support ERP, MCP integrations, and more.

## Architecture

```mermaid
flowchart TB
    subgraph Apps["Applications"]
        Electron["Electron<br/>(Desktop)"]
        Web["Web<br/>(PWA)"]
        Expo["Expo<br/>(Mobile)"]
    end

    subgraph UI["UI Layer"]
        Editor["@xnet/editor<br/>TipTap rich text"]
        Views["@xnet/views<br/>Table, Board, Calendar"]
        Canvas["@xnet/canvas<br/>Infinite canvas"]
        UILib["@xnet/ui<br/>Radix components"]
    end

    subgraph Client["Client Layer"]
        React["@xnet/react<br/>Hooks + SyncManager"]
        SDK["@xnet/sdk<br/>Unified client"]
    end

    subgraph Data["Data Layer"]
        DataPkg["@xnet/data<br/>Schema, NodeStore, Yjs"]
        Query["@xnet/query<br/>Local engine + FTS"]
        Vectors["@xnet/vectors<br/>HNSW embeddings"]
        Formula["@xnet/formula<br/>Expression engine"]
    end

    subgraph Sync["Sync Layer"]
        SyncPkg["@xnet/sync<br/>Change&lt;T&gt;, Lamport, chains"]
        Storage["@xnet/storage<br/>IndexedDB adapter"]
    end

    subgraph Foundation["Foundation"]
        Identity["@xnet/identity<br/>DID:key, UCAN"]
        Crypto["@xnet/crypto<br/>BLAKE3, Ed25519"]
        Core["@xnet/core<br/>CIDs, types"]
    end

    subgraph Network["Network Layer"]
        NetworkPkg["@xnet/network<br/>libp2p, y-webrtc"]
    end

    subgraph Infra["Infrastructure"]
        Signaling["Signaling Server<br/>WebSocket pub/sub"]
        Bootstrap["Bootstrap Node<br/>DHT discovery"]
    end

    subgraph Planned["Planned: Hub (Q2 2026)"]
        direction TB
        Hub["@xnet/hub<br/>Always-on sync peer"]
        HubFeatures["Backup, Query API,<br/>File store, Awareness"]
    end

    subgraph Future["Future: Federation"]
        Federation["Hub ↔ Hub<br/>Cross-org queries"]
    end

    %% App connections
    Apps --> UI
    Apps --> Client

    %% UI dependencies
    Editor --> DataPkg
    Editor --> UILib
    Views --> DataPkg
    Views --> UILib
    Canvas --> DataPkg
    Canvas --> Vectors

    %% Client dependencies
    React --> DataPkg
    React --> Identity
    SDK --> DataPkg
    SDK --> Query
    SDK --> NetworkPkg
    SDK --> Storage

    %% Data layer
    DataPkg --> SyncPkg
    DataPkg --> Storage
    DataPkg --> Identity
    Query --> DataPkg
    Vectors --> Storage
    Formula -.-> DataPkg

    %% Sync layer
    SyncPkg --> Crypto
    Storage --> Crypto

    %% Foundation
    Identity --> Crypto
    Crypto --> Core

    %% Network
    NetworkPkg --> DataPkg
    NetworkPkg --> Identity
    NetworkPkg <--> Signaling
    NetworkPkg <--> Bootstrap

    %% Planned connections
    Hub --> NetworkPkg
    Hub --> Storage
    HubFeatures --> Hub
    Federation --> Hub

    %% Styling
    classDef planned fill:#f9f,stroke:#333,stroke-dasharray: 5 5
    classDef future fill:#bbf,stroke:#333,stroke-dasharray: 5 5
    class Hub,HubFeatures planned
    class Federation future
```

### Data Flow

```mermaid
sequenceDiagram
    participant User
    participant React as @xnet/react
    participant Store as NodeStore
    participant Yjs as Y.Doc
    participant Storage as IndexedDB
    participant Network as WebRTC/WebSocket
    participant Peer as Remote Peer

    User->>React: Edit document
    React->>Yjs: Apply change (CRDT)
    Yjs->>Storage: Persist update
    Yjs->>Network: Broadcast update
    Network->>Peer: Sync via signaling

    User->>React: Update record
    React->>Store: mutate()
    Store->>Store: Create Change<T>
    Store->>Storage: Append to log
    Store->>Network: Broadcast change
    Network->>Peer: Sync via signaling

    Peer->>Network: Remote change arrives
    Network->>Store: applyRemoteChange()
    Store->>Storage: Merge (LWW)
    Store->>React: Notify subscribers
    React->>User: UI updates
```

## Getting Started

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run unit tests
pnpm test

# Run integration tests (browser)
pnpm --filter @xnet/integration-tests test

# Type check
pnpm typecheck
```

## Monorepo Structure

```
packages/              # Core SDK packages (@xnet/*)
apps/                  # Platform applications
site/                  # Static website
infrastructure/        # Bootstrap node, signaling server
tests/                 # Browser-based integration tests
docs/                  # Vision, explorations, implementation plans
```

See the README in each directory for details:

- [packages/README.md](./packages/README.md) — All 17 packages with dependency graph
- [apps/README.md](./apps/README.md) — Electron, Expo, Web apps
- [tests/README.md](./tests/README.md) — Integration test suite
- [infrastructure/signaling/README.md](./infrastructure/signaling/README.md) — Signaling server

## Packages

### Infrastructure

| Package                               | Description                                             |
| ------------------------------------- | ------------------------------------------------------- |
| [@xnet/core](./packages/core)         | Types, content addressing (CIDs), permissions           |
| [@xnet/crypto](./packages/crypto)     | BLAKE3 hashing, Ed25519 signing, XChaCha20 encryption   |
| [@xnet/identity](./packages/identity) | DID:key generation, UCAN tokens, key management         |
| [@xnet/storage](./packages/storage)   | IndexedDB adapter, snapshot management                  |
| [@xnet/sync](./packages/sync)         | Change\<T\>, Lamport clocks, hash chains, SyncProvider  |
| [@xnet/data](./packages/data)         | Schema system, NodeStore, Yjs CRDT, document operations |
| [@xnet/network](./packages/network)   | libp2p node, y-webrtc provider, DID resolution          |
| [@xnet/query](./packages/query)       | Local query engine, full-text search (Lunr.js)          |

### Application

| Package                                 | Description                                                 |
| --------------------------------------- | ----------------------------------------------------------- |
| [@xnet/react](./packages/react)         | useQuery, useMutate, useDocument, useIdentity, XNetProvider |
| [@xnet/sdk](./packages/sdk)             | Unified client, browser/node presets                        |
| [@xnet/editor](./packages/editor)       | TipTap-based collaborative rich text editor                 |
| [@xnet/ui](./packages/ui)               | Shared UI components, design tokens                         |
| [@xnet/telemetry](./packages/telemetry) | Privacy-preserving telemetry, consent, event collection     |
| [@xnet/views](./packages/views)         | Table, Board, Calendar, Gallery, Timeline views             |

### Planned

| Package                             | Description     |
| ----------------------------------- | --------------- |
| [@xnet/vectors](./packages/vectors) | Embeddings      |
| [@xnet/canvas](./packages/canvas)   | Infinite canvas |
| [@xnet/formula](./packages/formula) | Formula engine  |

## Apps

| App                         | Tech                           | Description                   |
| --------------------------- | ------------------------------ | ----------------------------- |
| [Electron](./apps/electron) | electron-vite, React, Tailwind | Desktop (macOS/Windows/Linux) |
| [Expo](./apps/expo)         | React Native, Expo             | Mobile (iOS)                  |
| [Web](./apps/web)           | Vite, TanStack Router, PWA     | Browser progressive web app   |

## Data Model

Everything is a **Node** (universal container). A **Schema** defines what the Node is.

```typescript
import { defineSchema, text, number, select } from '@xnet/data'

const InvoiceSchema = defineSchema({
  name: 'Invoice',
  namespace: 'xnet://myapp/',
  document: 'yjs', // enables rich text body via Yjs CRDT
  properties: {
    title: text({ required: true }),
    amount: number(),
    status: select({
      options: [
        { id: 'draft', name: 'Draft' },
        { id: 'sent', name: 'Sent' },
        { id: 'paid', name: 'Paid' }
      ] as const
    })
  }
})
```

### Sync Strategies

| Data Type               | Sync Mechanism      | Conflict Resolution   |
| ----------------------- | ------------------- | --------------------- |
| Rich text (documents)   | Yjs CRDT            | Character-level merge |
| Structured data (nodes) | NodeStore + Lamport | Field-level LWW       |

## React Hooks

```tsx
import { XNetProvider, useQuery, useMutate, useDocument } from '@xnet/react'

// Structured data: useQuery + useMutate
function TaskList() {
  const { data: tasks, loading } = useQuery(TaskSchema)
  const { create, update, remove } = useMutate()

  return (
    <ul>
      {tasks.map((task) => (
        <li key={task.id}>{task.title}</li>
      ))}
      <button onClick={() => create(TaskSchema, { title: 'New', status: 'todo' })}>Add</button>
    </ul>
  )
}

// Rich text: useDocument (Yjs CRDT)
function PageEditor({ nodeId }: { nodeId: string }) {
  const { doc, loading } = useDocument(nodeId)
  if (loading || !doc) return null
  return <RichTextEditor doc={doc} />
}
```

## Key Technologies

| Layer      | Technology                                        |
| ---------- | ------------------------------------------------- |
| Sync       | Event-sourced immutable logs, Lamport clocks, LWW |
| CRDT       | Yjs (conflict-free collaboration)                 |
| P2P        | libp2p + WebRTC                                   |
| Storage    | IndexedDB (browser), SQLite (native)              |
| Identity   | DID:key + UCAN authorization                      |
| Signing    | Ed25519 (via @noble/curves)                       |
| Hashing    | BLAKE3 (via @noble/hashes)                        |
| Encryption | XChaCha20-Poly1305                                |
| Build      | Turborepo, tsup, Vite                             |
| Testing    | Vitest, Playwright (browser mode)                 |

## Documentation

- [Vision](./docs/VISION.md) — The big picture: micro-to-macro data sovereignty
- [Tradeoffs](./docs/TRADEOFFS.md) — Why hybrid sync (Yjs + event sourcing)
- [Data Model](./docs/planStep02_1DataModelConsolidation/README.md) — Schema-first architecture
- [Telemetry](./docs/planStep03_1TelemetryAndNetworkSecurity/README.md) — Telemetry & network security
- [Plugins](./docs/planStep03_5Plugins/README.md) — Plugin architecture plan
- [History](./docs/planStep03_7History/README.md) — Time machine, undo, audit trails

## License

MIT
