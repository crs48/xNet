/**
 * Dictation-engine settings panel (exploration 0279). Lists every engine the
 * platform registry offers (native IPC engines on desktop, the BYO endpoint
 * anywhere), lets the user pick the preferred one (persisted; `selectEngine`
 * still language-checks it per session), download models with progress, and
 * configure a BYO OpenAI-compatible endpoint.
 *
 * Attribution is a hard requirement, not a nicety: NVIDIA Parakeet is
 * CC-BY-4.0, so the descriptor's attribution line MUST render whenever that
 * engine is the active preference (the descriptor carries the line; we show
 * it for the selected engine and in each engine row).
 */

import type { EngineDescriptor } from '@xnetjs/dictation'
import type { MeetingConsentSettings } from '@xnetjs/meetings'
import { SettingRow, SettingsGroup, SettingsPanel, SettingToggle } from '@xnetjs/ui'
import { Check, Cpu, Download, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useState, type JSX } from 'react'
import {
  buildMeetingEngineRegistry,
  readMeetingEnginePrefs,
  writeMeetingEnginePref
} from './capture/registry.js'
import { readMeetingConsentSettings, writeMeetingConsentSettings } from './consent.js'

interface EngineRowState {
  descriptor: EngineDescriptor
  ready: boolean
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return 'no download'
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function formatLanguages(languages: string[]): string {
  if (languages.includes('*')) return 'Any language'
  return languages.map((l) => l.toUpperCase()).join(', ')
}

export function MeetingEngineSettings(): JSX.Element {
  const [engines, setEngines] = useState<EngineRowState[]>([])
  const [loading, setLoading] = useState(true)
  const [preferred, setPreferred] = useState<string>(
    () => readMeetingEnginePrefs().preferredEngineId ?? ''
  )
  const [byoEndpoint, setByoEndpoint] = useState<string>(
    () => readMeetingEnginePrefs().byoEndpoint ?? ''
  )
  const [downloading, setDownloading] = useState<string | null>(null)
  const [progress, setProgress] = useState<number>(0)
  const [reloadNonce, setReloadNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void (async () => {
      const registry = await buildMeetingEngineRegistry()
      const rows = await Promise.all(
        registry.list().map(async (descriptor) => ({
          descriptor,
          ready: (await registry.get(descriptor.id)?.isReady()) ?? false
        }))
      )
      if (!cancelled) {
        setEngines(rows)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [reloadNonce])

  const handlePick = useCallback((engineId: string) => {
    setPreferred(engineId)
    writeMeetingEnginePref('engine', engineId)
  }, [])

  const handleByoEndpoint = useCallback((value: string) => {
    setByoEndpoint(value)
    writeMeetingEnginePref('byoEndpoint', value.trim())
  }, [])

  const handleDownload = useCallback(async (engineId: string) => {
    setDownloading(engineId)
    setProgress(0)
    try {
      const registry = await buildMeetingEngineRegistry()
      const engine = registry.get(engineId)
      if (engine) {
        await engine.ensureModel((p) => setProgress(p.fraction))
      }
    } finally {
      setDownloading(null)
      setReloadNonce((nonce) => nonce + 1)
    }
  }, [])

  const active = engines.find((row) => row.descriptor.id === preferred) ?? engines[0]

  return (
    <SettingsPanel
      title="Dictation & Meetings"
      description="Which speech-to-text engine transcribes your meetings — on-device by default"
    >
      <SettingsGroup
        label="Transcription engine"
        description="Sessions in a language the preferred engine can't handle fall back automatically, with a visible notice."
      >
        {loading ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 size={12} className="animate-spin" /> Detecting engines…
          </p>
        ) : engines.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No engines available on this platform. Use the desktop app for on-device engines, or
            configure a custom endpoint below.
          </p>
        ) : (
          engines.map(({ descriptor, ready }) => {
            const isPreferred = descriptor.id === (preferred || active?.descriptor.id)
            const isDownloading = downloading === descriptor.id
            return (
              <SettingRow
                key={descriptor.id}
                label={
                  <span className="inline-flex items-center gap-2">
                    {descriptor.name}
                    {descriptor.onDevice ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        <Cpu size={10} /> On-device
                      </span>
                    ) : null}
                    {ready ? (
                      <span className="inline-flex items-center gap-1 text-[10px] text-green-600 dark:text-green-400">
                        <Check size={10} /> Ready
                      </span>
                    ) : null}
                  </span>
                }
                description={
                  <>
                    {formatLanguages(descriptor.languages)} ·{' '}
                    {formatBytes(descriptor.approxDownloadBytes)}
                    {descriptor.attribution ? (
                      <>
                        <br />
                        <span data-meeting-engine-attribution={descriptor.id}>
                          {descriptor.attribution}
                        </span>
                      </>
                    ) : null}
                  </>
                }
              >
                <div className="flex items-center gap-2">
                  {!ready && descriptor.approxDownloadBytes > 0 ? (
                    <button
                      type="button"
                      onClick={() => void handleDownload(descriptor.id)}
                      disabled={isDownloading}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-secondary disabled:opacity-60"
                      data-meeting-engine-download={descriptor.id}
                    >
                      {isDownloading ? (
                        <>
                          <Loader2 size={12} className="animate-spin" />
                          {Math.round(progress * 100)}%
                        </>
                      ) : (
                        <>
                          <Download size={12} /> Download model
                        </>
                      )}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => handlePick(descriptor.id)}
                    className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                      isPreferred
                        ? 'border-foreground/40 bg-secondary font-medium text-foreground'
                        : 'border-border bg-background text-muted-foreground hover:bg-secondary'
                    }`}
                    data-meeting-engine-pick={descriptor.id}
                    aria-pressed={isPreferred}
                  >
                    {isPreferred ? 'Preferred' : 'Use'}
                  </button>
                </div>
              </SettingRow>
            )
          })
        )}
        {active?.descriptor.attribution ? (
          <p className="text-[11px] text-muted-foreground" data-meeting-active-attribution="true">
            Active engine: {active.descriptor.name} — {active.descriptor.attribution}
          </p>
        ) : null}
      </SettingsGroup>

      <SettingsGroup
        label="Custom endpoint"
        description="Point at any OpenAI-compatible /v1/audio/transcriptions server you already run (e.g. a local Whisper sidecar)."
      >
        <SettingRow label="Endpoint URL" description="Leave empty to disable">
          <input
            type="url"
            className="w-64 rounded-md border border-border bg-background px-2.5 py-1 font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground"
            placeholder="http://127.0.0.1:5092"
            value={byoEndpoint}
            onChange={(event) => handleByoEndpoint(event.target.value)}
            onBlur={() => setReloadNonce((nonce) => nonce + 1)}
            data-meeting-byo-endpoint="true"
          />
        </SettingRow>
      </SettingsGroup>

      <ConsentRetentionSettings />
    </SettingsPanel>
  )
}

/**
 * Recording consent + retention (0279 phase 3). Semantics live in
 * @xnetjs/meetings (`consentAnnouncement`, `isTranscriptExpired`); this block
 * only edits the persisted `MeetingConsentSettings`. Audio retention is
 * opt-in and labelled as such — audio is NEVER kept unless this is on.
 */
function ConsentRetentionSettings(): JSX.Element {
  const [settings, setSettings] = useState<MeetingConsentSettings>(() =>
    readMeetingConsentSettings()
  )

  const apply = useCallback((changes: Partial<MeetingConsentSettings>) => {
    setSettings((previous) => {
      const next = { ...previous, ...changes }
      writeMeetingConsentSettings(next)
      return next
    })
  }, [])

  return (
    <SettingsGroup
      label="Recording consent & retention"
      description="Botless capture plays no recording chime — announcing it is on you. Retention limits how long transcripts stay."
    >
      <SettingToggle
        label="Consent announcement"
        description="Show the announcement at capture start, ready to copy into the meeting chat"
        checked={settings.autoConsentMessage}
        onChange={(checked) => apply({ autoConsentMessage: checked })}
      />
      {settings.autoConsentMessage ? (
        <SettingRow label="Announcement text">
          <textarea
            className="h-16 w-72 resize-none rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground outline-none placeholder:text-muted-foreground"
            value={settings.consentMessageText}
            onChange={(event) => apply({ consentMessageText: event.target.value })}
            data-meeting-consent-text="true"
          />
        </SettingRow>
      ) : null}
      <SettingRow
        label="Transcript retention"
        description="Days to keep transcripts; 0 keeps them until you delete them"
      >
        <input
          type="number"
          min={0}
          step={1}
          className="w-24 rounded-md border border-border bg-background px-2.5 py-1 text-right font-mono text-xs text-foreground outline-none"
          value={settings.transcriptRetentionDays}
          onChange={(event) => {
            const parsed = Number.parseInt(event.target.value, 10)
            apply({
              transcriptRetentionDays: Number.isFinite(parsed) ? Math.max(0, parsed) : 0
            })
          }}
          data-meeting-retention-days="true"
        />
      </SettingRow>
      <SettingToggle
        label="Keep source audio (opt-in)"
        description="Off by default: audio is never stored. Turning this on keeps recordings as local blobs alongside the transcript."
        checked={settings.retainAudio}
        onChange={(checked) => apply({ retainAudio: checked })}
      />
    </SettingsGroup>
  )
}
