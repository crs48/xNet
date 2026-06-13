/**
 * Federated query routing.
 *
 * The router answers a query from the local engine plus any peer/hub sources
 * that advertise relevant capabilities, merging results with de-duplication.
 * Peer-source discovery and the remote transport are injected so the router is
 * unit-testable and so callers (people-match, search, …) control federation
 * scope. With neither injected it degrades cleanly to local-only.
 */
import type { Query, QueryResult } from '../types'
import type { DataSource } from '@xnetjs/core'
import type { NetworkNode } from '@xnetjs/network'

/**
 * Federated query router interface
 */
export interface FederatedQueryRouter {
  /** Find sources that can answer query */
  findSources(query: Query): Promise<DataSource[]>

  /** Route query to remote source */
  routeToRemote(query: Query, source: DataSource): Promise<QueryResult<unknown>>

  /** Execute federated query */
  execute(query: Query): Promise<QueryResult<unknown>>
}

/** Transport that sends a query to a remote source and returns its result. */
export type RemoteQueryTransport = (
  query: Query,
  source: DataSource
) => Promise<QueryResult<unknown>>

export interface FederatedQueryRouterOptions {
  /**
   * Resolve which peer/hub sources can answer a query (beyond local). Defaults
   * to none. A people-match caller passes the connected directory hubs here.
   */
  resolvePeerSources?: (query: Query) => DataSource[] | Promise<DataSource[]>
  /** Transport used by `routeToRemote`. Required to actually query peers. */
  remoteTransport?: RemoteQueryTransport
  /** Per-source timeout in ms (default 5000). A slow peer never stalls the query. */
  remoteTimeoutMs?: number
}

type IdLike = { id?: unknown }

function dedupeById(items: readonly unknown[]): unknown[] {
  const seen = new Set<string>()
  const output: unknown[] = []
  for (const item of items) {
    const id = (item as IdLike)?.id
    const key = typeof id === 'string' ? id : null
    if (key !== null) {
      if (seen.has(key)) continue
      seen.add(key)
    }
    output.push(item)
  }
  return output
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('remote-query-timeout')), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}

/**
 * Create a federated query router
 */
export function createFederatedQueryRouter(
  node: NetworkNode,
  localEngine: { query: (q: Query) => Promise<QueryResult<unknown>> },
  options: FederatedQueryRouterOptions = {}
): FederatedQueryRouter {
  const timeout = options.remoteTimeoutMs ?? 5000
  void node // reserved: peer enumeration can fall back to node.libp2p.getPeers()

  return {
    async findSources(query: Query): Promise<DataSource[]> {
      const sources: DataSource[] = [{ type: 'local', id: 'local', estimatedLatency: 0 }]
      const peers = (await options.resolvePeerSources?.(query)) ?? []
      for (const peer of peers) {
        if (peer.type !== 'local') sources.push(peer)
      }
      return sources
    },

    async routeToRemote(query: Query, source: DataSource): Promise<QueryResult<unknown>> {
      if (!options.remoteTransport) {
        throw new Error('Remote query not implemented: no remoteTransport configured')
      }
      return withTimeout(options.remoteTransport(query, source), timeout)
    },

    async execute(query: Query): Promise<QueryResult<unknown>> {
      const sources = await this.findSources(query)
      const results = await Promise.all(
        sources.map(async (source) => {
          if (source.type === 'local') {
            return localEngine.query(query)
          }
          try {
            return await this.routeToRemote(query, source)
          } catch {
            // A failed/slow peer must not fail the whole federated query.
            return { items: [], total: 0, hasMore: false } satisfies QueryResult<unknown>
          }
        })
      )

      const merged = dedupeById(results.flatMap((result) => result.items))
      const limited = query.limit !== undefined ? merged.slice(0, query.limit) : merged
      return {
        items: limited,
        total: merged.length,
        hasMore: results.some((result) => result.hasMore) || limited.length < merged.length
      }
    }
  }
}
