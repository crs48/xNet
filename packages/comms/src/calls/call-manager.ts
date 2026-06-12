/**
 * CallManager — full-mesh WebRTC calls (exploration 0167, tier 0).
 *
 * Membership protocol over the signaling transport:
 *   join    → announce {from, media}
 *   peer    → welcome {to: newcomer} (so the newcomer learns the room)
 *   pairing → the session with the lexicographically smaller sessionId
 *             initiates the offer (deterministic, no glare)
 *   leave   → leave {from}; peers tear down that connection
 *
 * The mesh ceiling is enforced reactively: when the room exceeds capacity
 * for the local media kind, the manager reports 'full' and refuses new
 * connections (UI should gate joining on presence occupancy first).
 */

import type {
  CallPeerSnapshot,
  CallSelf,
  CallSignal,
  CallStatus,
  MediaFlags,
  PeerConnectionLike,
  SignalingTransport
} from './types'
import { meshCapacity } from './types'

export interface CallManagerOptions {
  self: CallSelf
  transport: SignalingTransport
  /** Build a peer connection (injectable; default to RTCPeerConnection in the app layer) */
  createPeerConnection: () => PeerConnectionLike
  /** Local media tracks to attach before offering: [track, stream] pairs */
  getLocalTracks?: () => Array<[unknown, unknown]>
  /** Participant ceiling including self; defaults from local media kind */
  maxParticipants?: number
}

export interface CallManager {
  join(media: MediaFlags): void
  leave(): void
  getStatus(): CallStatus
  getPeers(): CallPeerSnapshot[]
  /** Swap the outgoing video track on every connection (screen share). */
  replaceVideoTrack(track: unknown): Promise<void>
  onChange(handler: () => void): () => void
}

interface PeerEntry {
  sessionId: string
  did: string
  media: MediaFlags
  connection: PeerConnectionLike | null
  stream: unknown | null
}

