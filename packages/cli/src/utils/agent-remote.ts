/**
 * HTTP-backed NodeStore/SchemaRegistry adapters for the agent CLI.
 *
 * The CLI runs outside the xNet app process; it talks to the local API
 * (default http://127.0.0.1:31415, see LocalAPIServer) and presents the same
 * NodeStoreAPI/SchemaRegistryAPI interfaces the AI surface core expects.
 */

import type { NodeData, NodeStoreAPI, SchemaData, SchemaRegistryAPI } from '@xnetjs/plugins/node'

export type RemoteBackendOptions = {
  apiUrl?: string
  token?: string
}

export type AgentBackend = {
  store: NodeStoreAPI
  schemas: SchemaRegistryAPI
}

class RemoteApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
    this.name = 'RemoteApiError'
  }
}

export async function createRemoteAgentBackend(
  options: RemoteBackendOptions = {}
): Promise<AgentBackend> {
  const baseUrl = (options.apiUrl ?? process.env.XNET_API_URL ?? 'http://127.0.0.1:31415').replace(
    /\/$/,
    ''
  )
  const token = options.token ?? process.env.XNET_API_TOKEN

  const request = async (method: string, path: string, body?: unknown): Promise<unknown> => {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {})
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    })
    const text = await response.text()
    const parsed = text ? (JSON.parse(text) as unknown) : null
    if (!response.ok) {
      const message =
        isRecord(parsed) && typeof parsed.error === 'string'
          ? parsed.error
          : `${method} ${path} failed with ${response.status}`
      throw new RemoteApiError(message, response.status)
    }
    return parsed
  }

  const store: NodeStoreAPI = {
    get: async (id) => {
      try {
        return (await request('GET', `/api/v1/nodes/${encodeURIComponent(id)}`)) as NodeData
      } catch (err) {
        if (err instanceof RemoteApiError && err.status === 404) return null
        throw err
      }
    },
    list: async (listOptions) => {
      const params = new URLSearchParams()
      if (listOptions?.schemaId) params.set('schema', listOptions.schemaId)
      if (listOptions?.limit !== undefined) params.set('limit', String(listOptions.limit))
      if (listOptions?.offset !== undefined) params.set('offset', String(listOptions.offset))
      const query = params.size > 0 ? `?${params.toString()}` : ''
      const result = await request('GET', `/api/v1/nodes${query}`)
      return isRecord(result) && Array.isArray(result.nodes) ? (result.nodes as NodeData[]) : []
    },
    // Full-text search runs in the process that owns the FTS index, not here
    // (exploration 0415). Without this the CLI's own AI surface finds no
    // `searchText` on the store and silently degrades to a substring scan over
    // the first 500 nodes — in the configuration users are most likely to run.
    searchText: async (query, limit, searchOptions) => {
      const params = new URLSearchParams({ q: query, limit: String(limit) })
      if (searchOptions?.schemaId) params.set('schemaId', searchOptions.schemaId)
      const result = await request('GET', `/api/v1/ai/search?${params.toString()}`)
      if (!isRecord(result) || !Array.isArray(result.results)) return null
      // The server scanned instead of indexing. Returning its rows would launder
      // a degraded search into an indexed-looking one; `null` lets the caller
      // report the degradation it actually got.
      if (result.degraded === true) return null
      return result.results.flatMap((row) => {
        if (!isRecord(row) || typeof row.id !== 'string') return []
        // Local-API scores are higher-is-better; FTS rank is more-negative-is-better.
        return [{ nodeId: row.id, rank: -(typeof row.score === 'number' ? row.score : 0) }]
      })
    },
    create: async ({ schemaId, properties }) =>
      (await request('POST', '/api/v1/nodes', { schema: schemaId, properties })) as NodeData,
    update: async (id, { properties }) =>
      (await request('PATCH', `/api/v1/nodes/${encodeURIComponent(id)}`, properties)) as NodeData,
    delete: async (id) => {
      await request('DELETE', `/api/v1/nodes/${encodeURIComponent(id)}`)
    },
    subscribe: () => () => {}
  }

  // SchemaRegistryAPI.getAllIRIs is synchronous; prefetch the registry once.
  const schemaCache = new Map<string, SchemaData>()
  const listed = await request('GET', '/api/v1/schemas')
  if (isRecord(listed) && Array.isArray(listed.schemas)) {
    for (const schema of listed.schemas) {
      if (isRecord(schema) && typeof schema.iri === 'string') {
        schemaCache.set(schema.iri, schema as unknown as SchemaData)
      }
    }
  }

  const schemas: SchemaRegistryAPI = {
    getAllIRIs: () => Array.from(schemaCache.keys()),
    get: async (iri) => {
      const cached = schemaCache.get(iri)
      if (cached) return cached
      try {
        const fetched = (await request(
          'GET',
          `/api/v1/schemas/${encodeURIComponent(iri)}`
        )) as SchemaData
        schemaCache.set(iri, fetched)
        return fetched
      } catch (err) {
        if (err instanceof RemoteApiError && err.status === 404) return null
        throw err
      }
    }
  }

  return { store, schemas }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
