/**
 * Small presentational pieces of the meeting recorder (exploration 0279):
 * the always-visible recording indicator, the capture-scope / degraded-mode /
 * engine-fallback / echo-bleed notices, the Me/Them live transcript pane,
 * and the template picker. All pure render — state lives in
 * `MeetingRecorderView`.
 */

import type { CapturePreflight } from './capture/preflight.js'
import type { MeetingSegment } from '@xnetjs/data'
import type { MeetingTemplate } from '@xnetjs/meetings'
import { AlertTriangle, Check, Copy, Headphones, Info, Megaphone, MicOff } from 'lucide-react'
import { useEffect, useRef, useState, type JSX } from 'react'

// ─── Recording indicator ─────────────────────────────────────────────────────

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`
}

export interface RecordingIndicatorProps {
  /** Elapsed capture time, ms. */
  elapsedMs: number
  /** Recording is live (paused shows a steady, not pulsing, dot). */
  live: boolean
}

/** The visible recording indicator: pulsing red dot + elapsed time (0279). */
export function RecordingIndicator({ elapsedMs, live }: RecordingIndicatorProps): JSX.Element {
  return (
    <div
      className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background px-3 py-1.5"
      data-meeting-recording-indicator="true"
      role="status"
      aria-live="polite"
    >
      <span
        className={`h-2.5 w-2.5 rounded-full ${live ? 'animate-pulse bg-red-500' : 'bg-muted-foreground'}`}
        aria-hidden="true"
      />
      <span className="font-mono text-sm tabular-nums text-foreground">
        {formatElapsed(elapsedMs)}
      </span>
      <span className="text-xs text-muted-foreground">{live ? 'Recording' : 'Paused'}</span>
    </div>
  )
}

// ─── Notices ─────────────────────────────────────────────────────────────────

/** The capture-tier scope message — always stated up front (0279 consent norm). */
export function CaptureScopeNotice({ message }: { message: string }): JSX.Element {
  return (
    <div
      className="flex items-start gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground"
      data-meeting-scope-notice="true"
    >
      <Info size={14} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  )
}

/** Mic-only degraded mode — a state banner, never styled as an error (0279). */
export function MicOnlyBanner({ reason }: { reason: 'denied' | 'unavailable' }): JSX.Element {
  return (
    <div
      className="flex items-start gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground"
      data-meeting-mic-only-banner="true"
    >
      <MicOff size={14} className="mt-0.5 shrink-0" />
      <span>
        {reason === 'denied'
          ? 'System audio was declined — recording your microphone only. The other side of the call is not being captured.'
          : 'System audio is unavailable — recording your microphone only. The other side of the call is not being captured.'}
      </span>
    </div>
  )
}

/** Preferred engine can't handle the session language (0279: visible fallback). */
export function EngineFallbackNotice({
  fallbackFromName,
  engineName
}: {
  fallbackFromName: string
  engineName: string
}): JSX.Element {
  return (
    <div
      className="flex items-start gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground"
      data-meeting-engine-fallback-notice="true"
    >
      <Info size={14} className="mt-0.5 shrink-0" />
      <span>
        {fallbackFromName} doesn&rsquo;t support this language — transcribing with {engineName}{' '}
        instead.
      </span>
    </div>
  )
}

/** Far-end audio is leaking into the mic (`detectChannelBleed`). */
export function EchoBleedWarning(): JSX.Element {
  return (
    <div
      className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400"
      data-meeting-echo-warning="true"
    >
      <Headphones size={14} className="mt-0.5 shrink-0" />
      <span>Echo detected — far-end audio is leaking into your mic. Wear headphones.</span>
    </div>
  )
}

/**
 * Permissions pre-flight (0279 permissions UX): the TCC prompt(s) the user is
 * about to see when they hit Start, and the restart-after-grant explanation
 * when a permission was previously denied.
 */
export function PreflightNotices({ preflight }: { preflight: CapturePreflight }): JSX.Element {
  return (
    <div className="flex flex-col gap-2" data-meeting-preflight="true">
      {preflight.prompts.map((prompt) => (
        <div
          key={prompt}
          className="flex items-start gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground"
          data-meeting-preflight-prompt="true"
        >
          <Info size={14} className="mt-0.5 shrink-0" />
          <span>{prompt}</span>
        </div>
      ))}
      {preflight.blocker ? (
        <div
          className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400"
          data-meeting-preflight-blocker="true"
        >
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{preflight.blocker}</span>
        </div>
      ) : null}
    </div>
  )
}

/**
 * The consent announcement (0279 phase 3): botless capture means no platform
 * plays a "recording started" chime, so the user announces it themselves —
 * shown prominently at capture start with one-click copy for pasting into the
 * meeting chat (posting for them would need per-platform integrations).
 */
export function ConsentAnnouncementBanner({ message }: { message: string }): JSX.Element {
  const [copied, setCopied] = useState(false)

  return (
    <div
      className="flex items-start gap-2 rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs text-sky-700 dark:text-sky-300"
      data-meeting-consent-banner="true"
    >
      <Megaphone size={14} className="mt-0.5 shrink-0" />
      <span className="min-w-0 flex-1">
        Announce the recording — paste this into the meeting chat: &ldquo;{message}&rdquo;
      </span>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard
            ?.writeText(message)
            .then(() => {
              setCopied(true)
              window.setTimeout(() => setCopied(false), 2000)
            })
            .catch(() => undefined)
        }}
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-sky-500/40 bg-background px-2 py-1 font-medium text-foreground transition-colors hover:bg-secondary"
        data-meeting-consent-copy="true"
      >
        {copied ? <Check size={11} /> : <Copy size={11} />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

/** A capture error surfaced without killing the session (`onError`). */
export function CaptureErrorNotice({ message }: { message: string }): JSX.Element {
  return (
    <div
      className="flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400"
      data-meeting-capture-error="true"
    >
      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  )
}

// ─── Live transcript ─────────────────────────────────────────────────────────

export interface LiveTranscriptPaneProps {
  segments: MeetingSegment[]
  /** Placeholder while nothing has been said yet. */
  emptyMessage?: string
}

/** Me/Them-labelled segments, visually distinct per channel, autoscrolled. */
export function LiveTranscriptPane({
  segments,
  emptyMessage = 'Transcript will appear here as people speak.'
}: LiveTranscriptPaneProps): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Follow the tail as segments arrive.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [segments.length])

  return (
    <div
      ref={scrollRef}
      className="flex-1 space-y-2 overflow-y-auto rounded-md border border-border bg-background p-3"
      data-meeting-live-transcript="true"
    >
      {segments.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        segments.map((segment, index) => (
          <TranscriptSegmentRow key={`${segment.startMs}-${index}`} segment={segment} />
        ))
      )}
    </div>
  )
}

function formatOffset(ms: number): string {
  return formatElapsed(ms)
}

/** One transcript line. Exported for the detail view's transcript timeline. */
export function TranscriptSegmentRow({ segment }: { segment: MeetingSegment }): JSX.Element {
  const me = segment.channel === 'me'
  return (
    <div className="flex items-start gap-2 text-sm" data-meeting-segment-channel={segment.channel}>
      <span className="w-12 shrink-0 pt-0.5 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
        {formatOffset(segment.startMs)}
      </span>
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
          me ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400' : 'bg-secondary text-muted-foreground'
        }`}
      >
        {segment.speaker ?? (me ? 'Me' : 'Them')}
      </span>
      <span className="min-w-0 text-foreground">{segment.text}</span>
    </div>
  )
}

// ─── Template picker ─────────────────────────────────────────────────────────

export interface TemplatePickerProps {
  templates: MeetingTemplate[]
  value: string
  onChange: (templateId: string) => void
  disabled?: boolean
}

/** Enhancement-template select, shown before/while recording (phase 2). */
export function TemplatePicker({
  templates,
  value,
  onChange,
  disabled
}: TemplatePickerProps): JSX.Element {
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      Template
      <select
        className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        data-meeting-template-picker="true"
      >
        {templates.map((template) => (
          <option key={template.id} value={template.id}>
            {template.name}
          </option>
        ))}
      </select>
    </label>
  )
}
