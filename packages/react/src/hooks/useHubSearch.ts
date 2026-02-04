/**
 * useHubSearch - Hub query hook.
 */
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { XNetContext } from '../context'

export interface HubSearchOptions {
  schemaIri?: string
  limit?: number
  offset?: number
}

export interface HubSearchResult {
  docId: string
  title: string
  schemaIri: string
  snippet: string
  rank: number
}

export interface HubSearchState {
  search: (query: string, options?: HubSearchOptions) => Promise<HubSearchResult[]>
  results: HubSearchResult[]
  loading: boolean
  error: Error | null
}

type PendingRequest = {
  resolve: (results: HubSearchResult[]) => void
  reject: (error: Error) => void
  timeoutId: ReturnType<typeof setTimeout>
}

const createRequestId = (): string => {
  const cryptoObj = globalThis.crypto
  if (cryptoObj && 'randomUUID' in cryptoObj) {
    return cryptoObj.randomUUID()
  }
  return Math.random().toString(36).slice(2)
}

export function useHubSearch(): HubSearchState {
  const context = useContext(XNetContext)
  const connection = context?.hubConnection ?? context?.syncManager?.connection ?? null

  const [results, setResults] = useState<HubSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const pendingRef = useRef<Map<string, PendingRequest>>(new Map())

  useEffect(() => {
    if (!connection) return

    const unsubscribe = connection.onMessage((message) => {
      const msg = message as {
        type?: string
        id?: string
        results?: HubSearchResult[]
        error?: string
      }

      if (!msg.type || !msg.id) return

      if (msg.type === 'query-response') {
        const pending = pendingRef.current.get(msg.id)
        if (pending) {
          pendingRef.current.delete(msg.id)
          clearTimeout(pending.timeoutId)
          pending.resolve(msg.results ?? [])
        }
      }

      if (msg.type === 'query-error') {
        const pending = pendingRef.current.get(msg.id)
        if (pending) {
          pendingRef.current.delete(msg.id)
          clearTimeout(pending.timeoutId)
          pending.reject(new Error(msg.error ?? 'Query failed'))
        }
      }
    })

    return () => {
      unsubscribe()
      for (const pending of pendingRef.current.values()) {
        clearTimeout(pending.timeoutId)
        pending.reject(new Error('Query cancelled'))
      }
      pendingRef.current.clear()
    }
  }, [connection])

  const search = useCallback(
    async (query: string, options?: HubSearchOptions): Promise<HubSearchResult[]> => {
      if (!connection || connection.status !== 'connected') {
        setError(new Error('Hub connection not available'))
        setResults([])
        return []
      }

      setLoading(true)
      setError(null)

      const id = createRequestId()

      const promise = new Promise<HubSearchResult[]>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          pendingRef.current.delete(id)
          reject(new Error('Query timeout'))
        }, 5000)

        pendingRef.current.set(id, { resolve, reject, timeoutId })
      })

      connection.sendRaw({
        type: 'query-request',
        id,
        query,
        filters: options?.schemaIri ? { schemaIri: options.schemaIri } : undefined,
        limit: options?.limit,
        offset: options?.offset
      })

      try {
        const response = await promise
        setResults(response)
        return response
      } catch (err) {
        const errorValue = err instanceof Error ? err : new Error('Search failed')
        setError(errorValue)
        setResults([])
        return []
      } finally {
        setLoading(false)
      }
    },
    [connection]
  )

  return useMemo(
    () => ({
      search,
      results,
      loading,
      error
    }),
    [search, results, loading, error]
  )
}
