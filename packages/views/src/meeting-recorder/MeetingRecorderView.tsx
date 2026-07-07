/**
 * MeetingRecorderView — the shared botless meeting recorder (exploration
 * 0279, following the 0277 shared-view-core pattern: this core owns the whole
 * surface; the web and desktop apps wrap it with their own chrome and pass
 * platform deltas as props).
 *
 * UI state is `meetingSessionReducer` (pure, from @xnetjs/meetings); this
 * component owns the impure glue: getUserMedia/getDisplayMedia capture,
 * engine selection over the platform registry, node writes (one Meeting +
 * one MeetingTranscript, updated once per batched flush — never per
 * segment), periodic echo-bleed checks, and the phase-2 post-meeting AI
 * enhancement streamed into the notes Y.Doc as `aiGenerated`-marked blocks.
 *
 * Audio never persists: PCM flows VAD → engine → text and is dropped.
 */

import type { MeetingSegment } from '@xnetjs/data'
import type { AIProvider } from '@xnetjs/plugins'
import { MeetingSchema, MeetingTranscriptSchema } from '@xnetjs/data'
import {
  detectCaptureCapability,
  detectChannelBleed,
  initialMeetingSessionState,
  listTemplates,
  meetingSessionReducer,
  MeetingCaptureSession,
  selectEngine,
  streamEnhancedNotes,
  type CaptureCapability,
  type EngineSelection,
  type TranscriptSnapshot
} from '@xnetjs/meetings'
import { useMutate, useNode } from '@xnetjs/react'
import { Loader2, Pause, Play, Square } from 'lucide-react'
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type JSX } from 'react'
import { startMicCapture, startSystemCapture, type CaptureHandle } from './capture/audio.js'
import { getMeetingsBridge } from './capture/bridge.js'
import { MEETING_SAMPLE_RATE, PcmRing } from './capture/pcm.js'
import { buildMeetingEngineRegistry, readMeetingEnginePrefs } from './capture/registry.js'
import {
  CaptureErrorNotice,
  CaptureScopeNotice,
  EchoBleedWarning,
  EngineFallbackNotice,
  LiveTranscriptPane,
  MicOnlyBanner,
  RecordingIndicator,
  TemplatePicker
} from './components.js'
import { appendAiNotesToDoc, appendMarkdownToDoc } from './enhance-append.js'

// Bleed check cadence: a ~1s window every ~30s while both channels are live.
const BLEED_WINDOW_SAMPLES = MEETING_SAMPLE_RATE
const BLEED_CHECK_INTERVAL_MS = 30_000

const LANGUAGE_OPTIONS = [
  { id: 'en', label: 'English' },
  { id: 'es', label: 'Español' },
  { id: 'fr', label: 'Français' },
  { id: 'de', label: 'Deutsch' },
  { id: 'pt', label: 'Português' },
  { id: 'ja', label: '日本語' },
  { id: 'zh', label: '中文' },
  { id: '', label: 'Auto-detect' }
] as const

export interface MeetingRecorderViewProps {
  /** Recording finished (or enhancement was skipped) — open the meeting. */
  onDone?: (meetingId: string) => void
  /** The user backed out before starting a capture. */
  onCancel?: () => void
  /**
   * Platform slot (phase 2): resolve the app's AI provider for post-meeting
   * enhancement. Absent / resolves null → enhancement is skipped, silently.
   */
  resolveAiProvider?: () => Promise<AIProvider | null>
  className?: string
}

/** Everything one live capture holds; torn down as a unit. */
interface ActiveCapture {
  session: MeetingCaptureSession
  mic: CaptureHandle
  system: CaptureHandle | null
  micRing: PcmRing
  systemRing: PcmRing
}

