# 01: Package Scaffold + Signaling

> Create the hub package, CLI, and port the signaling server

**Dependencies:** `infrastructure/signaling/` (existing code to port)
**New Package:** `packages/hub` (`@xnet/hub`)

## Codebase Status (Feb 2026)

| Existing Asset                  | Location                                 | Reuse Strategy                                                                            |
| ------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| Signaling server (271 LOC)      | `infrastructure/signaling/src/server.ts` | Direct port — same pub/sub protocol, add `publishFromHub` + `setMessageInterceptor` hooks |
| Signaling Dockerfile + fly.toml | `infrastructure/signaling/`              | Adapt for hub (larger image due to SQLite)                                                |
| BSM WebSocket handling          | `apps/electron/src/main/bsm.ts`          | Reference for sync message formats                                                        |
| WebSocketSyncProvider           | `packages/react/src/sync/`               | No changes — hub must be protocol-compatible                                              |
| SyncManager + ConnectionManager | `packages/react/src/sync/`               | No changes — hub must accept multiplexed room subscriptions                               |

> **Key constraint:** The hub's signaling MUST be wire-compatible with the existing `WebSocketSyncProvider` and `ConnectionManager`. Both use JSON messages with `{type: 'subscribe'|'unsubscribe'|'publish'|'ping', topics?, topic?, data?}` format.

## Overview

The hub package is a standalone Node.js server that combines signaling, relay, backup, and query into a single process. This step creates the package structure, CLI entry point, and ports the existing signaling logic.

```mermaid
flowchart LR
    CLI[bin/xnet-hub.ts] --> CREATE[createHub]
    CREATE --> SERVER[Hono + WS Server]
    SERVER --> SIG[Signaling Service]
    SERVER --> HEALTH[/health endpoint]
    SERVER --> METRICS[/metrics endpoint]

    style CLI fill:#e3f2fd
    style SERVER fill:#e8f5e9
    style SIG fill:#fff3e0
```

## Implementation

### 1. Package Configuration

```json
// packages/hub/package.json
{
  "name": "@xnet/hub",
  "version": "0.0.1",
  "description": "xNet Hub - signaling, sync relay, backup, and query server",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "bin": {
    "xnet-hub": "./bin/xnet-hub.ts"
  },
  "exports": {
    ".": {
      "import": "./src/index.ts",
      "types": "./src/index.ts"
    }
  },
  "scripts": {
    "dev": "tsx src/cli.ts",
    "start": "node --loader tsx src/cli.ts",
    "build": "tsup src/index.ts src/cli.ts --format esm --dts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@xnet/core": "workspace:*",
    "@xnet/crypto": "workspace:*",
    "@xnet/identity": "workspace:*",
    "better-sqlite3": "^11.0.0",
    "commander": "^12.0.0",
    "hono": "^4.0.0",
    "@hono/node-server": "^1.0.0",
    "ws": "^8.16.0",
    "yjs": "^13.6.24",
    "y-protocols": "^1.0.6"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "@types/ws": "^8.5.0",
    "tsup": "^8.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.4.0",
    "vitest": "^2.0.0"
  }
}
```

### 2. Hub Configuration Types

```typescript
// packages/hub/src/types.ts

export interface HubConfig {
  /** WebSocket + HTTP port (default: 4444) */
  port: number
  /** Data directory for SQLite + blobs (default: ./xnet-hub-data) */
  dataDir: string
  /** Storage backend (default: 'sqlite') */
  storage: 'sqlite' | 'memory'
  /** Enable UCAN authentication (default: true) */
  auth: boolean
  /** Maximum message size in bytes (default: 5MB) */
  maxMessageSize: number
  /** Maximum concurrent connections (default: 1000) */
  maxConnections: number
  /** Default storage quota per DID in bytes (default: 1GB) */
  defaultQuota: number
  /** Log level (default: 'info') */
  logLevel: 'debug' | 'info' | 'warn' | 'error'
}

export const DEFAULT_CONFIG: HubConfig = {
  port: 4444,
  dataDir: './xnet-hub-data',
  storage: 'sqlite',
  auth: true,
  maxMessageSize: 5 * 1024 * 1024, // 5MB
  maxConnections: 1000,
  defaultQuota: 1024 * 1024 * 1024, // 1GB
  logLevel: 'info'
}

export interface HubInstance {
  start(): Promise<void>
  stop(): Promise<void>
  readonly port: number
  readonly config: HubConfig
}
```

