/**
 * CallDock — mesh calls in a floating corner dock (0167).
 *
 * CallProvider owns at most one active call; it is mounted inside
 * CommsProvider but OUTSIDE the router, so an active call survives tab
 * switches and route changes (the Slack-huddle property). Signaling rides
 * the existing hub connection's pub/sub topics; media is P2P mesh.
 */
import {
  callTopic,
  createCallManager,
  meshCapacity,
  peersInCall,
  type CallManager,
  type CallSignal,
  type MediaFlags,
  type PeerConnectionLike,
  type SignalingTransport
} from '@xnetjs/comms'
import { useXNet } from '@xnetjs/react'
import { Mic, MicOff, Monitor, Phone, PhoneOff, Video, VideoOff } from 'lucide-react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode
} from 'react'
import { useComms } from './CommsContext'
import { useProfiles, displayName } from './hooks'

// ─── Signaling over the existing hub connection ──────────────────────────────

interface RoomConnection {
  joinRoom(room: string, handler: (data: Record<string, unknown>) => void): () => void
  publish(room: string, data: object): void
}

function hubSignaling(connection: RoomConnection, roomId: string): SignalingTransport {
  const topic = callTopic(roomId)
  const handlers = new Set<(signal: CallSignal) => void>()
  const leaveRoom = connection.joinRoom(topic, (data) => {
    for (const handler of handlers) handler(data as unknown as CallSignal)
  })
  return {
    send: (signal) => connection.publish(topic, signal),
    onMessage: (handler) => {
      handlers.add(handler)
      return () => handlers.delete(handler)
    },
    close: () => leaveRoom()
  }
}

// ─── Call state ──────────────────────────────────────────────────────────────

export interface ActiveCall {
  roomId: string
  manager: CallManager
  localStream: MediaStream
  media: MediaFlags
}

export interface CallApi {
  call: ActiveCall | null
  joinCall(roomId: string, options: { video: boolean }): Promise<void>
  leaveCall(): void
  toggleMute(): void
  toggleCamera(): void
  toggleScreenShare(): Promise<void>
  error: string | null
}

const CallContext = createContext<CallApi | null>(null)

export function useCall(): CallApi {
  const value = useContext(CallContext)
  if (!value) throw new Error('useCall must be used within CallProvider')
  return value
}

const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]

function newSessionId(did: string): string {
  return `${did}#${Math.random().toString(36).slice(2, 10)}`
}

export function CallProvider({ children }: { children: ReactNode }) {
  const { hubConnection } = useXNet()
  const { me, workspaceSession } = useComms()
  const [call, setCall] = useState<ActiveCall | null>(null)
  const [error, setError] = useState<string | null>(null)
  const callRef = useRef<ActiveCall | null>(null)
  callRef.current = call

  const announcePresence = useCallback(
    (roomId: string | null, media: MediaFlags | null) => {
      workspaceSession?.setCall(
        roomId && media
          ? { roomId, audio: media.audio, video: media.video, screen: media.screen }
          : null
      )
    },
    [workspaceSession]
  )

  const leaveCall = useCallback(() => {
    const active = callRef.current
    if (!active) return
    active.manager.leave()
    for (const track of active.localStream.getTracks()) track.stop()
    announcePresence(null, null)
    setCall(null)
  }, [announcePresence])

  const joinCall = useCallback(
    async (roomId: string, options: { video: boolean }) => {
      if (!hubConnection) {
        setError('Calls need a hub connection for signaling')
        return
      }
      leaveCall()
      setError(null)
      try {
        const localStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: options.video
        })
        const media: MediaFlags = { audio: true, video: options.video, screen: false }
        const manager = createCallManager({
          self: { did: me.did, sessionId: newSessionId(me.did) },
          transport: hubSignaling(hubConnection, roomId),
          createPeerConnection: () =>
            new RTCPeerConnection({ iceServers: ICE_SERVERS }) as unknown as PeerConnectionLike,
          getLocalTracks: () =>
            localStream.getTracks().map((track) => [track, localStream] as [unknown, unknown])
        })
        manager.join(media)
        announcePresence(roomId, media)
        setCall({ roomId, manager, localStream, media })
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not start the call')
      }
    },
    [hubConnection, me.did, leaveCall, announcePresence]
  )

  const setTrackEnabled = useCallback(
    (kind: 'audio' | 'video') => {
      const active = callRef.current
      if (!active) return
      const tracks =
        kind === 'audio' ? active.localStream.getAudioTracks() : active.localStream.getVideoTracks()
      for (const track of tracks) track.enabled = !track.enabled
      const media = {
        ...active.media,
        [kind]: tracks[0]?.enabled ?? false
      }
      announcePresence(active.roomId, media)
      setCall({ ...active, media })
    },
    [announcePresence]
  )

  const toggleScreenShare = useCallback(async () => {
    const active = callRef.current
    if (!active) return
    if (active.media.screen) {
      const cameraTrack = active.localStream.getVideoTracks()[0] ?? null
      await active.manager.replaceVideoTrack(cameraTrack)
      const media = { ...active.media, screen: false }
      announcePresence(active.roomId, media)
      setCall({ ...active, media })
      return
    }
    const display = await navigator.mediaDevices.getDisplayMedia({ video: true })
    const screenTrack = display.getVideoTracks()[0]
    if (!screenTrack) return
    await active.manager.replaceVideoTrack(screenTrack)
    screenTrack.onended = () => void toggleScreenShare()
    const media = { ...active.media, screen: true }
    announcePresence(active.roomId, media)
    setCall({ ...active, media })
  }, [announcePresence])

  useEffect(() => () => leaveCall(), [leaveCall])

  const value = useMemo<CallApi>(
    () => ({
      call,
      joinCall,
      leaveCall,
      toggleMute: () => setTrackEnabled('audio'),
      toggleCamera: () => setTrackEnabled('video'),
      toggleScreenShare,
      error
    }),
    [call, joinCall, leaveCall, setTrackEnabled, toggleScreenShare, error]
  )

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>
}

