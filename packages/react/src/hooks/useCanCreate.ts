/**
 * useCanCreate - Check whether the current user may create a node of a schema
 * (exploration 0304).
 *
 * The check runs against a *draft* node built from `schemaId` + `properties`,
 * so container relations in the draft (e.g. `space`, `channel`) resolve
 * membership roles — pass the relation the composer is about to write into:
 *
 * ```tsx
 * const { canCreate } = useCanCreate(CHAT_MESSAGE_SCHEMA_IRI, { channel: channelId })
 * <SendButton disabled={!canCreate} />
 * ```
 *
 * Schemas that declare no `create` expression fall back to their `write`
 * policy, which includes the creator role in every preset — those schemas
 * resolve to `canCreate: true`.
 */

import type { SchemaIRI } from '@xnetjs/data'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNodeStore } from './useNodeStore'

export type UseCanCreateResult = {
  canCreate: boolean
  loading: boolean
  error: Error | null
}

const INITIAL_STATE: UseCanCreateResult = {
  canCreate: false,
  loading: true,
  error: null
}

export function useCanCreate(
  schemaId: SchemaIRI,
  properties?: Record<string, unknown>
): UseCanCreateResult {
  const { store, isReady } = useNodeStore()
  const [state, setState] = useState<UseCanCreateResult>(INITIAL_STATE)
  const requestRef = useRef(0)

  // Re-run on content changes, not object identity — composers rebuild the
  // draft properties object every render.
  const propertiesKey = useMemo(() => JSON.stringify(properties ?? {}), [properties])

  useEffect(() => {
    if (!store || !isReady) {
      setState((prev) => ({ ...prev, loading: true }))
      return
    }

    if (!store.auth) {
      setState({
        ...INITIAL_STATE,
        loading: false,
        error: new Error('Authorization API is not configured on this NodeStore')
      })
      return
    }

    const run = async (): Promise<void> => {
      const requestId = ++requestRef.current
      setState((prev) => ({ ...prev, loading: true, error: null }))

      try {
        const decision = await store.auth!.can({
          action: 'create',
          // A synthetic id: the draft node must not collide with a stored one.
          nodeId: `draft:${schemaId}`,
          node: {
            schemaId,
            properties: JSON.parse(propertiesKey) as Record<string, unknown>
          }
        })

        if (requestRef.current !== requestId) return

        setState({ canCreate: decision.allowed, loading: false, error: null })
      } catch (error) {
        if (requestRef.current !== requestId) return
        const normalized = error instanceof Error ? error : new Error(String(error))
        setState((prev) => ({ ...prev, loading: false, error: normalized }))
      }
    }

    void run()
  }, [isReady, propertiesKey, schemaId, store])

  return state
}