### 3. CLI Entry Point

```typescript
// packages/hub/src/cli.ts

import { Command } from 'commander'
import { createHub } from './index'
import type { HubConfig } from './types'
import { DEFAULT_CONFIG } from './types'

const program = new Command()
  .name('xnet-hub')
  .description('xNet Hub - signaling, sync relay, backup, and query server')
  .version('0.0.1')
  .option('-p, --port <number>', 'port to listen on', String(DEFAULT_CONFIG.port))
  .option('-d, --data <path>', 'data directory', DEFAULT_CONFIG.dataDir)
  .option('--no-auth', 'disable UCAN authentication (anonymous mode)')
  .option('--storage <type>', 'storage backend (sqlite|memory)', DEFAULT_CONFIG.storage)
  .option(
    '--max-connections <number>',
    'max concurrent connections',
    String(DEFAULT_CONFIG.maxConnections)
  )
  .option('--log-level <level>', 'log level (debug|info|warn|error)', DEFAULT_CONFIG.logLevel)
  .action(async (opts) => {
    const config: Partial<HubConfig> = {
      port: parseInt(opts.port, 10),
      dataDir: opts.data,
      auth: opts.auth !== false,
      storage: opts.storage,
      maxConnections: parseInt(opts.maxConnections, 10),
      logLevel: opts.logLevel
    }

    const hub = await createHub(config)

    // Graceful shutdown
    const shutdown = async () => {
      console.log('\nShutting down...')
      await hub.stop()
      process.exit(0)
    }
    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)

    await hub.start()
    console.log(`xNet Hub listening on port ${hub.port}`)
    console.log(`  WebSocket: ws://localhost:${hub.port}`)
    console.log(`  Health:    http://localhost:${hub.port}/health`)
    console.log(`  Auth:      ${config.auth ? 'UCAN' : 'anonymous'}`)
    console.log(`  Storage:   ${config.storage} (${config.dataDir})`)
  })

program.parse()
```

### 4. Main Server (Hono + WebSocket)

```typescript
// packages/hub/src/server.ts

import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { WebSocketServer, type WebSocket } from 'ws'
import type { IncomingMessage } from 'http'
import type { HubConfig, HubInstance } from './types'
import { DEFAULT_CONFIG } from './types'
import { SignalingService } from './services/signaling'

export function createServer(config: HubConfig): HubInstance {
  const app = new Hono()
  const signaling = new SignalingService()

  // Track connections
  let connectionCount = 0
  const startTime = Date.now()

  // Health endpoint
  app.get('/health', (c) => {
    return c.json({
      status: 'ok',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      connections: connectionCount,
      rooms: signaling.getRoomCount(),
      version: '0.0.1'
    })
  })

  // Prometheus metrics
  app.get('/metrics', (c) => {
    const metrics = [
      `# HELP xnet_hub_connections_active Active WebSocket connections`,
      `# TYPE xnet_hub_connections_active gauge`,
      `xnet_hub_connections_active ${connectionCount}`,
      `# HELP xnet_hub_rooms_active Active signaling rooms`,
      `# TYPE xnet_hub_rooms_active gauge`,
      `xnet_hub_rooms_active ${signaling.getRoomCount()}`,
      `# HELP xnet_hub_uptime_seconds Hub uptime in seconds`,
      `# TYPE xnet_hub_uptime_seconds counter`,
      `xnet_hub_uptime_seconds ${Math.floor((Date.now() - startTime) / 1000)}`
    ].join('\n')
    return c.text(metrics)
  })

  let httpServer: ReturnType<typeof serve> | null = null
  let wss: WebSocketServer | null = null

  const hub: HubInstance = {
    port: config.port,
    config,

    async start() {
      // Start HTTP server
      httpServer = serve({ fetch: app.fetch, port: config.port })

      // Attach WebSocket server to the HTTP server
      wss = new WebSocketServer({ server: httpServer as any })

      wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
        if (connectionCount >= config.maxConnections) {
          ws.close(4429, 'Too many connections')
          return
        }
        connectionCount++

        // Message size enforcement
        ws.on('message', (data: Buffer) => {
          if (data.length > config.maxMessageSize) {
            ws.close(4413, 'Message too large')
            return
          }

          try {
            const msg = JSON.parse(data.toString())
            signaling.handleMessage(ws, msg)
          } catch {
            // Ignore malformed messages
          }
        })

        ws.on('close', () => {
          connectionCount--
          signaling.handleDisconnect(ws)
        })

        ws.on('error', () => {
          connectionCount--
          signaling.handleDisconnect(ws)
        })
      })
    },

    async stop() {
      // Close all WebSocket connections gracefully
      if (wss) {
        for (const ws of wss.clients) {
          ws.close(1001, 'Server shutting down')
        }
        wss.close()
      }

      // Close HTTP server
      if (httpServer) {
        httpServer.close()
      }

      signaling.destroy()
    }
  }

  return hub
}
```

### 5. Signaling Service (Ported from infrastructure/)

```typescript
// packages/hub/src/services/signaling.ts

