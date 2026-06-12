/**
 * Call types (exploration 0167) — tiered topology, mesh tier.
 *
 * Mesh calls need no media infrastructure: signaling rides any y-webrtc
 * compatible pub/sub broker (the hub already is one), media flows P2P over
 * DTLS-SRTP. The mesh ceiling is deliberate — beyond it the exploration's
 * answer is an SFU, not a bigger mesh.
 */

export interface MediaFlags {
  audio: boolean
  video: boolean
  screen: boolean
}

/** A call participant identity: DID plus a per-tab session suffix. */
export interface CallSelf {
  did: string
  /** Unique per tab/device so one user in two tabs forms distinct peers */
  sessionId: string
}

export type CallSignal =
  | { kind: 'announce'; from: string; did: string; media: MediaFlags }
  | { kind: 'welcome'; from: string; to: string; did: string; media: MediaFlags }
  | { kind: 'offer'; from: string; to: string; sdp: string }
  | { kind: 'answer'; from: string; to: string; sdp: string }
  | { kind: 'ice'; from: string; to: string; candidate: unknown }
  | { kind: 'leave'; from: string }

/** A signaling channel scoped to one call room. */
export interface SignalingTransport {
  send(signal: CallSignal): void
  onMessage(handler: (signal: CallSignal) => void): () => void
  close(): void
}

/**
 * The slice of RTCPeerConnection the mesh logic uses — injectable so the
 * protocol is testable without a browser.
 */
export interface RtpSenderLike {
  track: { kind?: string } | null
  replaceTrack(track: unknown): Promise<void>
}

export interface PeerConnectionLike {
  createOffer(): Promise<{ sdp?: string; type: string }>
  createAnswer(): Promise<{ sdp?: string; type: string }>
  setLocalDescription(description: { sdp?: string; type: string }): Promise<void>
  setRemoteDescription(description: { sdp?: string; type: string }): Promise<void>
  addIceCandidate(candidate: unknown): Promise<void>
  addTrack?(track: unknown, stream: unknown): unknown
  getSenders?(): RtpSenderLike[]
  close(): void
  onicecandidate: ((event: { candidate: unknown | null }) => void) | null
  ontrack: ((event: { streams: unknown[] }) => void) | null
  onconnectionstatechange: (() => void) | null
  connectionState?: string
}

export interface CallPeerSnapshot {
  sessionId: string
  did: string
  media: MediaFlags
  /** Remote MediaStream once tracks arrive (unknown in non-DOM contexts) */
  stream: unknown | null
  connectionState: string
}

export type CallStatus = 'idle' | 'joining' | 'in-call' | 'full' | 'left'

/** Mesh ceilings from exploration 0167 (participants including self). */
export const MESH_MAX_VIDEO_PARTICIPANTS = 4
export const MESH_MAX_AUDIO_PARTICIPANTS = 8

export function meshCapacity(media: Pick<MediaFlags, 'video'>): number {
  return media.video ? MESH_MAX_VIDEO_PARTICIPANTS : MESH_MAX_AUDIO_PARTICIPANTS
}