// ─── Join controls (channel header) ──────────────────────────────────────────

export function CallControls({
  roomId,
  autoJoinVoice = false
}: {
  roomId: string
  autoJoinVoice?: boolean
}) {
  const { call, joinCall, leaveCall } = useCall()
  const { workspacePeers } = useComms()
  const occupancy = peersInCall(workspacePeers, roomId).length
  const inThisCall = call?.roomId === roomId

  // Discord model: opening a voice room joins its call.
  useEffect(() => {
    if (autoJoinVoice && !inThisCall) void joinCall(roomId, { video: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoJoinVoice, roomId])

  if (inThisCall) {
    return (
      <button
        type="button"
        title="Leave call"
        onClick={leaveCall}
        className="flex h-6 cursor-pointer items-center gap-1 rounded-md border border-hairline bg-surface-0 px-2 text-[11px] text-red-500 hover:bg-surface-2"
      >
        <PhoneOff size={12} strokeWidth={1.5} /> Leave
      </button>
    )
  }

  const full = occupancy + 1 > meshCapacity({ video: false })
  return (
    <span className="flex items-center gap-1">
      {occupancy > 0 && <span className="font-mono text-[10px] text-ink-3">◉ {occupancy}</span>}
      <button
        type="button"
        title={full ? 'Room is full (mesh ceiling)' : 'Join audio'}
        disabled={full}
        onClick={() => void joinCall(roomId, { video: false })}
        className="flex h-6 cursor-pointer items-center rounded-md border border-hairline bg-surface-0 px-1.5 text-ink-2 hover:text-ink-1 disabled:cursor-default disabled:opacity-40"
      >
        <Phone size={12} strokeWidth={1.5} />
      </button>
      <button
        type="button"
        title="Join with video"
        onClick={() => void joinCall(roomId, { video: true })}
        className="flex h-6 cursor-pointer items-center rounded-md border border-hairline bg-surface-0 px-1.5 text-ink-2 hover:text-ink-1"
      >
        <Video size={12} strokeWidth={1.5} />
      </button>
    </span>
  )
}

// ─── The floating dock ───────────────────────────────────────────────────────

function VideoTile({
  stream,
  label,
  muted
}: {
  stream: MediaStream
  label: string
  muted?: boolean
}) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream
  }, [stream])
  return (
    <div className="relative h-24 w-32 overflow-hidden rounded-md bg-black">
      <video ref={ref} autoPlay playsInline muted={muted} className="h-full w-full object-cover" />
      <span className="absolute bottom-0.5 left-1 max-w-[90%] truncate text-[10px] text-white/80">
        {label}
      </span>
    </div>
  )
}

function DockButton({
  title,
  active,
  onClick,
  children
}: {
  title: string
  active?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-hairline ${
        active ? 'bg-surface-2 text-ink-1' : 'bg-surface-0 text-ink-2'
      } hover:text-ink-1`}
    >
      {children}
    </button>
  )
}

export function CommsDock() {
  const { call, leaveCall, toggleMute, toggleCamera, toggleScreenShare, error } = useCall()
  const profiles = useProfiles()
  const [, bump] = useReducer((x: number) => x + 1, 0)
  useEffect(() => call?.manager.onChange(bump), [call])
  const peers = call ? call.manager.getPeers() : []

  if (error) {
    return (
      <div className="fixed bottom-10 right-4 z-50 rounded-md border border-hairline bg-surface-0 px-3 py-2 text-xs text-red-500 shadow-lg">
        {error}
      </div>
    )
  }
  if (!call) return null

  return (
    <div className="fixed bottom-10 right-4 z-50 flex flex-col gap-2 rounded-lg border border-hairline bg-surface-1 p-2 shadow-lg">
      <div className="flex max-w-md flex-wrap gap-2">
        <VideoTile stream={call.localStream} label="you" muted />
        {peers
          .filter((peer) => peer.stream)
          .map((peer) => (
            <VideoTile
              key={peer.sessionId}
              stream={peer.stream as MediaStream}
              label={displayName(peer.did, profiles)}
            />
          ))}
      </div>
      <div className="flex items-center gap-1.5">
        <DockButton title={call.media.audio ? 'Mute' : 'Unmute'} onClick={toggleMute}>
          {call.media.audio ? <Mic size={13} /> : <MicOff size={13} className="text-red-500" />}
        </DockButton>
        <DockButton title={call.media.video ? 'Camera off' : 'Camera on'} onClick={toggleCamera}>
          {call.media.video ? <Video size={13} /> : <VideoOff size={13} />}
        </DockButton>
        <DockButton
          title={call.media.screen ? 'Stop sharing' : 'Share screen'}
          active={call.media.screen}
          onClick={() => void toggleScreenShare()}
        >
          <Monitor size={13} />
        </DockButton>
        <span className="min-w-0 flex-1 truncate px-1 font-mono text-[10px] text-ink-3">
          {peers.length + 1} in call
        </span>
        <DockButton title="Leave call" onClick={leaveCall}>
          <PhoneOff size={13} className="text-red-500" />
        </DockButton>
      </div>
    </div>
  )
}