import type { WebSocket } from 'ws'

interface Topic {
  subscribers: Set<WebSocket>
}

interface SignalingMessage {
  type: 'subscribe' | 'unsubscribe' | 'publish' | 'ping'
  topics?: string[]
  topic?: string
  data?: unknown
}

/**
 * Signaling service - y-webrtc compatible pub/sub over WebSocket.
 *
 * This is the same protocol as infrastructure/signaling/ but integrated
 * into the hub process. Clients subscribe to room topics and publish
 * messages (SDP offers, Yjs sync messages) to all other subscribers.
 */
export class SignalingService {
  private topics = new Map<string, Topic>()
  private subscriptions = new Map<WebSocket, Set<string>>()

  handleMessage(ws: WebSocket, msg: SignalingMessage): void {
    switch (msg.type) {
      case 'subscribe':
        this.handleSubscribe(ws, msg.topics ?? [])
        break
      case 'unsubscribe':
        this.handleUnsubscribe(ws, msg.topics ?? [])
        break
      case 'publish':
        if (msg.topic) {
          this.handlePublish(ws, msg.topic, msg.data)
        }
        break
      case 'ping':
        this.send(ws, { type: 'pong' })
        break
    }
  }

  handleDisconnect(ws: WebSocket): void {
    const subs = this.subscriptions.get(ws)
    if (subs) {
      for (const topic of subs) {
        const t = this.topics.get(topic)
        if (t) {
          t.subscribers.delete(ws)
          if (t.subscribers.size === 0) {
            this.topics.delete(topic)
          }
        }
      }
      this.subscriptions.delete(ws)
    }
  }

  getRoomCount(): number {
    return this.topics.size
  }

  getSubscribers(topic: string): Set<WebSocket> {
    return this.topics.get(topic)?.subscribers ?? new Set()
  }

  destroy(): void {
    this.topics.clear()
    this.subscriptions.clear()
  }

  private handleSubscribe(ws: WebSocket, topics: string[]): void {
    if (!this.subscriptions.has(ws)) {
      this.subscriptions.set(ws, new Set())
    }
    const subs = this.subscriptions.get(ws)!

    for (const topic of topics) {
      if (!this.topics.has(topic)) {
        this.topics.set(topic, { subscribers: new Set() })
      }
      this.topics.get(topic)!.subscribers.add(ws)
      subs.add(topic)
    }
  }

  private handleUnsubscribe(ws: WebSocket, topics: string[]): void {
    const subs = this.subscriptions.get(ws)
    if (!subs) return

    for (const topic of topics) {
      const t = this.topics.get(topic)
      if (t) {
        t.subscribers.delete(ws)
        if (t.subscribers.size === 0) {
          this.topics.delete(topic)
        }
      }
      subs.delete(topic)
    }
  }

