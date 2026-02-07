/**
 * Presence Overlay Component
 *
 * Renders all remote cursors and presence indicators on the canvas.
 */

import type { CanvasPresenceManager, CanvasPresence } from '../presence/canvas-presence'
import { useEffect, useState, useMemo, useCallback } from 'react'
import { Viewport } from '../spatial/index'
import { RemoteCursor } from './RemoteCursor'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PresenceOverlayProps {
  /** Presence manager instance */
  presenceManager: CanvasPresenceManager
  /** Current viewport for coordinate conversion */
  viewport: Viewport
  /** How long before a cursor is considered stale (ms) */
  staleThreshold?: number
  /** Whether to show cursor names */
  showNames?: boolean
}

interface RemoteCursorState {
  clientId: number
  position: { x: number; y: number }
  user: { name: string; color: string; avatar?: string }
  activity?: CanvasPresence['activity']
  lastSeen: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_STALE_THRESHOLD = 5000 // 5 seconds

// ─── Component ────────────────────────────────────────────────────────────────

export function PresenceOverlay({
  presenceManager,
  viewport,
  staleThreshold = DEFAULT_STALE_THRESHOLD,
  showNames = true
}: PresenceOverlayProps) {
  const [remoteCursors, setRemoteCursors] = useState<RemoteCursorState[]>([])
  const [now, setNow] = useState(Date.now())

  // Update cursors from presence
  const updateCursors = useCallback(() => {
    const presence = presenceManager.getRemotePresence()
    const cursors: RemoteCursorState[] = []

    presence.forEach((state, clientId) => {
      if (state.cursor && state.user) {
        cursors.push({
          clientId,
          position: state.cursor,
          user: state.user,
          activity: state.activity,
          lastSeen: state.lastUpdated ?? Date.now()
        })
      }
    })

    setRemoteCursors(cursors)
  }, [presenceManager])

  // Subscribe to presence changes
  useEffect(() => {
    const unsubscribe = presenceManager.onPresenceChange(updateCursors)
    updateCursors() // Initial load
    return unsubscribe
  }, [presenceManager, updateCursors])

  // Periodically update "now" to detect stale cursors
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now())
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Convert canvas coordinates to screen coordinates
  const screenCursors = useMemo(() => {
    return remoteCursors.map((cursor) => ({
      ...cursor,
      screenPosition: viewport.canvasToScreen(cursor.position.x, cursor.position.y),
      isStale: now - cursor.lastSeen > staleThreshold
    }))
  }, [remoteCursors, viewport, now, staleThreshold])

  // Filter out cursors that are off-screen (with some buffer)
  const visibleCursors = useMemo(() => {
    const buffer = 50
    return screenCursors.filter((cursor) => {
      const { x, y } = cursor.screenPosition
      return (
        x >= -buffer &&
        x <= viewport.width + buffer &&
        y >= -buffer &&
        y <= viewport.height + buffer
      )
    })
  }, [screenCursors, viewport.width, viewport.height])

  return (
    <div
      className="presence-overlay"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: 999
      }}
    >
      {visibleCursors.map((cursor) => (
        <RemoteCursor
          key={cursor.clientId}
          position={cursor.screenPosition}
          user={cursor.user}
          activity={cursor.activity}
          isStale={cursor.isStale}
          showName={showNames}
        />
      ))}
    </div>
  )
}
