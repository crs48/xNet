/**
 * RecordingPlayer — playback over the edit decision list (exploration 0414).
 *
 * The player is where "auto-edit is instant" becomes true. Nothing is
 * re-rendered: the screen track plays, and on every `timeupdate` the playhead
 * is checked against the cut list and seeked past any span it entered. The
 * camera track is a second `<video>` composited by CSS, positioned from
 * `cameraLayout` — which is why moving the bubble costs a field write.
 *
 * The scrubber speaks the EDITED timeline (that is the duration the viewer
 * experiences), and every seek converts back to source before touching the
 * media element. `@xnetjs/recordings` owns that arithmetic.
 */

import type { CameraLayout, Chapter, Cut } from '@xnetjs/data'
import { DEFAULT_CAMERA_LAYOUT } from '@xnetjs/data'
import {
  bubbleStyle,
  editedDurationMs,
  editedToSource,
  isCameraHidden,
  nextPlayheadMs,
  sourceToEdited
} from '@xnetjs/recordings'
import { Pause, Play } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'

export interface RecordingPlayerProps {
  screenSrc: string
  cameraSrc?: string | null
  /** Source duration in ms — from the node, not the media element. */
  durationMs: number
  cuts?: Cut[]
  chapters?: Chapter[]
  cameraLayout?: CameraLayout
  captionsSrc?: string | null
  /** Notified as the playhead moves, in SOURCE ms — for transcript sync. */
  onSourceTimeChange?: (sourceMs: number) => void
  className?: string
}

const formatClock = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1_000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function RecordingPlayer({
  screenSrc,
  cameraSrc,
  durationMs,
  cuts = [],
  chapters = [],
  cameraLayout = DEFAULT_CAMERA_LAYOUT,
  captionsSrc,
  onSourceTimeChange,
  className
}: RecordingPlayerProps): JSX.Element {
  const screenRef = useRef<HTMLVideoElement>(null)
  const cameraRef = useRef<HTMLVideoElement>(null)
  const [sourceMs, setSourceMs] = useState(0)
  const [playing, setPlaying] = useState(false)

  const editedMs = useMemo(() => editedDurationMs(durationMs, cuts), [durationMs, cuts])
  const position = useMemo(() => sourceToEdited(sourceMs, cuts), [sourceMs, cuts])
  const cameraHidden = isCameraHidden(sourceMs, cameraLayout)

  // The camera track is a passenger: it never drives time, it only follows the
  // screen track. Two independently-seeking elements would drift.
  const syncCamera = useCallback((targetSeconds: number) => {
    const camera = cameraRef.current
    if (!camera) return
    if (Math.abs(camera.currentTime - targetSeconds) > 0.25) {
      camera.currentTime = targetSeconds
    }
  }, [])

  const handleTimeUpdate = useCallback((): void => {
    const screen = screenRef.current
    if (!screen) return

    const nowMs = screen.currentTime * 1_000
    const jump = nextPlayheadMs(nowMs, cuts)
    if (jump !== null) {
      // Seeking is cheaper than decoding frames nobody will see.
      screen.currentTime = jump / 1_000
      syncCamera(jump / 1_000)
      return
    }

    setSourceMs(nowMs)
    syncCamera(screen.currentTime)
    onSourceTimeChange?.(nowMs)
  }, [cuts, onSourceTimeChange, syncCamera])

  const seekEdited = useCallback(
    (targetEditedMs: number): void => {
      const screen = screenRef.current
      if (!screen) return
      const target = editedToSource(targetEditedMs, cuts) / 1_000
      screen.currentTime = target
      syncCamera(target)
      setSourceMs(target * 1_000)
    },
    [cuts, syncCamera]
  )

  const seekSource = useCallback(
    (targetSourceMs: number): void => {
      const screen = screenRef.current
      if (!screen) return
      screen.currentTime = targetSourceMs / 1_000
      syncCamera(targetSourceMs / 1_000)
      setSourceMs(targetSourceMs)
    },
    [syncCamera]
  )

  const toggle = useCallback((): void => {
    const screen = screenRef.current
    if (!screen) return
    if (screen.paused) void screen.play()
    else screen.pause()
  }, [])

  // Play/pause the camera alongside the screen without letting it lead.
  useEffect(() => {
    const camera = cameraRef.current
    if (!camera) return
    if (playing) void camera.play().catch(() => undefined)
    else camera.pause()
  }, [playing])

  return (
    <div className={className}>
      <div className="relative overflow-hidden rounded-lg bg-black">
        <video
          ref={screenRef}
          src={screenSrc}
          className="w-full"
          onTimeUpdate={handleTimeUpdate}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          controls={false}
        >
          {captionsSrc ? (
            <track kind="captions" src={captionsSrc} srcLang="en" label="Captions" default />
          ) : null}
        </video>

        {cameraSrc && !cameraHidden ? (
          <video
            ref={cameraRef}
            src={cameraSrc}
            muted
            className="pointer-events-none border-2 border-white/20 shadow-lg"
            style={bubbleStyle({ width: 100, height: 100 }, cameraLayout) as React.CSSProperties}
          />
        ) : null}
      </div>

      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? 'Pause' : 'Play'}
          className="rounded p-1 hover:bg-muted"
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>

        <div className="relative flex-1">
          <input
            type="range"
            min={0}
            max={Math.max(1, editedMs)}
            value={Math.min(position.editedMs, editedMs)}
            onChange={(event) => seekEdited(Number(event.target.value))}
            aria-label="Seek"
            className="w-full"
          />
          {/* Chapter ticks sit on the edited timeline, like the scrubber. */}
          {chapters.map((chapter) => {
            const at = sourceToEdited(chapter.startMs, cuts)
            if (at.isCut || editedMs === 0) return null
            return (
              <button
                key={`${chapter.startMs}-${chapter.title}`}
                type="button"
                title={chapter.title}
                onClick={() => seekSource(chapter.startMs)}
                style={{ left: `${(at.editedMs / editedMs) * 100}%` }}
                className="absolute top-0 h-2 w-0.5 -translate-x-1/2 bg-primary"
              />
            )
          })}
        </div>

        <span className="tabular-nums text-xs text-muted-foreground">
          {formatClock(position.editedMs)} / {formatClock(editedMs)}
        </span>
      </div>
    </div>
  )
}
