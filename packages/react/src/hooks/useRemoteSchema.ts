/**
 * useRemoteSchema - Hub schema registry fetch hook.
 */

import { useContext, useEffect, useMemo, useState } from 'react'
import { XNetContext } from '../context'

export interface RemoteSchemaDefinition {
  iri: string
  version: number
  name: string
  description: string
  definition: Record<string, unknown>
  authorDid: string
  propertiesCount: number
  createdAt: number
}

export interface RemoteSchemaState {
  schema: RemoteSchemaDefinition | null
  loading: boolean
  error: Error | null
}

const toHubHttpUrl = (hubUrl: string): string => {
  if (hubUrl.startsWith('http://') || hubUrl.startsWith('https://')) return hubUrl
  return hubUrl.replace('wss://', 'https://').replace('ws://', 'http://')
}

export const useRemoteSchema = (iri: string | undefined): RemoteSchemaState => {
  const context = useContext(XNetContext)
  const hubUrl = context?.hubUrl ?? null
  const getHubAuthToken = context?.getHubAuthToken

  const [schema, setSchema] = useState<RemoteSchemaDefinition | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!iri || !hubUrl) {
      setSchema(null)
      setLoading(false)
      return
    }

    let cancelled = false
    const controller = new AbortController()

    const fetchSchema = async (): Promise<void> => {
      setLoading(true)
      setError(null)

      try {
        const hubHttpUrl = toHubHttpUrl(hubUrl)
        const encodedIri = encodeURIComponent(iri)
        const token = getHubAuthToken ? await getHubAuthToken() : ''
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined

        const response = await fetch(`${hubHttpUrl}/schemas/resolve/${encodedIri}`, {
          headers,
          signal: controller.signal
        })

        if (!response.ok) {
          if (response.status === 404) {
            if (!cancelled) setSchema(null)
            return
          }
          throw new Error(`Failed to resolve schema: ${response.status}`)
        }

        const data = (await response.json()) as RemoteSchemaDefinition
        if (!cancelled) setSchema(data)
      } catch (err) {
        if (cancelled) return
        if (err instanceof DOMException && err.name === 'AbortError') return
        const errorValue = err instanceof Error ? err : new Error('Schema lookup failed')
        setError(errorValue)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void fetchSchema()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [getHubAuthToken, hubUrl, iri])

  return useMemo(
    () => ({
      schema,
      loading,
      error
    }),
    [schema, loading, error]
  )
}
