import type { CommunityData, Conversation } from './use-community-data'
import { createCallManager, type CallPeerSnapshot, type PeerConnectionLike } from '@xnetjs/comms'
import { useXNet } from '@xnetjs/react'
import { Mic, MicOff, PhoneOff, Video, VideoOff, Phone, ChevronDown, ChevronUp } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createAwarenessCallTransport } from './call-transport'
import { Avatar, IconButton, Modal, primaryButton, secondaryButton } from './primitives'

function Stream({
  stream,
  muted,
  label,
  video
}: {
  stream: MediaStream
  muted?: boolean
  label: string
  video: boolean
}) {
  const ref = useRef<HTMLVideoElement>(null)
  const [blocked, setBlocked] = useState(false)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    element.srcObject = stream
    void element.play().catch(() => setBlocked(true))
    return () => {
      element.srcObject = null
    }
  }, [stream])
  return (
    <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-xl bg-muted">
      {!video && <Avatar name={label} large />}
      <video
        ref={ref}
        autoPlay
        onPlaying={() => setBlocked(false)}
        playsInline
        muted={muted}
        className={video ? 'h-full w-full object-cover' : 'absolute h-px w-px opacity-0'}
      />
      {blocked && (
        <button
          className={secondaryButton}
          onClick={() => {
            void ref.current
              ?.play()
              .then(() => setBlocked(false))
              .catch(() => setBlocked(true))
          }}
        >
          Play audio
        </button>
      )}
      <span className="absolute bottom-2 left-2 rounded bg-background/90 px-2 py-1 text-xs">
        {label}
      </span>
    </div>
  )
}
export function CallPanel({
  channel,
  data,
  video,
  onClose
}: {
  channel: Conversation
  data: CommunityData
  video: boolean
  onClose: () => void
}) {
  const { syncManager } = useXNet()
  const [started, setStarted] = useState(false)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState('')
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [peers, setPeers] = useState<CallPeerSnapshot[]>([])
  const [muted, setMuted] = useState(false)
  const [camera, setCamera] = useState(video)
  const [collapsed, setCollapsed] = useState(false)
  const cleanup = useRef<() => void>(() => {})
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      cleanup.current()
    }
  }, [])
  const start = async () => {
    if (!syncManager || syncManager.status !== 'connected' || !data.did) {
      setError('Connect to a community host before joining a call.')
      return
    }
    setJoining(true)
    setError('')
    let local: MediaStream | null = null
    let acquired = false
    try {
      local = await navigator.mediaDevices.getUserMedia({ audio: true, video })
      if (!alive.current) {
        local.getTracks().forEach((track) => track.stop())
        return
      }
      await syncManager.acquire(channel.id)
      acquired = true
      if (!alive.current) {
        local.getTracks().forEach((track) => track.stop())
        syncManager.release(channel.id)
        return
      }
      const awareness = syncManager.getAwareness(channel.id)
      if (!awareness)
        throw new Error('The call room could not be opened. Try reconnecting to your host.')
      const members = new Set<string>([
        data.did,
        ...(channel.members ?? []),
        ...data.members
          .filter((member) => member.space === channel.space)
          .flatMap((member) => (member.member ? [member.member] : []))
      ])
      // A session is per device, so two devices owned by the same person can join.
      const sessionId = crypto.randomUUID()
      const active = createCallManager({
        self: { did: data.did, sessionId },
        onError: (cause) => {
          if (alive.current) setError(`Call connection failed: ${cause.message}`)
        },
        transport: createAwarenessCallTransport(awareness, sessionId, data.did, members),
        createPeerConnection: () =>
          new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
          }) as unknown as PeerConnectionLike,
        getLocalTracks: () =>
          local!.getTracks().map((track) => [track, local!] as [unknown, unknown])
      })
      const unsubscribe = active.onChange(() => {
        setPeers(active.getPeers())
        if (active.getStatus() === 'full') setError('This call has reached its small-group limit.')
      })
      cleanup.current = () => {
        unsubscribe()
        active.leave()
        local?.getTracks().forEach((track) => track.stop())
        syncManager.release(channel.id)
      }
      active.join({ audio: true, video, screen: false })
      setStream(local)
      setStarted(true)
    } catch (cause) {
      local?.getTracks().forEach((track) => track.stop())
      if (acquired) syncManager.release(channel.id)
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (alive.current) setJoining(false)
    }
  }
  const toggle = (kind: 'audio' | 'video') => {
    const tracks = kind === 'audio' ? stream?.getAudioTracks() : stream?.getVideoTracks()
    tracks?.forEach((track) => {
      track.enabled = !track.enabled
    })
    if (kind === 'audio') setMuted(!muted)
    else setCamera(!camera)
  }
  if (!started)
    return (
      <Modal
        title={`${video ? 'Video' : 'Voice'} call · ${channel.name || 'Conversation'}`}
        onClose={onClose}
      >
        <div className="space-y-5">
          <p className="text-sm leading-6 text-muted-foreground">
            Join a live room with the people in this conversation. Your microphone{' '}
            {video && 'and camera '}will turn on after you join.
          </p>
          <div className="rounded-lg bg-muted p-3 text-xs leading-5 text-muted-foreground">
            Calls connect directly between members and may reveal your network address. This preview
            supports up to {video ? '4 video' : '8 audio'} participants. Some networks need a relay
            that is not yet available here.
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <button
            disabled={joining}
            onClick={() => void start()}
            className={`${primaryButton} w-full`}
          >
            {video ? <Video size={17} /> : <Phone size={17} />}
            {joining ? 'Connecting…' : 'Join call'}
          </button>
        </div>
      </Modal>
    )
  return (
    <aside
      aria-label="Active call"
      className="fixed right-5 top-40 z-40 max-h-[calc(100dvh-320px)] w-[340px] overflow-y-auto max-w-[calc(100vw-40px)] rounded-2xl border border-border bg-background p-4 shadow-xl"
    >
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">{channel.name}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {peers.some((peer) => peer.connectionState === 'connected')
              ? `${peers.length + 1} participants`
              : 'Waiting for others to join'}
          </p>
        </div>
        <IconButton
          label={collapsed ? 'Expand call' : 'Minimize call'}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
        </IconButton>
      </div>
      <div className={collapsed ? 'hidden' : 'grid gap-2'}>
        {stream && <Stream stream={stream} muted label="You" video={camera} />}{' '}
        {peers.map((peer) =>
          peer.stream instanceof MediaStream ? (
            <Stream
              key={peer.sessionId}
              stream={peer.stream}
              label={data.nameFor(peer.did)}
              video={peer.media.video}
            />
          ) : (
            <p key={peer.sessionId} className="text-xs text-muted-foreground">
              {data.nameFor(peer.did)} · {peer.connectionState}
            </p>
          )
        )}
      </div>
      {error && (
        <p role="alert" className="my-2 text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="mt-3 flex justify-center gap-3">
        <IconButton
          label={muted ? 'Unmute microphone' : 'Mute microphone'}
          onClick={() => toggle('audio')}
        >
          {muted ? <MicOff size={19} /> : <Mic size={19} />}
        </IconButton>
        {video && (
          <IconButton
            label={camera ? 'Turn camera off' : 'Turn camera on'}
            onClick={() => toggle('video')}
          >
            {camera ? <Video size={19} /> : <VideoOff size={19} />}
          </IconButton>
        )}
        <button onClick={onClose} className={`${primaryButton} !py-2`}>
          <PhoneOff size={17} />
          Leave
        </button>
      </div>
    </aside>
  )
}
