import type { CallSignal, SignalingTransport } from '@xnetjs/comms'

/** Ephemeral signaling follows the channel's existing authorized sync room. */
export interface CallAwareness {
  clientID: number
  getStates(): Map<number, Record<string, unknown>>
  setLocalStateField(key: string, value: unknown): void
  on(event: 'change', listener: () => void): void
  off(event: 'change', listener: () => void): void
}
const FIELD = 'communityCall'
function isSignal(value: unknown): value is CallSignal {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (typeof v.from !== 'string' || v.from.length > 400) return false
  if (v.kind === 'leave') return true
  if (v.kind === 'announce' || v.kind === 'welcome') {
    const media = v.media as Record<string, unknown> | undefined
    return (
      typeof v.did === 'string' &&
      !!media &&
      ['audio', 'video', 'screen'].every((key) => typeof media[key] === 'boolean') &&
      (v.kind !== 'welcome' || typeof v.to === 'string')
    )
  }
  if (typeof v.to !== 'string') return false
  if (v.kind === 'offer' || v.kind === 'answer')
    return typeof v.sdp === 'string' && v.sdp.length < 100_000
  return v.kind === 'ice' && (v.candidate === null || typeof v.candidate === 'object')
}
export function createAwarenessCallTransport(
  awareness: CallAwareness,
  session: string,
  did: string,
  members: ReadonlySet<string>
): SignalingTransport {
  let sequence = 0
  let closed = false
  let flushing = false
  let history: Array<{ sequence: number; signal: CallSignal }> = []
  const seen = new Map<string, number>()
  const present = new Set<string>()
  const handlers = new Set<(signal: CallSignal) => void>()
  const emit = (signal: CallSignal) => {
    for (const handler of handlers) handler(signal)
  }
  const receive = () => {
    if (closed) return
    const current = new Set<string>()
    for (const [clientId, state] of awareness.getStates()) {
      if (clientId === awareness.clientID) continue
      const raw: unknown = state[FIELD]
      if (!raw || typeof raw !== 'object') continue
      const record = raw as Record<string, unknown>
      if (
        typeof record.session !== 'string' ||
        typeof record.did !== 'string' ||
        !members.has(record.did) ||
        !Array.isArray(record.history)
      )
        continue
      current.add(record.session)
      for (const item of record.history.slice(-64) as unknown[]) {
        if (!item || typeof item !== 'object') continue
        const entry = item as Record<string, unknown>
        if (
          !Number.isSafeInteger(entry.sequence) ||
          typeof entry.sequence !== 'number' ||
          entry.sequence <= (seen.get(record.session) ?? 0) ||
          !isSignal(entry.signal) ||
          entry.signal.from !== record.session
        )
          continue
        if ('did' in entry.signal && entry.signal.did !== record.did) continue
        // Mark before dispatch: a welcome can synchronously trigger another awareness update.
        seen.set(record.session, entry.sequence)
        emit(entry.signal)
      }
    }
    for (const previous of present)
      if (!current.has(previous)) emit({ kind: 'leave', from: previous })
    present.clear()
    for (const peer of current) present.add(peer)
  }
  awareness.on('change', receive)
  return {
    send(signal) {
      if (closed) return
      history = [...history, { sequence: ++sequence, signal }].slice(-64)
      if (!flushing) {
        flushing = true
        queueMicrotask(() => {
          flushing = false
          if (!closed) awareness.setLocalStateField(FIELD, { session, did, history })
        })
      }
    },
    onMessage(handler) {
      handlers.add(handler)
      queueMicrotask(receive)
      return () => handlers.delete(handler)
    },
    close() {
      closed = true
      awareness.off('change', receive)
      awareness.setLocalStateField(FIELD, null)
      handlers.clear()
    }
  }
}
