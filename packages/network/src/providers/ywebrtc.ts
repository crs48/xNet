/**
 * y-webrtc integration for real-time document sync
 */
import type { Doc } from 'yjs'
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
  doc: Doc,
  roomName: string,
  options: YWebRTCOptions
): YWebRTCProvider {
  const provider = new WebrtcProvider(roomName, doc, {
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
 * Get number of connected WebRTC peers
 */
export function getConnectedPeers(provider: YWebRTCProvider): number {
  // Access the internal room's webrtcConns map for actual peer count
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const room = (provider.provider as any).room
  if (room && room.webrtcConns) {
    return room.webrtcConns.size
  }
  return 0
}

/**
 * Subscribe to peer changes
 */
export function onPeersChange(
  provider: YWebRTCProvider,
  callback: (peers: string[]) => void
): () => void {
  const handler = (event: { webrtcPeers: string[]; bcPeers: string[] }) => {
    // Combine WebRTC peers and broadcast channel peers
    const allPeers = [...event.webrtcPeers, ...event.bcPeers]
    callback(allPeers)
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
