# @xnetjs/runtime

The framework-agnostic xNet runtime. It owns the orchestration that used to live
inside the React provider's effects so the full data model — authorization,
node-format validation, signing, encryption, SQLite-backed storage, and the live
query/mutate/subscribe loop — is usable from **any** framework, a CLI, a worker,
or a plain Node service.

> **Alpha software.** xNet is released but early: this package is on npm and
> usable today, but its API can change between releases, sometimes without a
> migration path. Pin your version. See the
> [project README](https://github.com/crs48/xNet#readme) for what alpha means here.

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
  signingKey: privateKey
  // local-only by default; pass `sync: { signalingUrl }` to enable background sync,
  // `plugins: { platform }` for the plugin registry, `undo: {}` for app-wide undo.
})

const sub = client.query(TaskSchema, { where: { status: 'todo' } })
const unsubscribe = sub.subscribe(() => console.log(sub.getSnapshot()))

await client.mutate.create(TaskSchema, { title: 'Ship the SDK' })
const decision = await client.auth.can({ action: 'write', nodeId: '…' })

await client.destroy()
```

## Use xNet from any framework

`client.query(schema, options)` returns the universal
`{ getSnapshot, subscribe }` contract — the exact pair React's
`useSyncExternalStore`, Vue's `shallowRef`, a Svelte store, a Solid signal, and
Angular's `toSignal` all bind to. `liveQuery()` already adapts it into the
**Svelte store contract**, so a binding for any framework is ~15–40 lines:

```ts
// Vue
import { shallowRef, onScopeDispose } from 'vue'
import { liveQuery } from '@xnetjs/runtime'

export function useQuery(client, schema, options) {
  const lq = liveQuery(client, schema, options)
  const data = shallowRef(lq.get())
  const stop = lq.subscribe((v) => (data.value = v))
  onScopeDispose(() => {
    stop()
    lq.destroy()
  })
  return data // Ref<NodeState[] | null>
}
```

```svelte
<!-- Svelte: liveQuery IS a store, so $-auto-subscription just works -->
<script>
  import { liveQuery } from '@xnetjs/runtime'
  const tasks = liveQuery(client, TaskSchema, { where: { status: 'todo' } })
</script>
{#each $tasks ?? [] as task}<li>{task.properties.title}</li>{/each}
```

```ts
// Vanilla — no framework, no adapter package
const tasks = liveQuery(client, TaskSchema)
const stop = tasks.subscribe((rows) => render(rows ?? []))
await client.mutate.create(TaskSchema, { title: 'Ship it' }) // re-renders
// later: stop(); tasks.destroy(); await client.destroy()
```

### Validate a binding with `runAdapterConformance`

Behaviour is tested **once**, framework-agnostically. Any adapter — or your own
app — can run the same contract against its client factory:

```ts
import { runAdapterConformance } from '@xnetjs/runtime'
import { MemoryNodeStorageAdapter } from '@xnetjs/data'

// Throws on the first failed check; resolves with the result otherwise.
await runAdapterConformance((overrides) =>
  createXNetClient({
    nodeStorage: new MemoryNodeStorageAdapter(),
    authorDID,
    signingKey,
    ...overrides
  })
)
```

It asserts the reactive data contract: an immediate live-query snapshot then
updates on `mutate`, no delivery after unsubscribe, one-shot `fetch` round-trips,
the authorization surface is reachable and **denial surfaces**, and `destroy()`
is idempotent.

## Support tiers (what "supported" means)

Per [exploration 0237](../../docs/explorations), framework support is layered —
binding the data layer is cheap; carrying a full per-framework component
ecosystem is not. The committed levels:

| Tier       | Surface                                              | Scope                                                                  |
| ---------- | ---------------------------------------------------- | ---------------------------------------------------------------------- |
| **Tier 0** | `@xnetjs/runtime` — `createXNetClient` + `liveQuery` | **every** framework, headless; conformance-gated. This page.           |
| **Tier 1** | `@xnetjs/react` — hooks **and** components           | first-class; the app dogfoods it.                                      |
| **Tier 2** | thin Vue / Svelte data-binding adapters              | `useQuery`/`useMutate` only — **no components** — published on demand. |
| **—**      | components in non-React frameworks                   | **not offered** (`@xnetjs/ui` is React-only by design).                |

All UI components are React. Other frameworks consume the headless runtime.

See `docs/explorations/0185_*` (runtime extraction) and
`docs/explorations/0237_*` (support-tier policy) for the design rationale.