export function MeetingRecorderView({
  onDone,
  onCancel,
  resolveAiProvider,
  className
}: MeetingRecorderViewProps): JSX.Element {
  const { create, update } = useMutate()
  const [state, dispatch] = useReducer(meetingSessionReducer, initialMeetingSessionState)

  const [meetingId, setMeetingId] = useState<string | null>(null)
  const [transcriptId, setTranscriptId] = useState<string | null>(null)
  const [segments, setSegments] = useState<MeetingSegment[]>([])
  const [roughNotes, setRoughNotes] = useState('')
  const [templateId, setTemplateId] = useState('generic')
  const [language, setLanguage] = useState<string>('en')
  const [capability, setCapability] = useState<CaptureCapability | null>(null)
  const [engineSelection, setEngineSelection] = useState<EngineSelection | null>(null)
  const [modelProgress, setModelProgress] = useState<number | null>(null)
  const [bleeding, setBleeding] = useState(false)
  const [captureError, setCaptureError] = useState<string | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [enhanceStatus, setEnhanceStatus] = useState<string | null>(null)

  const captureRef = useRef<ActiveCapture | null>(null)
  const pausedRef = useRef(false)
  const templates = useMemo(() => listTemplates(), [])

  // The meeting's notes Y.Doc — rough notes + AI enhancement land here at
  // stop. `useNode` re-runs once the meeting node exists.
  const { doc: notesDoc } = useNode(MeetingSchema, meetingId)
  const notesDocRef = useRef(notesDoc)
  notesDocRef.current = notesDoc

  // Capture-tier scope message, stated before recording (0279 consent norm).
  useEffect(() => {
    let cancelled = false
    const bridge = getMeetingsBridge()
    const displayMediaAudio =
      typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getDisplayMedia)
    if (!bridge) {
      setCapability(detectCaptureCapability({ displayMediaAudio }))
      return
    }
    void bridge
      .captureStatus()
      .then((status) => {
        if (cancelled) return
        setCapability(
          detectCaptureCapability({
            isElectron: true,
            electronSystemAudio: status.systemAudioAvailable,
            displayMediaAudio
          })
        )
      })
      .catch(() => {
        if (!cancelled) setCapability(detectCaptureCapability({ isElectron: true }))
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Elapsed ticker while capturing.
  const startedAt = 'startedAt' in state ? state.startedAt : null
  const recordingLive = state.status === 'recording' || state.status === 'recording-mic-only'
  useEffect(() => {
    if (!startedAt || (!recordingLive && state.status !== 'paused')) return
    const tick = () => setElapsedMs(Date.now() - startedAt)
    tick()
    const interval = window.setInterval(tick, 1000)
    return () => window.clearInterval(interval)
  }, [startedAt, recordingLive, state.status])

  // Periodic echo-bleed check while both channels are active.
  useEffect(() => {
    if (!recordingLive) return
    const interval = window.setInterval(() => {
      const capture = captureRef.current
      if (!capture?.system || !capture.micRing.filled || !capture.systemRing.filled) return
      const result = detectChannelBleed(capture.micRing.snapshot(), capture.systemRing.snapshot(), {
        sampleRate: MEETING_SAMPLE_RATE
      })
      setBleeding(result.bleeding)
    }, BLEED_CHECK_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [recordingLive])

  const teardownCapture = useCallback(async () => {
    const capture = captureRef.current
    captureRef.current = null
    if (!capture) return
    await Promise.all([
      capture.mic.stop().catch(() => undefined),
      capture.system?.stop().catch(() => undefined)
    ])
  }, [])

  // Never leave tracks live on unmount.
  useEffect(
    () => () => {
      void teardownCapture()
    },
    [teardownCapture]
  )

  const handleStart = useCallback(async () => {
    setCaptureError(null)
    dispatch({ type: 'start', at: Date.now() })

    try {
      // 1. Engine: platform registry + persisted preference + session language.
      const prefs = readMeetingEnginePrefs()
      const registry = await buildMeetingEngineRegistry()
      const selection = selectEngine(registry, {
        ...(language ? { language } : {}),
        ...(prefs.preferredEngineId ? { preferredEngineId: prefs.preferredEngineId } : {})
      })
      if (!selection) {
        dispatch({
          type: 'failure',
          message: 'No transcription engine is available. Configure one under Settings → Dictation.'
        })
        return
      }
      setEngineSelection(selection)
      if (!(await selection.engine.isReady())) {
        setModelProgress(0)
        await selection.engine.ensureModel((progress) => setModelProgress(progress.fraction))
        setModelProgress(null)
      }

      // 2. Nodes: one Meeting + its MeetingTranscript sibling, linked both ways.
      const now = Date.now()
      const title = `Meeting — ${new Date(now).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short'
      })}`
      const meeting = await create(MeetingSchema, { title, startedAt: now, templateId })
      if (!meeting) throw new Error('Could not create the meeting node')
      const transcript = await create(MeetingTranscriptSchema, {
        meeting: meeting.id,
        fullText: '',
        segments: [],
        ...(language ? { language } : {}),
        engineId: selection.engine.descriptor.id
      })
      if (!transcript) throw new Error('Could not create the transcript node')
      await update(MeetingSchema, meeting.id, { transcript: transcript.id })
      setMeetingId(meeting.id)
      setTranscriptId(transcript.id)

      // 3. Session: VAD → engine → batched upserts (ONE write per flush).
      const session = new MeetingCaptureSession({
        engine: selection.engine,
        ...(language ? { language } : {}),
        onTranscript: async (snapshot: TranscriptSnapshot) => {
          await update(MeetingTranscriptSchema, transcript.id, {
            fullText: snapshot.fullText,
            segments: snapshot.segments,
            durationMs: snapshot.durationMs
          })
        },
        onSegment: (segment) => {
          setSegments((previous) => [...previous, segment])
        },
        onError: (error, channel) => {
          setCaptureError(
            `Transcription hiccup on the ${channel === 'me' ? 'mic' : 'system-audio'} channel: ${
              error instanceof Error ? error.message : String(error)
            }`
          )
        }
      })

      // 4. Audio. Mic denial is fatal; system-audio denial degrades.
      const micRing = new PcmRing(BLEED_WINDOW_SAMPLES)
      const systemRing = new PcmRing(BLEED_WINDOW_SAMPLES)
      let mic: CaptureHandle
      try {
        mic = await startMicCapture((samples) => {
          if (pausedRef.current) return
          micRing.push(samples)
          session.pushAudio('me', samples, MEETING_SAMPLE_RATE)
        })
      } catch {
        dispatch({ type: 'permissionsDenied', at: Date.now() })
        return
      }

      const system = await startSystemCapture(
        (samples) => {
          if (pausedRef.current) return
          systemRing.push(samples)
          session.pushAudio('them', samples, MEETING_SAMPLE_RATE)
        },
        () => {
          // Mid-meeting loss (user stopped sharing, device vanished).
          dispatch({ type: 'systemAudioLost' })
          const capture = captureRef.current
          if (capture) capture.system = null
        }
      )

      captureRef.current = { session, mic, system, micRing, systemRing }
      pausedRef.current = false
      dispatch({ type: 'permissionsGranted', systemAudio: system !== null, at: Date.now() })
    } catch (error) {
      await teardownCapture()
      dispatch({
        type: 'failure',
        message: error instanceof Error ? error.message : String(error)
      })
    }
  }, [create, language, teardownCapture, templateId, update])

  const handlePause = useCallback(() => {
    pausedRef.current = true
    dispatch({ type: 'pause' })
  }, [])

  const handleResume = useCallback(() => {
    pausedRef.current = false
    dispatch({ type: 'resume' })
  }, [])

  /** Wait briefly for the notes Y.Doc to load (created moments ago). */
  const awaitNotesDoc = useCallback(async () => {
    for (let attempt = 0; attempt < 25; attempt++) {
      if (notesDocRef.current) return notesDocRef.current
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    return notesDocRef.current
  }, [])

  const handleStop = useCallback(async () => {
    const capture = captureRef.current
    if (!capture || !meetingId || !transcriptId) return
    dispatch({ type: 'stop', at: Date.now() })
    pausedRef.current = true

    try {
      // Final transcript flush + meeting metadata.
      const snapshot = await capture.session.stop()
      await teardownCapture()
      await update(MeetingTranscriptSchema, transcriptId, {
        fullText: snapshot.fullText,
        segments: snapshot.segments,
        durationMs: snapshot.durationMs
      })
      await update(MeetingSchema, meetingId, { durationMs: snapshot.durationMs, templateId })

      // Rough notes land in the notes body as the user's own (unmarked) text.
      const doc = await awaitNotesDoc()
      if (doc && roughNotes.trim()) {
        appendMarkdownToDoc(doc, roughNotes)
      }

      // Phase 2: stream AI enhancement into the notes, AI-marked. No provider
      // (or a failed one) skips quietly — the transcript already landed.
      let enhanced = false
      if (resolveAiProvider && snapshot.segments.length > 0) {
        try {
          setEnhanceStatus('Contacting your AI provider…')
          const provider = await resolveAiProvider()
          if (provider && doc) {
            setEnhanceStatus('Enhancing notes…')
            let markdown = ''
            for await (const delta of streamEnhancedNotes(provider, {
              roughNotes,
              segments: snapshot.segments,
              templateId
            })) {
              markdown += delta
            }
            appendAiNotesToDoc(doc, markdown)
            enhanced = true
          }
        } catch (error) {
          setCaptureError(
            `Note enhancement failed: ${error instanceof Error ? error.message : String(error)}`
          )
        } finally {
          setEnhanceStatus(null)
        }
      }

      dispatch({ type: enhanced ? 'enhanced' : 'skipEnhancement' })
      onDone?.(meetingId)
    } catch (error) {
      dispatch({
        type: 'failure',
        message: error instanceof Error ? error.message : String(error)
      })
    }
  }, [
    awaitNotesDoc,
    meetingId,
    onDone,
    resolveAiProvider,
    roughNotes,
    teardownCapture,
    templateId,
    transcriptId,
    update
  ])

  const idle = state.status === 'idle'
  const requesting = state.status === 'requesting-permissions'
  const paused = state.status === 'paused'
  const enhancing = state.status === 'enhancing'
  const capturing = recordingLive || paused

  return (
    <div
      className={`flex h-full min-h-0 flex-col gap-3 ${className ?? ''}`}
      data-meeting-recorder="true"
    >
      {/* Header: indicator + template/language + controls */}
      <div className="flex flex-wrap items-center gap-3">
        {capturing || enhancing ? (
          <RecordingIndicator elapsedMs={elapsedMs} live={recordingLive} />
        ) : (
          <h2 className="text-lg font-semibold text-foreground">New meeting</h2>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Language
            <select
              className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              disabled={!idle}
              data-meeting-language-picker="true"
            >
              {LANGUAGE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <TemplatePicker
            templates={templates}
            value={templateId}
            onChange={setTemplateId}
            disabled={enhancing}
          />

          {idle ? (
            <>
              {onCancel ? (
                <button
                  type="button"
                  onClick={onCancel}
                  className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                >
                  Cancel
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void handleStart()}
                className="rounded-full bg-red-500 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-600"
                data-meeting-start="true"
              >
                Start recording
              </button>
            </>
          ) : null}
          {recordingLive ? (
            <button
              type="button"
              onClick={handlePause}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
              data-meeting-pause="true"
            >
              <Pause size={12} /> Pause
            </button>
          ) : null}
          {paused ? (
            <button
              type="button"
              onClick={handleResume}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
              data-meeting-resume="true"
            >
              <Play size={12} /> Resume
            </button>
          ) : null}
          {capturing ? (
            <button
              type="button"
              onClick={() => void handleStop()}
              className="inline-flex items-center gap-1.5 rounded-full bg-red-500 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-600"
              data-meeting-stop="true"
            >
              <Square size={12} /> Stop
            </button>
          ) : null}
        </div>
      </div>

      {/* Notices */}
      {capability && (idle || requesting || capturing) ? (
        <CaptureScopeNotice message={capability.scopeMessage} />
      ) : null}
      {state.status === 'recording-mic-only' ? <MicOnlyBanner reason={state.reason} /> : null}
      {paused && state.micOnly ? <MicOnlyBanner reason="unavailable" /> : null}
      {engineSelection?.reason === 'language-fallback' && engineSelection.fallbackFrom ? (
        <EngineFallbackNotice
          fallbackFromName={engineSelection.fallbackFrom.name}
          engineName={engineSelection.engine.descriptor.name}
        />
      ) : null}
      {bleeding && recordingLive ? <EchoBleedWarning /> : null}
      {captureError ? <CaptureErrorNotice message={captureError} /> : null}

      {requesting ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 size={14} className="animate-spin" />
          {modelProgress !== null
            ? `Preparing the transcription model… ${Math.round(modelProgress * 100)}%`
            : 'Requesting microphone and system audio…'}
        </div>
      ) : null}
      {enhancing ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 size={14} className="animate-spin" />
          {enhanceStatus ?? 'Finishing the transcript…'}
        </div>
      ) : null}
      {state.status === 'error' ? (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {state.message}
        </div>
      ) : null}

      {/* Body: live transcript + rough notes, side by side when capturing */}
      {capturing || enhancing || state.status === 'done' ? (
        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-2">
          <div className="flex min-h-0 flex-col gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Live transcript
            </span>
            <LiveTranscriptPane segments={segments} />
          </div>
          <div className="flex min-h-0 flex-col gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              My notes
            </span>
            <textarea
              className="flex-1 resize-none rounded-md border border-border bg-background p-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
              placeholder="Rough bullets during the call — they steer the AI summary and land in the meeting notes."
              value={roughNotes}
              onChange={(event) => setRoughNotes(event.target.value)}
              disabled={enhancing || state.status === 'done'}
              data-meeting-rough-notes="true"
            />
          </div>
        </div>
      ) : null}

      {idle ? (
        <p className="text-sm text-muted-foreground">
          Recording captures audio for live transcription only — audio is never stored. Notes and
          the transcript are private to you by default.
        </p>
      ) : null}
    </div>
  )
}
