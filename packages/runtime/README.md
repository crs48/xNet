# @xnetjs/runtime

The framework-agnostic xNet runtime. It owns the orchestration that used to live
inside the React provider's effects so the full data model — authorization,
node-format validation, signing, encryption, SQLite-backed storage, and the live
query/mutate/subscribe loop — is usable from **any** framework, a CLI, a worker,
or a plain Node service.

Nothing here imports React. The `@xnetjs/react` hooks, the CLI, and other-framework
adapters are thin bindings over this surface.

## What's here

- **Sync orchestration** — `createSyncManager`, `createConnectionManager`,
  `createOfflineQueue`, `createNodePool`, `WebSocketSyncProvider`,
  `NodeStoreSyncProvider`, `createInitialSyncManager` (relocated from
  `@xnetjs/react`; they never imported React).
- **`createXNetClient(config)`** — a batteries-included runtime that constructs
  and owns the `NodeStore`, `DataBridge` (main-thread / worker / IPC), optional
  `SyncManager`, `PluginRegistry`, and app-wide `UndoManager`, and exposes the
  same read/write/auth surface the hooks expose.

## Quick start

```ts
import { createXNetClient } from '@xnetjs/runtime'
import { MemoryNodeStorageAdapter } from '@xnetjs/data'
import { generateIdentity } from '@xnetjs/identity'

const { identity, privateKey } = generateIdentity()

const client = await createXNetClient({
  nodeStorage: new MemoryNodeStorageAdapter(),
  authorDID: identity.did,
  signingKey: privateKey,
  sync: false // local-only; omit to enable sync
})

const sub = client.query(TaskSchema, { where: { status: 'todo' } })
const unsubscribe = sub.subscribe(() => console.log(sub.getSnapshot()))

await client.mutate.create(TaskSchema, { title: 'Ship the SDK' })
const decision = await client.auth.can({ action: 'write', nodeId: '…' })

await client.destroy()
```

See `docs/explorations/0185_*` for the design rationale.
