import type { DefinedSchema, NodeState, PropertyBuilder } from '@xnetjs/data'
import type { DataBridge, QueryOptions } from '@xnetjs/data-bridge'
import { createQueryDescriptor } from '@xnetjs/data-bridge'
import { ExtensionAccessError } from './extension-protocol'

/** A bounded host subscription is acquired only for the requested page, then released. */
export function readPage(
  bridge: DataBridge,
  schema: DefinedSchema<Record<string, PropertyBuilder>>,
  options: QueryOptions,
  signal: AbortSignal
): Promise<NodeState[]> {
  if (signal.aborted) throw new ExtensionAccessError('cancelled', 'The query was cancelled.')
  return new Promise((resolve, reject) => {
    let done = false
    let cleanup = () => {}
    const finish = (nodes: NodeState[] | null, error?: unknown) => {
      if (done || (!error && nodes === null)) return
      done = true
      cleanup()
      signal.removeEventListener('abort', cancel)
      if (error) reject(error)
      else resolve(nodes!)
    }
    const cancel = () =>
      finish(null, new ExtensionAccessError('cancelled', 'The query was cancelled.'))
    signal.addEventListener('abort', cancel, { once: true })
    try {
      const subscription = bridge.query(schema, options)
      let ready = !bridge.reloadQuery
      const changed = () => {
        if (!ready) return
        const metadata = subscription.getMetadata?.()
        if (metadata?.error)
          finish(
            null,
            new ExtensionAccessError('unavailable', 'The selected data could not be read.')
          )
        else finish(subscription.getSnapshot())
      }
      cleanup = subscription.subscribe(changed)
      if (done) cleanup()
      else if (bridge.reloadQuery) {
        void bridge.reloadQuery(createQueryDescriptor(schema._schemaId, options)).then(
          () => {
            ready = true
            changed()
          },
          (error) => finish(null, error)
        )
      } else changed()
    } catch (error) {
      finish(null, error)
    }
  })
}
