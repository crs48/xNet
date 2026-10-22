import { ChatMessageSchema } from '@xnetjs/data'
import { useQuery } from '@xnetjs/react'
import { useCallback, useEffect, useState } from 'react'
import { readDevelopmentEntry, type DevelopmentEntry } from './extension-development'

export function useDevelopmentRecords(where: {
  channel?: string
  developmentKind?: string
  developmentProject?: string
}) {
  const [limit, setLimit] = useState(500)
  const query = useQuery(ChatMessageSchema, { where, limit, orderBy: { createdAt: 'desc' } })
  const [entries, setEntries] = useState<DevelopmentEntry[]>([])
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)
  useEffect(() => {
    let alive = true
    setChecking(true)
    void Promise.allSettled(
      query.data.map((node) => readDevelopmentEntry({ ...node, properties: { ...node } }))
    ).then((results) => {
      if (!alive) return
      setEntries(
        results
          .flatMap((result) =>
            result.status === 'fulfilled' && result.value ? [result.value] : []
          )
          .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
      )
      setError(
        results.some((result) => result.status === 'rejected')
          ? 'Some development records failed integrity checks and were excluded.'
          : ''
      )
      setChecking(false)
    })
    return () => {
      alive = false
    }
  }, [query.data])
  const loadMore = useCallback(() => setLimit((value) => value + 500), [])
  return {
    entries: entries.filter((entry) =>
      query.data.some((node) => node.id === entry.id && !node.redacted)
    ),
    error: query.error?.message || error,
    loading: query.loading || checking,
    limited: query.data.length >= limit,
    loadMore
  }
}
