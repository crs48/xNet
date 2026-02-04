# @xnet/hub

xNet Hub -- signaling server, sync relay, backup, query server, and federation gateway. Runs as a standalone Node.js server with a CLI.

## Installation

```bash
pnpm add @xnet/hub
```

## Quick Start

```bash
# Start a hub server
npx xnet-hub start --port 4444

# Or via pnpm in the monorepo
cd packages/hub && pnpm dev
```

## Features

- **WebSocket signaling** -- Coordinate WebRTC peer connections
- **Sync relay** -- Relay Yjs updates between peers via WebSocket
- **Node relay** -- Relay NodeStore changes between peers
- **Backup service** -- Persistent backup of node data and Yjs documents
- **File storage** -- Upload and serve file attachments
- **Schema registry** -- Store and serve shared schemas
- **Full-text search** -- FTS5-powered search across backed-up nodes
- **Awareness** -- Real-time presence and user state relay
- **Peer discovery** -- Help peers find each other
- **UCAN authentication** -- Verify DID-based authorization tokens
- **Rate limiting** -- HTTP and WebSocket rate limiting
- **Metrics middleware** -- Request timing and counting
- **Graceful shutdown** -- Clean connection draining
- **Federation** -- Cross-hub queries, schema sharing, health monitoring
- **Sharding** -- Distributed data across shard groups with rebalancing
- **Crawling** -- Web content crawling with robots.txt compliance

## Architecture

```mermaid
flowchart TD
    Clients["Clients<br/><small>Electron, Web, Mobile</small>"]

    subgraph Hub["Hub Server (Hono)"]
        subgraph Routes["HTTP Routes"]
            Backup["POST /backup<br/>GET /backup/:id"]
            Files["POST /files<br/>GET /files/:id"]
            Schemas["GET /schemas<br/>POST /schemas"]
            DIDs["GET /dids/:did"]
            Fed["GET /federation/*"]
            Shards["GET /shards/*"]
            Crawl["POST /crawl"]
        end

        subgraph WS["WebSocket Services"]
            Signaling["Signaling<br/><small>WebRTC coordination</small>"]
            Relay["Sync Relay<br/><small>Yjs update forwarding</small>"]
            NodeRelay["Node Relay<br/><small>NodeStore sync</small>"]
            Awareness["Awareness<br/><small>Presence state</small>"]
        end

        subgraph Services["Core Services"]
            BackupSvc["BackupService"]
            QuerySvc["QueryService<br/><small>FTS5 search</small>"]
            FileSvc["FileService"]
            SchemaSvc["SchemaService"]
            DiscoverySvc["DiscoveryService"]
        end

        subgraph Middleware["Middleware"]
            Auth["UCAN Auth"]
            RateLimit["Rate Limiting"]
            Metrics["Metrics"]
        end

        subgraph FedSvc["Federation"]
            FedHealth["Health Monitor"]
            ShardRouter["Shard Router"]
            ShardRebal["Shard Rebalancer"]
            CrawlSvc["Crawler"]
        end
    end

    subgraph Storage["Storage"]
        SQLite["SQLite<br/><small>better-sqlite3</small>"]
        Memory["Memory<br/><small>Testing</small>"]
    end

    Clients <-->|"WebSocket"| WS
    Clients -->|"HTTP"| Routes
    Routes --> Services
    WS --> Services
    Middleware --> Routes
    Middleware --> WS
    Services --> Storage
    FedSvc --> Storage
```

## Usage (Programmatic)

```typescript
import { createHub, resolveConfig } from '@xnet/hub'

const config = resolveConfig({
  port: 4444,
  dataDir: './hub-data',
  storage: 'sqlite'
})

const hub = await createHub(config)
// hub.server is a Hono app
// hub.close() for graceful shutdown
```

## CLI

```bash
xnet-hub start [options]

Options:
  --port <number>       Port to listen on (default: 4444)
  --data-dir <path>     Data directory (default: ./hub-data)
  --storage <type>      Storage backend: sqlite | memory (default: sqlite)
```

## Modules

| Module                   | Description                 |
| ------------------------ | --------------------------- |
| `server.ts`              | Hub server factory          |
| `config.ts`              | Configuration resolution    |
| `cli.ts`                 | Commander CLI               |
| `auth/ucan.ts`           | UCAN token verification     |
| `auth/capabilities.ts`   | Capability checking         |
| `routes/backup.ts`       | Backup HTTP routes          |
| `routes/files.ts`        | File upload/download routes |
| `routes/schemas.ts`      | Schema registry routes      |
| `routes/dids.ts`         | DID resolution routes       |
| `routes/federation.ts`   | Federation routes           |
| `routes/shards.ts`       | Shard management routes     |
| `routes/crawl.ts`        | Web crawl routes            |
| `services/signaling.ts`  | WebSocket signaling         |
| `services/relay.ts`      | Yjs sync relay              |
| `services/node-relay.ts` | NodeStore sync relay        |
| `services/backup.ts`     | Backup persistence          |
| `services/query.ts`      | FTS5 query service          |
| `services/files.ts`      | File storage service        |
| `services/schemas.ts`    | Schema registry service     |
| `services/awareness.ts`  | Presence relay              |
| `services/discovery.ts`  | Peer discovery              |
| `services/federation.ts` | Hub-to-hub federation       |
| `services/crawl.ts`      | Web content crawler         |
| `storage/sqlite.ts`      | SQLite storage backend      |
| `storage/memory.ts`      | Memory storage backend      |

## Dependencies

- `@xnet/core`, `@xnet/crypto`, `@xnet/identity`, `@xnet/data`, `@xnet/sync`
- `hono` + `@hono/node-server` -- HTTP framework
- `better-sqlite3` -- SQLite database
- `ws` -- WebSocket server
- `commander` -- CLI framework
- `yjs`, `y-protocols` -- CRDT handling

## Testing

```bash
pnpm --filter @xnet/hub test
```
