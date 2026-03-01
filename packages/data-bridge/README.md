# @xnet/data-bridge

DataBridge abstractions for moving xNet data operations off the main thread.

## Installation

```bash
pnpm add @xnet/data-bridge
```

## What It Provides

- `MainThreadBridge` for direct NodeStore-backed access
- `WorkerBridge` for Web Worker execution via Comlink
- `createDataBridge()` factory with automatic bridge selection
- Shared bridge types (`DataBridge`, `QueryOptions`, `DataBridgeConfig`)
- Utilities for query caching, debouncing, and binary state transfer

## Usage

```ts
import { createDataBridge } from '@xnet/data-bridge'

const bridge = await createDataBridge({
  nodeStore,
  config: {
    authorDID,
    signingKey,
    dbName: 'xnet'
  },
  workerUrl: new URL('@xnet/data-bridge/worker', import.meta.url),
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
pnpm --filter @xnet/data-bridge test
```
