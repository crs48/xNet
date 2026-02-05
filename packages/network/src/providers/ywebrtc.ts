/**
 * y-webrtc integration for real-time document sync
 */
import type { XDocument } from '@xnet/data'
import { WebrtcProvider } from 'y-webrtc'

/**
 * Options for y-webrtc provider
 */
export interface YWebRTCOptions {
  signalingServers: string[]
  password?: string
  maxConns?: number
}

/**
 * y-webrtc provider wrapper
 */
export interface YWebRTCProvider {
  provider: WebrtcProvider
  destroy: () => void
}

/**
 * Create a y-webrtc provider for a document
 */
export function createYWebRTCProvider(
  doc: XDocument,
  roomName: string,
  options: YWebRTCOptions
): YWebRTCProvider {
  const provider = new WebrtcProvider(roomName, doc.ydoc, {
    signaling: options.signalingServers,
    password: options.password,
    maxConns: options.maxConns ?? 20
  })

  return {
    provider,
    destroy: () => provider.destroy()
  }
}

/**
 * Get number of connected peers (simplified)
 */
export function getConnectedPeers(provider: YWebRTCProvider): number {
  return provider.provider.connected ? 1 : 0
}

/**
 * Subscribe to peer changes
 */
export function onPeersChange(
  provider: YWebRTCProvider,
  callback: (peers: string[]) => void
): () => void {
  const handler = () => {
    // Would get actual peer list from provider
    callback([])
  }
  provider.provider.on('peers', handler)
  return () => provider.provider.off('peers', handler)
}

/**
 * Check if provider is connected
 */
export function isConnected(provider: YWebRTCProvider): boolean {
  return provider.provider.connected
}
