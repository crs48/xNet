/**
 * usePeerDiscovery - hub peer discovery hook.
 */

import { useCallback, useContext, useMemo, useState } from 'react'
import { XNetContext } from '../context'

export interface DiscoveredPeer {
  did: string
  displayName?: string
  endpoints: Array<{ type: string; address: string; priority?: number }>
  lastSeen: number
  isOnline: boolean
}

const toHubHttpUrl = (hubUrl: string): string =>
  hubUrl.replace('wss://', 'https://').replace('ws://', 'http://')

export const usePeerDiscovery = (): {
  peers: DiscoveredPeer[]
  resolve: (did: string) => Promise<DiscoveredPeer | null>
  refresh: () => Promise<void>
  loading: boolean
} => {
  const context = useContext(XNetContext)
  const hubUrl = context?.hubUrl ?? null

  const [peers, setPeers] = useState<DiscoveredPeer[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!hubUrl) return
    setLoading(true)
    try {
      const hubHttpUrl = toHubHttpUrl(hubUrl)
      const res = await fetch(`${hubHttpUrl}/dids?limit=50`)
      if (!res.ok) return
      const { peers: records } = (await res.json()) as { peers: DiscoveredPeer[] }
      const now = Date.now()
      setPeers(
        records.map((record) => ({
          did: record.did,
          displayName: record.displayName,
          endpoints: record.endpoints,
          lastSeen: record.lastSeen,
          isOnline: now - record.lastSeen < 5 * 60 * 1000
        }))
      )
    } finally {
      setLoading(false)
    }
  }, [hubUrl])

  const resolve = useCallback(
    async (did: string): Promise<DiscoveredPeer | null> => {
      if (!hubUrl) return null
      const hubHttpUrl = toHubHttpUrl(hubUrl)
      const res = await fetch(`${hubHttpUrl}/dids/${encodeURIComponent(did)}`)
      if (!res.ok) return null
      const record = (await res.json()) as DiscoveredPeer
      return {
        did: record.did,
        displayName: record.displayName,
        endpoints: record.endpoints,
        lastSeen: record.lastSeen,
        isOnline: Date.now() - record.lastSeen < 5 * 60 * 1000
      }
    },
    [hubUrl]
  )

  return useMemo(
    () => ({
      peers,
      resolve,
      refresh,
      loading
    }),
    [peers, resolve, refresh, loading]
  )
}