  private handlePublish(ws: WebSocket, topic: string, data: unknown): void {
    const t = this.topics.get(topic)
    if (!t) return

    const msg = JSON.stringify({ type: 'publish', topic, data })
    for (const subscriber of t.subscribers) {
      if (subscriber !== ws && subscriber.readyState === 1) {
        subscriber.send(msg)
      }
    }
  }

  private send(ws: WebSocket, msg: object): void {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(msg))
    }
  }
}
```

### 6. Programmatic API

```typescript
// packages/hub/src/index.ts

import { mkdirSync } from 'fs'
import { createServer } from './server'
import type { HubConfig, HubInstance } from './types'
import { DEFAULT_CONFIG } from './types'

export type { HubConfig, HubInstance } from './types'

/**
 * Create an xNet Hub instance.
 *
 * @example
 * const hub = await createHub({ port: 4444 })
 * await hub.start()
 */
export async function createHub(config: Partial<HubConfig> = {}): Promise<HubInstance> {
  const resolved: HubConfig = { ...DEFAULT_CONFIG, ...config }

  // Ensure data directory exists
  mkdirSync(resolved.dataDir, { recursive: true })

  return createServer(resolved)
}
```

## Tests

```typescript
// packages/hub/test/signaling.test.ts

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { WebSocket } from 'ws'
import { createHub, type HubInstance } from '../src'

describe('Hub Signaling', () => {
  let hub: HubInstance
  const PORT = 14444

  beforeAll(async () => {
    hub = await createHub({ port: PORT, auth: false, storage: 'memory' })
    await hub.start()
  })

  afterAll(async () => {
    await hub.stop()
  })

  function connect(): Promise<WebSocket> {
    return new Promise((resolve) => {
      const ws = new WebSocket(`ws://localhost:${PORT}`)
      ws.on('open', () => resolve(ws))
    })
  }

  it('responds to ping with pong', async () => {
    const ws = await connect()
    ws.send(JSON.stringify({ type: 'ping' }))

    const msg = await new Promise<any>((resolve) => {
      ws.on('message', (data) => resolve(JSON.parse(data.toString())))
    })
    expect(msg.type).toBe('pong')
    ws.close()
  })

  it('broadcasts publish to room subscribers', async () => {
    const ws1 = await connect()
    const ws2 = await connect()
    const ws3 = await connect()

    // ws1 and ws2 subscribe to 'test-room'
    ws1.send(JSON.stringify({ type: 'subscribe', topics: ['test-room'] }))
    ws2.send(JSON.stringify({ type: 'subscribe', topics: ['test-room'] }))
    await new Promise((r) => setTimeout(r, 50))

    // ws3 does NOT subscribe

    // ws1 publishes
    ws1.send(JSON.stringify({ type: 'publish', topic: 'test-room', data: { hello: 'world' } }))

    // ws2 should receive it
    const msg = await new Promise<any>((resolve) => {
      ws2.on('message', (data) => resolve(JSON.parse(data.toString())))
    })
    expect(msg.type).toBe('publish')
    expect(msg.data.hello).toBe('world')

    ws1.close()
    ws2.close()
    ws3.close()
  })

  it('health endpoint returns status', async () => {
    const res = await fetch(`http://localhost:${PORT}/health`)
    const json = await res.json()
    expect(json.status).toBe('ok')
    expect(json.connections).toBeTypeOf('number')
  })
})
```

## Checklist

- [x] Create `packages/hub/` directory structure
- [x] Write `package.json` with dependencies
- [x] Write `tsconfig.json`
- [x] Implement `types.ts` (HubConfig, HubInstance)
- [x] Implement `cli.ts` (Commander.js CLI)
- [x] Implement `server.ts` (Hono + WebSocket server)
- [x] Implement `services/signaling.ts` (pub/sub rooms)
- [x] Implement `index.ts` (createHub API)
- [x] Write signaling tests
- [ ] Verify existing `WebSocketSyncProvider` connects
- [x] Add `packages/hub` to workspace `pnpm-workspace.yaml`
- [ ] Run `pnpm install` to link workspace

---

[Back to README](./README.md) | [Next: UCAN Auth →](./02-ucan-auth.md)
