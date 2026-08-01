/**
 * RecordingRecorderView — the shared screen recorder (exploration 0414,
 * following the 0277 shared-view-core pattern: this core owns the surface and
 * the host app supplies chrome).
 *
 * The pre-flight is not a formality. It states what will be captured and which
 * prompts are about to fire *before* the red button, because a recorder that
 * silently records less than the user expected is the same class of bug as one
 * that records more.
 *
 * Two rungs, one artifact shape: the native helper when the bridge offers it,
 * `getDisplayMedia` + `MediaRecorder` otherwise. Downstream code never branches
 * on which produced the file — only `capturePath` on the node remembers.
 */

import type { CapturePathId } from '@xnetjs/data'
import { AlertTriangle, Camera, CircleDot, Info, Square } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { getRecordingsBridge, type RecordingsBridge } from './capture/bridge.js'
import { startBrowserCapture, type BrowserCaptureHandle } from './capture/browser-capture.js'
import { evaluatePreflight, scopeSentence, type Preflight } from './capture/preflight.js'
import {
  buildRecordingDraft,
  type CaptureOutcome,
  type RecordingDraft
} from './create-recording.js'

export interface RecordingRecorderViewProps {
  /**
   * Persist the finished recording. Receives the node draft plus the track
   * sources — a file path per track on the native rung, a Blob on the browser
   * rung. The host owns blob storage.
   */
  onComplete: (
    draft: RecordingDraft,
    tracks: { screen: string | Blob; camera: string | Blob | null }
  ) => Promise<void> | void
  className?: string
}

type Phase = 'idle' | 'starting' | 'recording' | 'finishing'

