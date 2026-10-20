import { mergeUpdates } from 'yjs'
import { TransactionConflictError } from './transaction-conditions'

const PREFIX = 'document-overlay:v1:'
const MAX_BYTES = 128_000

/** Host-only, device-local Yjs state committed with authority through localState CAS. */
export const documentOverlayKey = (nodeId: string): string => PREFIX + encodeURIComponent(nodeId)
export function documentOverlayNodeId(key: string): string | null {
  if (!key.startsWith(PREFIX)) return null
  const id = decodeURIComponent(key.slice(PREFIX.length))
  if (!id || documentOverlayKey(id) !== key)
    throw new TransactionConflictError('unsupported', 'Invalid document overlay key.')
  return id
}
export function encodeDocumentOverlay(update: Uint8Array): string {
  if (update.length > MAX_BYTES)
    throw new TransactionConflictError('unsupported', 'The durable document edit budget is full.')
  let binary = ''
  for (let start = 0; start < update.length; start += 8192)
    binary += String.fromCharCode(...update.subarray(start, start + 8192))
  return JSON.stringify({ version: 1, update: btoa(binary) })
}
function decodeOverlay(raw: string): Uint8Array {
  if (raw.length > MAX_BYTES * 1.4)
    throw new TransactionConflictError('unsupported', 'Document overlay exceeds its size limit.')
  const value: unknown = JSON.parse(raw)
  if (
    !value ||
    typeof value !== 'object' ||
    !('version' in value) ||
    value.version !== 1 ||
    !('update' in value) ||
    typeof value.update !== 'string'
  )
    throw new TransactionConflictError('unsupported', 'Unreadable document overlay.')
  const bytes = Uint8Array.from(atob(value.update), (character) => character.charCodeAt(0))
  if (bytes.length > MAX_BYTES)
    throw new TransactionConflictError('unsupported', 'Document overlay exceeds its size limit.')
  return bytes
}
/** Reads always include accepted edits, even after an older legacy snapshot is written. */
export function mergeDocumentOverlay(
  state: Uint8Array | null,
  overlay: string | null
): Uint8Array | null {
  if (overlay === null) return state
  return mergeUpdates([...(state?.length ? [state] : []), decodeOverlay(overlay)])
}

/** Marked documents keep concurrent/stale snapshot writes merge-only. */
export function preserveDocumentOverlay(
  previous: Uint8Array | null,
  incoming: Uint8Array,
  overlay: string | null
): Uint8Array {
  if (overlay === null) return incoming
  return mergeDocumentOverlay(
    mergeUpdates([...(previous?.length ? [previous] : []), incoming]),
    overlay
  )!
}
