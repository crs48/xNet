/**
 * usePresence — typed, throttled, ephemeral peer state over Yjs Awareness.
 *
 * The generic sibling of the canvas presence manager
 * (packages/canvas/src/presence/canvas-presence.ts), extracted per
 * exploration 0314 so games and demos can broadcast high-frequency state
 * (cursors, positions, "who's here") WITHOUT touching the persisted
 * hash-chained change log. Awareness state lives in memory, relays through
 * the hub, and is evicted when a peer disconnects — nothing is written to
 * `node_changes` (the 0249 cold-open lesson).
 *
 * Pairs with `useNode`, which exposes the node's Awareness instance:
 *
 * ```tsx
 * const { awareness } = useNode(Room, roomId, { createIfMissing: {...} })
 * const { peers, setState } = usePresence(awareness, { x: 0, y: 0 })
 * onPointerMove={(e) => setState({ x: e.clientX, y: e.clientY })}
 * ```
 */
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Minimal Awareness surface (compatible with y-protocols/awareness).
 * Duck-typed so tests and non-Yjs transports can provide their own.
 */
export interface PresenceAwareness {
  clientID: number
  getLocalState(): Record<string, unknown> | null
  setLocalState(state: Record<string, unknown> | null): void
  getStates(): Map<number, Record<string, unknown>>
  on(event: 'change', handler: () => void): void
  off(event: 'change', handler: () => void): void
}

export interface PresencePeer<T> {
  /** Awareness client id (one per connected tab/device). */
  clientId: number
  /** That peer's presence state. */
  state: T
}

export interface UsePresenceOptions {
  /**
   * Minimum ms between broadcasts (default 33 ≈ 30fps). The hub rate-limits
   * at 100 messages/sec/connection and closes the socket on repeated
   * breaches — do not go below ~16ms.
   */
  throttleMs?: number
}

export interface UsePresenceResult<T> {
  /** Remote peers only (local client excluded). Evicted on disconnect. */
  peers: Array<PresencePeer<T>>
  /**
   * Merge a partial patch into local presence. Patches within one throttle
   * window coalesce into a single broadcast (leading + trailing edge).
   */
  setState: (patch: Partial<T>) => void
  /** Local awareness client id, or null before awareness attaches. */
  clientId: number | null
}

function readPeers<T>(
  awareness: PresenceAwareness,
  ownKeys: ReadonlySet<string>
): Array<PresencePeer<T>> {
  const peers: Array<PresencePeer<T>> = []
  awareness.getStates().forEach((state, clientId) => {
    if (clientId === awareness.clientID || !state) return
    // Only surface peers that carry at least one of this hook's fields —
    // filters out clients on the same doc that broadcast unrelated
    // awareness (e.g. editor cursors) but never joined this presence shape.
    for (const key of ownKeys) {
      if (key in state) {
        peers.push({ clientId, state: state as T })
        return
      }
    }
  })
  return peers
}

export function usePresence<T extends Record<string, unknown>>(
  awareness: PresenceAwareness | null | undefined,
  initialState: T,
  options: UsePresenceOptions = {}
): UsePresenceResult<T> {
  const { throttleMs = 33 } = options

  const [peers, setPeers] = useState<Array<PresencePeer<T>>>([])
  const [clientId, setClientId] = useState<number | null>(null)

  // The keys this hook owns: initialState's keys plus any key ever patched.
  // Unmount removes exactly these from awareness, preserving fields other
  // consumers (useNode's `user`, editor cursors) set on the same instance.
  const ownKeysRef = useRef<Set<string>>(new Set(Object.keys(initialState)))
  const initialStateRef = useRef(initialState)
  initialStateRef.current = initialState

  const awarenessRef = useRef<PresenceAwareness | null>(null)
  const pendingRef = useRef<Partial<T>>({})
  const lastBroadcastRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flush = useCallback(() => {
    const aw = awarenessRef.current
    if (!aw) return
    lastBroadcastRef.current = Date.now()
    const patch = pendingRef.current
    pendingRef.current = {}
    aw.setLocalState({ ...(aw.getLocalState() ?? {}), ...patch })
  }, [])

  const setState = useCallback(
    (patch: Partial<T>) => {
      for (const key of Object.keys(patch)) ownKeysRef.current.add(key)
      pendingRef.current = { ...pendingRef.current, ...patch }

      const elapsed = Date.now() - lastBroadcastRef.current
      if (elapsed >= throttleMs) {
        flush()
      } else if (timerRef.current === null) {
        timerRef.current = setTimeout(() => {
          timerRef.current = null
          flush()
        }, throttleMs - elapsed)
      }
    },
    [flush, throttleMs]
  )

  useEffect(() => {
    if (!awareness) {
      awarenessRef.current = null
      setClientId(null)
      setPeers([])
      return
    }

    awarenessRef.current = awareness
    setClientId(awareness.clientID)

    // Announce: merge initial state over whatever is already on the wire
    // (preserves e.g. the `user` field useNode broadcasts).
    awareness.setLocalState({
      ...(awareness.getLocalState() ?? {}),
      ...initialStateRef.current
    })
    lastBroadcastRef.current = Date.now()

    const handleChange = () => {
      setPeers(readPeers<T>(awareness, ownKeysRef.current))
    }
    handleChange()
    awareness.on('change', handleChange)

    return () => {
      awareness.off('change', handleChange)
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      pendingRef.current = {}
      // Retract only our fields; leave the rest of the awareness state to
      // its other owners. Peers see the retraction; full eviction happens
      // on disconnect via the awareness protocol timeout.
      const remaining = { ...(awareness.getLocalState() ?? {}) }
      for (const key of ownKeysRef.current) delete remaining[key]
      awareness.setLocalState(remaining)
      if (awarenessRef.current === awareness) awarenessRef.current = null
    }
  }, [awareness])

  return { peers, setState, clientId }
}
