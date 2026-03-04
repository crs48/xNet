# @xnetjs/data-bridge

DataBridge abstractions for moving xNet data operations off the main thread.

## Installation

```bash
pnpm add @xnetjs/data-bridge
```

## What It Provides

- `MainThreadBridge` for direct NodeStore-backed access
- `WorkerBridge` for Web Worker execution via Comlink
- `createDataBridge()` factory with automatic bridge selection
- Shared bridge types (`DataBridge`, `QueryOptions`, `DataBridgeConfig`)
- Utilities for query caching, debouncing, and binary state transfer

## Usage

```ts
import { createDataBridge } from '@xnetjs/data-bridge'

const bridge = await createDataBridge({
  nodeStore,
  config: {
    authorDID,
    signingKey,
    dbName: 'xnet'
  },
  workerUrl: new URL('@xnetjs/data-bridge/worker', import.meta.url),
  mode: 'auto'
})

const subscription = bridge.query(TaskSchema, {
  where: { status: 'todo' },
  orderBy: { createdAt: 'desc' }
})
```

## Exports

- Types: `DataBridge`, `QueryOptions`, `DataBridgeConfig`, `AcquiredDoc`, `SyncStatus`
- Implementations: `MainThreadBridge`, `WorkerBridge`, `NativeBridge`
- Factories: `createDataBridge`, `createMainThreadBridgeSync`, `createWorkerBridgeSync`
- Worker helpers: `isWorkerSupported`, `isNodeEnvironment`

## Testing

```bash
pnpm --filter @xnetjs/data-bridge test
```
