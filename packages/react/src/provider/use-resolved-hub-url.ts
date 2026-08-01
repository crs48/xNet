/**
 * Resolve-then-connect for the hub URL (exploration 0423).
 *
 * `config.hubUrl` still works and is still the direct path — pointing a client
 * at a hub you already know the address of is the self-host case and must stay
 * a one-liner. `config.hubAddress` is the alternative for a managed hub, whose
 * substrate URL is not stable: the client holds a name, resolves it once,
 * caches the answer, and dials the hub **directly**.
 *
 * The hook never blocks connection on the resolver. Until an answer arrives it
 * yields the configured `hubUrl` (if any), so a resolver that is slow or down
 * costs freshness, never reachability.
 */

import { useEffect, useRef, useState } from 'react'
import {
  httpResolver,
  resolveHubUrl,
  type HubAddressOutcome,
  type HubAddressStorage
} from '@xnetjs/runtime'

export interface HubAddressConfig {
  /** The stable name to resolve — the hub's DID (as published on `/health`). */
  name: string
  /** Resolver base URL; the name is appended as a path segment. */
  resolverUrl: string
  /** Override the cache store (defaults to `localStorage` when available). */
  storage?: HubAddressStorage
  /** Injectable for tests. */
  fetchImpl?: typeof fetch
}

export interface ResolvedHubUrl {
  /** The URL to dial, or null while waking / unresolvable. */
  url: string | null
  /** Alternates to try if `url` fails. */
  fallbacks: string[]
  outcome: HubAddressOutcome | null
  /** True while the URL came from an expired cache entry. */
  stale: boolean
}

const memoryStorage = (): HubAddressStorage => {
  const map = new Map<string, string>()
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value)
  }
}

const defaultStorage = (): HubAddressStorage => {
  try {
    if (typeof localStorage !== 'undefined') return localStorage
  } catch {
    // Blocked by a storage policy — fall through to a per-session cache.
  }
  return memoryStorage()
}

/**
 * Resolve `address` to a hub URL, falling back to `configuredHubUrl`.
 *
 * A `waking` hub re-resolves after its retry hint rather than reporting the
 * hub as down: a cold tenant's address is genuinely absent for a few seconds,
 * and treating that as an outage is the bug this replaces.
 */
export function useResolvedHubUrl(
  address: HubAddressConfig | undefined,
  configuredHubUrl: string | null
): ResolvedHubUrl {
  const [state, setState] = useState<ResolvedHubUrl>({
    url: configuredHubUrl,
    fallbacks: [],
    outcome: null,
    stale: false
  })
  const storageRef = useRef<HubAddressStorage | null>(null)

  const name = address?.name ?? ''
  const resolverUrl = address?.resolverUrl ?? ''
  const explicitStorage = address?.storage
  const fetchImpl = address?.fetchImpl

  useEffect(() => {
    if (!name || !resolverUrl) {
      setState({ url: configuredHubUrl, fallbacks: [], outcome: null, stale: false })
      return
    }

    storageRef.current = explicitStorage ?? storageRef.current ?? defaultStorage()
    const storage = storageRef.current
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const run = async (): Promise<void> => {
      const outcome = await resolveHubUrl(name, {
        fetchResolution: httpResolver(resolverUrl, fetchImpl ?? fetch),
        storage
      })
      if (cancelled) return

      if (outcome.kind === 'ready') {
        setState({
          url: outcome.url,
          fallbacks: outcome.fallbacks,
          outcome,
          stale: outcome.stale
        })
        return
      }

      // Waking or unresolvable: keep whatever the app was configured with
      // rather than dropping the connection, and try again for a waking hub.
      setState({ url: configuredHubUrl, fallbacks: [], outcome, stale: false })
      if (outcome.kind === 'waking') {
        timer = setTimeout(() => void run(), outcome.retryAfterMs)
      }
    }

    void run()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [name, resolverUrl, configuredHubUrl, explicitStorage, fetchImpl])

  return state
}
