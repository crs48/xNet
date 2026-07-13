/**
 * Cursor party — the pure-Awareness demo (exploration 0314, Tier 1).
 * Cursors and emoji bursts ride `usePresence` at ~30fps; a ten-minute
 * session writes exactly zero rows to the persisted change log.
 */
import { useNode, usePresence } from '@xnetjs/react'
import { useCallback, useRef } from 'react'
import { peerColor, peerName } from '../lib/peer-style'
import { roomNodeId } from '../lib/room'
import { DemoRoom } from '../lib/schemas'

interface CursorState extends Record<string, unknown> {
  /** Normalized 0..1 arena coordinates (device-size independent). */
  cx: number
  cy: number
  name: string
  color: string
  burst?: { emoji: string; at: number }
}

const EMOJI = ['🎉', '👋', '🔥', '💫', '🐙']

export function CursorParty({ room, did }: { room: string; did: string }) {
  const { awareness, syncStatus, peerCount } = useNode(DemoRoom, roomNodeId('cursors', room), {
    createIfMissing: { title: `cursor party — ${room}` },
    did
  })
  const { peers, setState } = usePresence<CursorState>(awareness, {
    cx: -1,
    cy: -1,
    name: peerName(did),
    color: peerColor(did)
  })
  const arenaRef = useRef<HTMLDivElement>(null)
  const selfRef = useRef<{ cx: number; cy: number }>({ cx: -1, cy: -1 })

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const rect = arenaRef.current?.getBoundingClientRect()
      if (!rect) return
      const cx = (e.clientX - rect.left) / rect.width
      const cy = (e.clientY - rect.top) / rect.height
      selfRef.current = { cx, cy }
      setState({ cx, cy })
    },
    [setState]
  )

  const throwBurst = (emoji: string) => {
    setState({ burst: { emoji, at: Date.now() } })
  }

  return (
    <>
      <div className="shell-header">
        <span className="chip">
          <span className={`dot ${syncStatus === 'connected' ? 'on' : ''}`} />
          {syncStatus}
        </span>
        <span className="chip">{peerCount + 1} here</span>
        <span className="spacer" />
        <div className="emoji-tray">
          {EMOJI.map((emoji) => (
            <button key={emoji} onClick={() => throwBurst(emoji)} aria-label={`send ${emoji}`}>
              {emoji}
            </button>
          ))}
        </div>
      </div>
      <div
        ref={arenaRef}
        className="arena"
        onPointerMove={onPointerMove}
        onPointerLeave={() => setState({ cx: -1, cy: -1 })}
      >
        {peers.map(({ clientId, state }) => (
          <Cursor key={clientId} state={state} />
        ))}
      </div>
      <p className="footer-note">
        Cursors are Yjs Awareness state relayed through the hub — throttled to ~30fps, evicted on
        disconnect, and never written to the change log. Open this URL in a second window to see
        yourself arrive.
      </p>
    </>
  )
}

function Cursor({ state }: { state: CursorState }) {
  const { cx, cy, name, color, burst } = state
  const visible = cx >= 0 && cy >= 0
  return (
    <>
      {visible && (
        <div className="cursor" style={{ left: `${cx * 100}%`, top: `${cy * 100}%` }}>
          <svg width="16" height="16" viewBox="0 0 16 16">
            <path d="M0 0 L16 6 L9 9 L6 16 Z" fill={color} />
          </svg>
          <span className="label" style={{ background: color }}>
            {name}
          </span>
        </div>
      )}
      {burst && Date.now() - burst.at < 1500 && (
        <span
          key={burst.at}
          className="burst"
          style={{ left: `${(visible ? cx : 0.5) * 100}%`, top: `${(visible ? cy : 0.5) * 100}%` }}
        >
          {burst.emoji}
        </span>
      )}
    </>
  )
}
