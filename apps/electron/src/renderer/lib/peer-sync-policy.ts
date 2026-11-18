import type { NodeChange, NodeStore } from '@xnetjs/data'
import { isPeerRecord } from '@xnetjs/workbench/peer-chat'

/** Only the pinned, approved Iroh session may import records in this namespace. */
export function hubStore(store: NodeStore): NodeStore {
  const check = (change: NodeChange) => {
    if (isPeerRecord(change.payload.nodeId))
      throw new Error('Peer chat records cannot be imported through the hub.')
  }
  return new Proxy(store, {
    get(target, key) {
      if (key === 'applyRemoteChange')
        return async (change: NodeChange) => {
          check(change)
          return target.applyRemoteChange(change)
        }
      if (key === 'applyRemoteChanges')
        return async (changes: NodeChange[]) => {
          changes.forEach(check)
          return target.applyRemoteChanges(changes)
        }
      const value: unknown = Reflect.get(target, key, target)
      return typeof value === 'function' ? value.bind(target) : value
    }
  })
}