export function createCallManager(options: CallManagerOptions): CallManager {
  const { self, transport } = options
  const peers = new Map<string, PeerEntry>()
  const handlers = new Set<() => void>()
  let status: CallStatus = 'idle'
  let media: MediaFlags = { audio: true, video: false, screen: false }
  let unsubscribe: (() => void) | null = null

  function emit(): void {
    for (const handler of handlers) handler()
  }

  function setStatus(next: CallStatus): void {
    if (status !== next) {
      status = next
      emit()
    }
  }

  function capacity(): number {
    return options.maxParticipants ?? meshCapacity(media)
  }

  /** The lexicographically smaller sessionId initiates — deterministic, no glare. */
  function iInitiate(remoteSessionId: string): boolean {
    return self.sessionId < remoteSessionId
  }

  function attachLocalTracks(connection: PeerConnectionLike): void {
    for (const [track, stream] of options.getLocalTracks?.() ?? []) {
      connection.addTrack?.(track, stream)
    }
  }

  function createConnection(remote: PeerEntry): PeerConnectionLike {
    const connection = options.createPeerConnection()
    remote.connection = connection
    attachLocalTracks(connection)
    connection.onicecandidate = (event) => {
      if (event.candidate) {
        transport.send({
          kind: 'ice',
          from: self.sessionId,
          to: remote.sessionId,
          candidate: event.candidate
        })
      }
    }
    connection.ontrack = (event) => {
      remote.stream = event.streams[0] ?? null
      emit()
    }
    connection.onconnectionstatechange = () => emit()
    return connection
  }

  function roomHasCapacity(): boolean {
    // After adding one more peer, peers + self must fit the ceiling.
    return peers.size < capacity() - 1
  }

  function addPeer(sessionId: string, did: string, peerMedia: MediaFlags): PeerEntry | null {
    const existing = peers.get(sessionId)
    if (existing) return existing
    if (!roomHasCapacity()) {
      setStatus('full')
      return null
    }
    const entry: PeerEntry = { sessionId, did, media: peerMedia, connection: null, stream: null }
    peers.set(sessionId, entry)
    emit()
    return entry
  }

  async function startOffer(remote: PeerEntry): Promise<void> {
    const connection = createConnection(remote)
    const offer = await connection.createOffer()
    await connection.setLocalDescription(offer)
    transport.send({
      kind: 'offer',
      from: self.sessionId,
      to: remote.sessionId,
      sdp: offer.sdp ?? ''
    })
  }

  async function answerOffer(remote: PeerEntry, sdp: string): Promise<void> {
    const connection = remote.connection ?? createConnection(remote)
    await connection.setRemoteDescription({ type: 'offer', sdp })
    const answer = await connection.createAnswer()
    await connection.setLocalDescription(answer)
    transport.send({
      kind: 'answer',
      from: self.sessionId,
      to: remote.sessionId,
      sdp: answer.sdp ?? ''
    })
  }

  function dropPeer(sessionId: string): void {
    const entry = peers.get(sessionId)
    if (!entry) return
    entry.connection?.close()
    peers.delete(sessionId)
    emit()
  }

  function handleAnnounce(signal: Extract<CallSignal, { kind: 'announce' }>): void {
    const entry = addPeer(signal.from, signal.did, signal.media)
    if (!entry) return
    transport.send({
      kind: 'welcome',
      from: self.sessionId,
      to: signal.from,
      did: self.did,
      media
    })
    if (iInitiate(signal.from)) void startOffer(entry)
  }

  function handleWelcome(signal: Extract<CallSignal, { kind: 'welcome' }>): void {
    const entry = addPeer(signal.from, signal.did, signal.media)
    if (entry && iInitiate(signal.from)) void startOffer(entry)
  }

  function handleTargeted(signal: CallSignal): void {
    if (signal.kind === 'offer') {
      const entry = peers.get(signal.from)
      if (entry) void answerOffer(entry, signal.sdp)
      return
    }
    if (signal.kind === 'answer') {
      void peers.get(signal.from)?.connection?.setRemoteDescription({
        type: 'answer',
        sdp: signal.sdp
      })
      return
    }
    if (signal.kind === 'ice') {
      void peers.get(signal.from)?.connection?.addIceCandidate(signal.candidate)
    }
  }

  function handleSignal(signal: CallSignal): void {
    if (signal.from === self.sessionId) return
    if ('to' in signal && signal.to !== self.sessionId) return
    if (signal.kind === 'announce') return handleAnnounce(signal)
    if (signal.kind === 'welcome') return handleWelcome(signal)
    if (signal.kind === 'leave') return dropPeer(signal.from)
    handleTargeted(signal)
  }

  return {
    join(joinMedia) {
      if (status === 'in-call' || status === 'joining') return
      media = joinMedia
      setStatus('joining')
      unsubscribe = transport.onMessage(handleSignal)
      transport.send({ kind: 'announce', from: self.sessionId, did: self.did, media })
      setStatus('in-call')
    },
    leave() {
      if (status === 'idle' || status === 'left') return
      transport.send({ kind: 'leave', from: self.sessionId })
      unsubscribe?.()
      unsubscribe = null
      for (const sessionId of [...peers.keys()]) dropPeer(sessionId)
      transport.close()
      setStatus('left')
    },
    async replaceVideoTrack(track) {
      for (const entry of peers.values()) {
        const senders = entry.connection?.getSenders?.() ?? []
        const videoSender = senders.find((sender) => sender.track?.kind === 'video')
        if (videoSender) await videoSender.replaceTrack(track)
      }
    },
    getStatus: () => status,
    getPeers: () =>
      [...peers.values()].map((entry) => ({
        sessionId: entry.sessionId,
        did: entry.did,
        media: entry.media,
        stream: entry.stream,
        connectionState: entry.connection?.connectionState ?? 'new'
      })),
    onChange(handler) {
      handlers.add(handler)
      return () => handlers.delete(handler)
    }
  }
}
