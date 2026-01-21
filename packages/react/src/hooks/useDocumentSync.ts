/**
 * useDocumentSync hook for P2P document sync via y-webrtc
 *
 * @deprecated Use `useDocument` instead, which includes built-in sync support.
 *
 * @example
 * ```tsx
 * // OLD (deprecated):
 * const { data: document } = useDocument(docId)
 * const { connected } = useDocumentSync({ document })
 *
 * // NEW (recommended):
 * const { data, doc, syncStatus, peerCount } = useDocument(PageSchema, pageId)
 * // - data: Node properties (LWW synced)
 * // - doc: Y.Doc instance (auto-synced via y-webrtc)
 * // - syncStatus: 'offline' | 'connecting' | 'connected'
 * // - peerCount: number of connected peers
 * ```
 */
import { useEffect, useState, useRef } from 'react'
import { createYWebRTCProvider, type YWebRTCProvider } from '@xnet/network'
import type { XDocument } from '@xnet/data'
import { useXNet } from '../context'

/**
 * Options for document sync
 */
export interface UseDocumentSyncOptions {
  /** Document to sync */
  document: XDocument | null
  /** Signaling server URLs (defaults to localhost for dev) */
  signalingServers?: string[]
  /** Enable sync (defaults to true) */
  enabled?: boolean
}

/**
 * Result from useDocumentSync hook
 */
export interface UseDocumentSyncResult {
  /** Whether connected to signaling server */
  connected: boolean
  /** Number of connected peers */
  peerCount: number
  /** List of peer IDs */
  peers: string[]
}

/** Default signaling servers for local development */
const DEFAULT_SIGNALING_SERVERS = ['ws://localhost:4000']

/**
 * Hook to enable P2P sync for a document via y-webrtc
 *
 * @example
 * ```tsx
 * const { data: document } = useDocument(docId)
 * const { connected, peerCount } = useDocumentSync({ document })
 * ```
 */
export function useDocumentSync(options: UseDocumentSyncOptions): UseDocumentSyncResult {
  const { document, signalingServers = DEFAULT_SIGNALING_SERVERS, enabled = true } = options
  const { store } = useXNet()
  const providerRef = useRef<YWebRTCProvider | null>(null)
  const [connected, setConnected] = useState(false)
  const [peers, setPeers] = useState<string[]>([])

  useEffect(() => {
    if (!document || !enabled || signalingServers.length === 0) {
      return
    }

    // Create room name based on document ID
    const roomName = `xnet-doc-${document.id}`

    // Create y-webrtc provider
    const provider = createYWebRTCProvider(document, roomName, {
      signalingServers
    })
    providerRef.current = provider

    // Update sync status in store
    store.getState().setSyncStatus('connecting')

    // Monitor connection status
    const checkConnection = () => {
      const isConnected = provider.provider.connected
      setConnected(isConnected)
      store.getState().setSyncStatus(isConnected ? 'synced' : 'connecting')
    }

    // Check initial connection
    checkConnection()

    // Monitor peer changes
    provider.provider.on('peers', (event: { webrtcPeers: string[] }) => {
      const peerList = event.webrtcPeers || []
      setPeers(peerList)
      store.getState().setPeers(peerList)
    })

    // Monitor connection status changes
    provider.provider.on('status', (event: { connected: boolean }) => {
      setConnected(event.connected)
      store.getState().setSyncStatus(event.connected ? 'synced' : 'connecting')
    })

    // Cleanup on unmount or document change
    return () => {
      provider.destroy()
      providerRef.current = null
      store.getState().setSyncStatus('offline')
      store.getState().setPeers([])
      setConnected(false)
      setPeers([])
    }
  }, [document?.id, enabled, signalingServers.join(','), store])

  return {
    connected,
    peerCount: peers.length,
    peers
  }
}