const formatElapsed = (ms: number): string => {
  const total = Math.floor(ms / 1_000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export function RecordingRecorderView({
  onComplete,
  className
}: RecordingRecorderViewProps): JSX.Element {
  const bridgeRef = useRef<RecordingsBridge | null>(null)
  const browserRef = useRef<BrowserCaptureHandle | null>(null)
  const startedAtRef = useRef(0)
  const fatalRef = useRef<string | null>(null)

  const [phase, setPhase] = useState<Phase>('idle')
  const [wantsCamera, setWantsCamera] = useState(true)
  const [preflight, setPreflight] = useState<Preflight | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [droppedFrames, setDroppedFrames] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // Re-run the pre-flight whenever the camera choice changes: the answer to
  // "which prompts will fire" depends on it.
  useEffect(() => {
    let cancelled = false
    const bridge = getRecordingsBridge()
    bridgeRef.current = bridge

    void (async () => {
      const status = bridge ? await bridge.captureStatus().catch(() => null) : null
      const permissions = bridge ? await bridge.permissions().catch(() => null) : null
      if (cancelled) return
      setPreflight(
        evaluatePreflight({
          status,
          permissions,
          displayMedia:
            typeof navigator !== 'undefined' &&
            typeof navigator.mediaDevices?.getDisplayMedia === 'function',
          wantsCamera
        })
      )
    })()

    return () => {
      cancelled = true
    }
  }, [wantsCamera, phase])

  useEffect(() => {
    const bridge = bridgeRef.current
    if (!bridge || phase !== 'recording') return
    const offProgress = bridge.onProgress((progress) => {
      setElapsedMs(progress.durationMs)
      setDroppedFrames(progress.droppedFrames)
    })
    const offError = bridge.onError(({ message, fatal }) => {
      setError(message)
      if (fatal) fatalRef.current = message
    })
    return () => {
      offProgress()
      offError()
    }
  }, [phase])

  // The browser rung has no progress channel — tick locally instead.
  useEffect(() => {
    if (phase !== 'recording' || bridgeRef.current) return
    const timer = setInterval(() => {
      setElapsedMs(browserRef.current?.elapsedMs() ?? 0)
    }, 500)
    return () => clearInterval(timer)
  }, [phase])

  const start = useCallback(async (): Promise<void> => {
    setError(null)
    fatalRef.current = null
    setDroppedFrames(0)
    setPhase('starting')

    try {
      const bridge = bridgeRef.current
      const useCamera = preflight?.cameraAvailable ?? false

      if (bridge && preflight?.path === 'screencapturekit-helper') {
        const result = await bridge.start({ camera: useCamera })
        startedAtRef.current = result.startedAt
      } else {
        browserRef.current = await startBrowserCapture({ camera: useCamera })
        startedAtRef.current = Date.now()
      }
      setElapsedMs(0)
      setPhase('recording')
    } catch (cause) {
      // Never leave the UI in a state that implies recording is happening.
      setError(cause instanceof Error ? cause.message : String(cause))
      setPhase('idle')
    }
  }, [preflight])

  const stop = useCallback(async (): Promise<void> => {
    setPhase('finishing')
    const startedAt = startedAtRef.current
    const path: CapturePathId = preflight?.path ?? 'unknown'

    try {
      const bridge = bridgeRef.current
      let outcome: CaptureOutcome
      let tracks: { screen: string | Blob; camera: string | Blob | null }

      if (bridge && path === 'screencapturekit-helper') {
        const result = await bridge.stop()
        outcome = {
          durationMs: result.durationMs,
          width: 0,
          height: 0,
          capturePath: path,
          truncated: result.truncated,
          truncationReason: result.truncationReason,
          droppedFrames: result.droppedFrames
        }
        tracks = { screen: result.screenPath, camera: result.cameraPath }
      } else {
        const handle = browserRef.current
        if (!handle) throw new Error('no capture in progress')
        const result = await handle.stop()
        browserRef.current = null
        outcome = {
          durationMs: result.durationMs,
          width: result.width,
          height: result.height,
          capturePath: path,
          truncated: result.truncated,
          truncationReason: result.truncationReason
        }
        tracks = { screen: result.screen, camera: result.camera }
      }

      // A fatal helper error during the session outranks a clean stop report.
      if (fatalRef.current) {
        outcome = { ...outcome, truncated: true, truncationReason: fatalRef.current }
      }

      await onComplete(buildRecordingDraft(outcome, startedAt), tracks)
      setPhase('idle')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setPhase('idle')
    }
  }, [onComplete, preflight])

  const scope = useMemo(
    () => (preflight ? scopeSentence(preflight) : 'Checking this device…'),
    [preflight]
  )
  const recording = phase === 'recording'
  const busy = phase === 'starting' || phase === 'finishing'

  return (
    <div className={className}>
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{scope}</p>

        {preflight?.notices.map((notice) => (
          <div
            key={notice.message}
            className={[
              'flex items-start gap-2 rounded border px-3 py-2 text-sm',
              notice.severity === 'blocker'
                ? 'border-destructive/40 bg-destructive/10'
                : notice.severity === 'warning'
                  ? 'border-yellow-500/40 bg-yellow-500/10'
                  : 'bg-muted/40'
            ].join(' ')}
          >
            {notice.severity === 'info' ? (
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span>
              {notice.message}
              {notice.remedy ? (
                <span className="block text-xs text-muted-foreground">{notice.remedy}</span>
              ) : null}
            </span>
          </div>
        ))}

        {error ? (
          <div className="flex items-start gap-2 rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={wantsCamera}
            disabled={recording || busy}
            onChange={(event) => setWantsCamera(event.target.checked)}
          />
          <Camera className="h-4 w-4" />
          Include my camera
        </label>

        <div className="flex items-center gap-3">
          {recording ? (
            <button
              type="button"
              onClick={() => void stop()}
              disabled={busy}
              className="flex items-center gap-2 rounded bg-destructive px-3 py-1.5 text-sm text-destructive-foreground disabled:opacity-50"
            >
              <Square className="h-4 w-4" />
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void start()}
              disabled={busy || !(preflight?.canRecord ?? false)}
              className="flex items-center gap-2 rounded bg-foreground px-3 py-1.5 text-sm text-background disabled:opacity-50"
            >
              <CircleDot className="h-4 w-4" />
              {phase === 'starting' ? 'Starting…' : 'Record'}
            </button>
          )}

          {recording ? (
            <span className="tabular-nums text-sm text-muted-foreground">
              {formatElapsed(elapsedMs)}
              {droppedFrames > 0 ? ` · ${droppedFrames} frames dropped` : ''}
            </span>
          ) : null}
          {phase === 'finishing' ? (
            <span className="text-sm text-muted-foreground">Finishing…</span>
          ) : null}
        </div>
      </div>
    </div>
  )
}
