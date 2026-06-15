/**
 * liveQuery — a tiny framework-agnostic reactive wrapper over a client query.
 *
 * The whole point of the runtime is that `client.query(...)` returns a
 * `{ getSnapshot, subscribe }` subscription — the universal external-store
 * contract. `liveQuery` adapts that into the **Svelte store contract**
 * (`subscribe(run) => unsubscribe`, where `run` is invoked immediately with the
 * current value and again on every change), which is also trivially consumable
 * from Vue (`shallowRef` + `watchSyncEffect`), Solid, Angular, or plain JS.
 *
 * It is intentionally dependency-free: there is no Svelte/Vue import here, so it
 * works in any environment, yet a Svelte component can use it directly with
 * `$liveQuery(...)` auto-subscription.
 */
import type { XNetClient } from './client'
import type { DefinedSchema, NodeState, PropertyBuilder } from '@xnetjs/data'
import type { QueryOptions } from '@xnetjs/data-bridge'

/** The current value of a live query: `null` while loading, then the rows. */
export type LiveQueryValue = NodeState[] | null

/** A reactive handle over a live query (Svelte-store compatible). */
export interface LiveQuery {
  /**
   * Svelte store contract. `run` is called synchronously with the current value
   * and again on every change. Returns an unsubscribe function.
   */
  subscribe(run: (value: LiveQueryValue) => void): () => void
  /** Read the current value synchronously. */
  get(): LiveQueryValue
  /** Release the underlying query subscription and drop all subscribers. */
  destroy(): void
}

/**
 * Create a reactive, Svelte-store-compatible live query.
 *
 * @example Svelte
 * ```svelte
 * <script>
 *   import { liveQuery } from '@xnetjs/runtime'
 *   const tasks = liveQuery(client, TaskSchema, { where: { status: 'todo' } })
 * </script>
 * {#each $tasks ?? [] as task}
 *   <li>{task.properties.title}</li>
 * {/each}
 * ```
 *
 * @example Vanilla
 * ```ts
 * const tasks = liveQuery(client, TaskSchema)
 * const stop = tasks.subscribe((rows) => render(rows))
 * // …later
 * stop()
 * ```
 */
export function liveQuery<P extends Record<string, PropertyBuilder>>(
  client: XNetClient,
  schema: DefinedSchema<P>,
  options?: QueryOptions<P>
): LiveQuery {
  const subscription = client.query(schema, options)
  const runs = new Set<(value: LiveQueryValue) => void>()
  let unsubscribeBridge: (() => void) | null = null

  const read = (): LiveQueryValue => subscription.getSnapshot()

  const ensureBridgeSubscription = (): void => {
    if (unsubscribeBridge) return
    unsubscribeBridge = subscription.subscribe(() => {
      const value = read()
      for (const run of runs) run(value)
    })
  }

  return {
    subscribe(run) {
      runs.add(run)
      ensureBridgeSubscription()
      run(read())
      return () => {
        runs.delete(run)
        if (runs.size === 0 && unsubscribeBridge) {
          unsubscribeBridge()
          unsubscribeBridge = null
        }
      }
    },
    get: read,
    destroy() {
      if (unsubscribeBridge) {
        unsubscribeBridge()
        unsubscribeBridge = null
      }
      runs.clear()
    }
  }
}
