/**
 * Settings page — workbench-idiom shell (exploration 0179).
 *
 * Flat surfaces, hairline separators, a 13px type scale, and the Rail's
 * activity-bar active indicator (a 2px left bar, not a filled pill). Rows
 * and panels come from the shared settings kit in @xnetjs/ui; booleans use
 * the design-system <Switch>; data atoms (DID, version, hub URL) read mono.
 */
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  MIN_ESCROW_PIN_LENGTH,
  createUCAN,
  deriveKeysFromSeed,
  sealEscrow,
  serializeEscrow,
  serializeShare
} from '@xnetjs/identity'
import { DebugReportSchema, ProfileSchema, profileNodeId } from '@xnetjs/data'
import { deleteDay, getCommandRegistry, leaveWithEverything } from '@xnetjs/plugins'
import { useIdentity, useNodeStore, useQuery, useXNet } from '@xnetjs/react'
import { SettingRow, SettingsGroup, SettingsPanel, SettingToggle, useTheme } from '@xnetjs/ui'
import { MeetingEngineSettings } from '@xnetjs/views'
import {
  Layers,
  Sun,
  Moon,
  Monitor,
  Download,
  LogOut,
  Lightbulb,
  Cloud,
  Eye,
  EyeOff,
  Trash2
} from 'lucide-react'
import { useState, useCallback, useEffect } from 'react'
import { resetCoachSession } from '../coachmarks'
import { ProfileSettings } from '../comms/ProfileSettings'
import { ContentSafetySettings } from '../components/ContentSafetySettings'
import { PluginsPanel } from '../components/PluginsPanel'
import { ReportProblemDialog } from '../components/ReportProblemDialog'
import { SafetyCenterSettings } from '../components/SafetyCenterSettings'
import { isAnalyticsConfigured } from '../lib/analytics'
import { requestXNetBrowserStorageReset } from '../lib/browser-storage-reset'
import { useDerivedData } from '../lib/data-dignity'
import { EscalateReportDialog } from '../components/EscalateReportDialog'
import { useDiagnosticsInbox } from '../hooks/useDiagnosticsInbox'
import { DIAGNOSTICS_CONSOLE_VIEW_ID } from '../lib/diagnostics-console'
import { hubApiFetch, normalizeHubHttpUrl } from '../lib/share-links'
import {
  getSupportAccess,
  grantSupportAccess,
  revokeSupportAccess,
  supportIdentityDid,
  sweepExpiredSupportAccess,
  type SupportAccessState
} from '../lib/support-access'
import { getTelemetryCollector, isDiagnosticsConfigured } from '../lib/error-reporter'
import { configuredHubUrl, persistedHubUrl, setPersistedHubUrl } from '../lib/hub-url'
import { identityManager, logout } from '../lib/identity'
import { isLabEnabled, LABS_FLAGS, setLabEnabled } from '../lib/labs'
import { createLeavePorts, downloadLeaveBundle, type LeaveDeps } from '../lib/leave'
import {
  downloadBytes,
  exportXnetpack,
  importXnetpackFile,
  verifyXnetpackFile
} from '../lib/bundle-export'
import { sign } from '@xnetjs/crypto'
import { useXNetInternal } from '@xnetjs/react/internal'
import { useReportBreadcrumbs } from '../lib/use-report-breadcrumbs'
import {
  DEFAULT_SETTINGS_SECTION,
  asSettingsSection,
  type SettingsSection
} from '../lib/settings-sections'
import { useConsent } from '../lib/use-consent'
import { WINDDOWN_DURATION_CHOICES, useWinddownPreferences } from '../lib/winddown'
import { useWorkbench } from '../workbench/state'

/** Marketing + dashboard origins for xNet Cloud (managed hub hosting). */
const CLOUD_MARKETING_URL = 'https://xnet.fyi/cloud'
const CLOUD_DASHBOARD_URL = 'https://cloud.xnet.fyi/dashboard'
/** The dashboard surfaces plan, billing portal, and managed-AI usage (exploration 0200). */
const CLOUD_BILLING_URL = 'https://cloud.xnet.fyi/dashboard#billing'

export const Route = createFileRoute('/settings')({
  // The active section rides in the URL (`?section=…`) so the workbench's
  // contextual bottom island can drive it while the content renders here (0288).
  validateSearch: (search: Record<string, unknown>): { section?: SettingsSection } => ({
    section: asSettingsSection(search.section)
  }),
  component: SettingsPage
})

/** Quiet bordered button — the workbench's default action affordance. */
const QUIET_BUTTON =
  'flex items-center gap-2 rounded-md border border-hairline bg-surface-0 px-3 py-1.5 text-xs text-ink-1 transition-colors hover:bg-surface-2 disabled:cursor-default disabled:opacity-50'

/** Base64url-encode bytes (avoids a direct @xnetjs/crypto dep in the app). */
function bytesToBase64url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** The hub's HTTPS base (recovery-anchor endpoints), from the ws hub URL. */
function atprotoHubHttpUrl(): string | undefined {
  const ws = configuredHubUrl()
  if (!ws) return undefined
  return ws.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://')
}

/** Browser capabilities for the Right-to-Leave service (Charter §Exit, 0234). */
const LEAVE_DEPS: LeaveDeps = {
  destroyLocal: requestXNetBrowserStorageReset,
  recordLeft: () => {
    getTelemetryCollector().reportUsage('account.left', 1)
  }
}

function SettingsPage() {
  // Section nav lives in the workbench bottom island; content follows the URL.
  const { section } = Route.useSearch()
  const activeSection = section ?? DEFAULT_SETTINGS_SECTION

  return (
    <div className="-m-6 h-full overflow-auto p-6">
      {activeSection === 'profile' && <ProfileSettings />}
      {activeSection === 'appearance' && <AppearanceSettings />}
      {activeSection === 'labs' && <LabsSettings />}
      {activeSection === 'dictation' && <MeetingEngineSettings />}
      {activeSection === 'safety' && (
        <div className="space-y-10">
          <ContentSafetySettings />
          <SafetyCenterSettings />
        </div>
      )}
      {activeSection === 'data' && <DataSettings />}
      {activeSection === 'mirror' && <WhatWeKnowSettings />}
      {activeSection === 'privacy' && <PrivacySettings />}
      {activeSection === 'network' && <NetworkSettings />}
      {activeSection === 'plugins' && <PluginsPanel />}
      {activeSection === 'tips' && <TipsSettings />}
      {activeSection === 'account' && <AccountSettings />}
      {activeSection === 'about' && <AboutSettings />}
    </div>
  )
}

// ─── Labs Settings ────────────────────────────────────────────────────────────

/**
 * Labs (exploration 0282): the front door for `xnet:experiment:*` flags.
 * Rows render from the declarative registry in lib/labs.ts; reload-scoped
 * flags surface a "Reload to apply" chip after a change instead of
 * restarting the app out from under the user.
 */
function LabsSettings() {
  // localStorage isn't reactive; mirror it into state keyed by flag.
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(LABS_FLAGS.map((flag) => [flag.key, isLabEnabled(flag.key)]))
  )
  const [needsReload, setNeedsReload] = useState(false)

  const toggle = (key: string, appliesOn: 'reload' | 'immediate') => (checked: boolean) => {
    setLabEnabled(key, checked)
    setEnabled((prev) => ({ ...prev, [key]: checked }))
    if (appliesOn === 'reload') setNeedsReload(true)
  }

  return (
    <SettingsPanel
      title="Labs"
      description="Early features. They may change, move, or go away — nothing here touches your data."
    >
      <SettingsGroup>
        {LABS_FLAGS.map((flag) => (
          <div key={flag.key} className="relative">
            <SettingToggle
              label={flag.label}
              description={flag.description}
              checked={enabled[flag.key] ?? false}
              onChange={toggle(flag.key, flag.appliesOn)}
            />
            <span
              className={`absolute right-14 top-4 rounded-full border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider ${
                flag.stage === 'experimental'
                  ? 'border-hairline text-ink-3'
                  : 'border-hairline text-ink-2'
              }`}
            >
              {flag.stage}
            </span>
          </div>
        ))}
      </SettingsGroup>
      {needsReload && (
        <div className="mt-4 flex items-center gap-3 rounded-lg border border-hairline bg-surface-2 px-4 py-3 text-sm text-ink-2">
          Changes apply after a reload.
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="cursor-pointer rounded-md border border-hairline bg-surface-1 px-2.5 py-1 text-xs font-medium text-ink-1"
          >
            Reload now
          </button>
        </div>
      )}
    </SettingsPanel>
  )
}

// ─── Appearance Settings ──────────────────────────────────────────────────────

/**
 * Theme, colour style (variant), and density all flow through the shared
 * ThemeProvider (exploration 0232), so a choice here persists under the
 * provider's storage key and stays in sync with the status-bar toggle. The
 * style row exposes the opt-in variants (monochrome default, Linear's violet,
 * the warm Cozy room, OLED true-black); density is an orthogonal axis.
 */
function AppearanceSettings() {
  const { theme, setTheme, variant, setVariant, density, setDensity } = useTheme()
  const winddown = useWinddownPreferences()

  return (
    <SettingsPanel title="Appearance" description="Customize how xNet looks">
      <SettingsGroup>
        <SettingRow
          label="Workspaces"
          description="Rearrange panels, then save the layout as a named workspace — switch, share or reset from the switcher (⌘K). Press ⌘. for focus mode (hide the chrome)."
        >
          <div className="flex gap-1.5">
            <ThemeButton
              icon={<Layers size={14} strokeWidth={1.5} />}
              label="Switch workspace…"
              active={false}
              onClick={() => void getCommandRegistry().runCommand('workspace.switch')}
            />
          </div>
        </SettingRow>
        <SettingRow label="Theme" description="Choose your preferred color scheme">
          <div className="flex gap-1.5">
            <ThemeButton
              icon={<Sun size={14} strokeWidth={1.5} />}
              label="Light"
              active={theme === 'light'}
              onClick={() => setTheme('light')}
            />
            <ThemeButton
              icon={<Moon size={14} strokeWidth={1.5} />}
              label="Dark"
              active={theme === 'dark'}
              onClick={() => setTheme('dark')}
            />
            <ThemeButton
              icon={<Monitor size={14} strokeWidth={1.5} />}
              label="System"
              active={theme === 'system'}
              onClick={() => setTheme('system')}
            />
          </div>
        </SettingRow>
        <SettingRow
          label="Style"
          description="Monochrome chrome, Linear's violet accent, or a cozy paper-and-terracotta room"
        >
          <div className="flex flex-wrap gap-1.5">
            <ThemeButton
              icon={<span className="h-3.5 w-3.5 rounded-full bg-ink-1" />}
              label="Monochrome"
              active={variant === 'default'}
              onClick={() => setVariant('default')}
            />
            <ThemeButton
              icon={
                <span
                  className="h-3.5 w-3.5 rounded-full"
                  style={{ background: 'hsl(231 56% 60%)' }}
                />
              }
              label="Linear"
              active={variant === 'linear'}
              onClick={() => setVariant('linear')}
            />
            <ThemeButton
              icon={
                <span
                  className="h-3.5 w-3.5 rounded-full"
                  style={{ background: 'hsl(18 58% 52%)' }}
                />
              }
              label="Cozy"
              active={variant === 'cozy'}
              onClick={() => setVariant('cozy')}
            />
            <ThemeButton
              icon={<span className="h-3.5 w-3.5 rounded-full border border-hairline bg-black" />}
              label="True black"
              active={variant === 'true-black'}
              onClick={() => setVariant('true-black')}
            />
          </div>
        </SettingRow>
        <SettingRow
          label="Density"
          description="Compact keeps the tight IDE feel; comfortable opens up type and spacing"
        >
          <div className="flex gap-1.5">
            <ThemeButton
              icon={<span className="h-2.5 w-3.5 rounded-[3px] border border-current" />}
              label="Compact"
              active={density === 'compact'}
              onClick={() => setDensity('compact')}
            />
            <ThemeButton
              icon={<span className="h-3.5 w-3.5 rounded-[4px] border border-current" />}
              label="Comfortable"
              active={density === 'comfortable'}
              onClick={() => setDensity('comfortable')}
            />
          </div>
        </SettingRow>
      </SettingsGroup>
      <SettingsGroup
        label="Wellbeing"
        description="xNet competes for your wellbeing, not your time. Off by default."
      >
        <SettingToggle
          label="Time-well-spent reminder"
          description="After a long session, a calm nudge invites you to step away. Never a streak."
          checked={winddown.preferences.enabled}
          onChange={winddown.setEnabled}
        />
        <SettingRow
          label="Remind me after"
          description="How long a continuous session runs before the nudge appears"
        >
          <div className="flex flex-wrap gap-1.5">
            {WINDDOWN_DURATION_CHOICES.map((minutes) => (
              <ThemeButton
                key={minutes}
                icon={null}
                label={formatDurationLabel(minutes)}
                active={winddown.preferences.sessionMinutes === minutes}
                onClick={() => winddown.setSessionMinutes(minutes)}
              />
            ))}
          </div>
        </SettingRow>
      </SettingsGroup>
    </SettingsPanel>
  )
}

function formatDurationLabel(minutes: number): string {
  return minutes < 60 ? `${minutes}m` : `${minutes / 60}h`
}

function ThemeButton({
  icon,
  label,
  active,
  onClick
}: {
  icon: React.ReactNode
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
        active
          ? 'border-accent-ink bg-accent text-ink-1'
          : 'border-hairline bg-surface-0 text-ink-2 hover:bg-surface-2 hover:text-ink-1'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

// ─── Data Settings ────────────────────────────────────────────────────────────

function DataSettings() {
  const { identity } = useIdentity()
  const { store: nodeStore } = useNodeStore()
  const { getHubAuthToken, authorDID } = useXNet()
  const { signingKey } = useXNetInternal()
  const [clearing, setClearing] = useState(false)
  const [cleared, setCleared] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importReport, setImportReport] = useState<string | null>(null)

  /**
   * Manifest signer backed by the provider's in-memory signing key (0344) —
   * the same key the store signs changes with, no unlock ceremony needed.
   */
  const getSignBytes = useCallback(async () => {
    if (!signingKey) return undefined
    return (bytes: Uint8Array) => sign(bytes, signingKey)
  }, [signingKey])

  // Charter §Exit: take everything and go — the signed .xnetpack change log
  // (the OPFS SQLite master, not the IndexedDB sidecars), portable identity,
  // and a re-import README, bundled by the tested @xnetjs/plugins service.
  const handleLeaveWithEverything = useCallback(async () => {
    setLeaving(true)
    try {
      const now = new Date().toISOString()
      // authorDID (the provider's signing identity) — useIdentity() may not
      // be hydrated on this route, and the bundle owner must match the key
      // that signs it anyway.
      const did = authorDID ?? identity?.did ?? undefined
      const bundle = await leaveWithEverything(
        createLeavePorts({ did }, now, {
          ...LEAVE_DEPS,
          store: nodeStore,
          signBytes: did ? await getSignBytes() : undefined
        }),
        { now }
      )
      downloadLeaveBundle(bundle)
    } catch (err) {
      console.error('Failed to export everything:', err)
    } finally {
      setLeaving(false)
    }
  }, [authorDID, identity?.did, nodeStore, getSignBytes])

  // The real backup (0344): the signed change log + document states from the
  // OPFS SQLite master, zipped as one verifiable .xnetpack file.
  const [exportReport, setExportReport] = useState<string | null>(null)
  const handleExportData = useCallback(async () => {
    if (!nodeStore || !authorDID) return
    setExporting(true)
    setExportReport(null)
    try {
      const signBytes = await getSignBytes()
      const { bytes, filename, manifest } = await exportXnetpack(nodeStore, authorDID, signBytes)
      downloadBytes(filename, bytes)
      setExportReport(`Exported ${manifest.counts.changes} change(s) as ${filename}`)
    } catch (err) {
      console.error('Failed to export data:', err)
      setExportReport(err instanceof Error ? err.message : String(err))
    } finally {
      setExporting(false)
    }
  }, [nodeStore, identity?.did, getSignBytes])

  // Restore: verify first (signatures, hash chain, owner DID), then replay
  // through the same apply path a sync peer uses. Dry-run report on failure.
  const handleImportFile = useCallback(
    async (file: File) => {
      if (!nodeStore || !authorDID) return
      setImporting(true)
      setImportReport(null)
      try {
        const bytes = new Uint8Array(await file.arrayBuffer())
        const report = await verifyXnetpackFile(bytes)
        if (!report.ok) {
          const errors = report.issues
            .filter((i) => i.severity === 'error')
            .map((i) => i.detail)
            .join('; ')
          setImportReport(`Bundle failed verification — nothing imported. ${errors}`)
          return
        }
        const result = await importXnetpackFile(nodeStore, bytes, {
          importerDid: authorDID
        })
        const quarantineNote =
          result.quarantined.length > 0 ? `, ${result.quarantined.length} quarantined` : ''
        setImportReport(
          `Restored ${result.applied} change(s); ${result.duplicates} already present${quarantineNote}.`
        )
      } catch (err) {
        setImportReport(err instanceof Error ? err.message : String(err))
      } finally {
        setImporting(false)
      }
    },
    [nodeStore, identity?.did]
  )

  const handleClearData = useCallback(async () => {
    if (!confirmClear) {
      setConfirmClear(true)
      return
    }

    setClearing(true)
    try {
      // Honest Delete Day via the tested leave service: wipe the local master
      // and emit only an anonymous account.left signal — no guilt, no nagging.
      // When a hub is configured, also purge our authored changes from it
      // (the hub-purge port, exploration 0344).
      const now = new Date().toISOString()
      const httpHub = atprotoHubHttpUrl()
      const purgeRemote =
        httpHub && getHubAuthToken
          ? async () => {
              await hubApiFetch(httpHub, await getHubAuthToken(), '/export/changes', {
                method: 'DELETE'
              })
            }
          : undefined
      await deleteDay(
        createLeavePorts({ did: identity?.did }, now, { ...LEAVE_DEPS, purgeRemote }),
        { keepLocal: false, now }
      )
      setCleared(true)
      setConfirmClear(false)
    } catch (err) {
      console.error('Failed to clear data:', err)
      setClearing(false)
    }
  }, [confirmClear, identity?.did, getHubAuthToken])

  const handleCancelClear = useCallback(() => {
    setConfirmClear(false)
  }, [])

  return (
    <SettingsPanel title="Data" description="Manage your local data">
      <SettingsGroup>
        <SettingRow label="Storage" description="Data is stored locally in your browser">
          <span className="font-mono text-xs text-ink-3">SQLite OPFS</span>
        </SettingRow>

        <SettingRow
          label="Where your data lives"
          description="The local copy is the master; a hub is an optional convenience you control"
        >
          <span className="font-mono text-xs text-ink-3">
            {persistedHubUrl('') ? `This device + ${persistedHubUrl('')}` : 'This device only'}
          </span>
        </SettingRow>

        <SettingRow
          label="Export data"
          description="Download your workspace as a signed .xnetpack bundle — the full change log with history and document contents, re-importable here or on any xNet"
        >
          <div className="flex flex-col items-end gap-1">
            <button
              onClick={handleExportData}
              disabled={exporting || !nodeStore || !authorDID}
              className={QUIET_BUTTON}
            >
              <Download size={14} strokeWidth={1.5} />
              {exporting ? 'Exporting…' : 'Export'}
            </button>
            {exportReport ? <span className="text-xs text-ink-3">{exportReport}</span> : null}
          </div>
        </SettingRow>

        <SettingRow
          label="Restore from bundle"
          description="Verify and import an .xnetpack bundle. Records are checked (signatures, hash chain, owner) before anything is written"
        >
          <div className="flex flex-col items-end gap-1">
            <label className={QUIET_BUTTON} style={{ cursor: 'pointer' }}>
              <Download size={14} strokeWidth={1.5} className="rotate-180" />
              {importing ? 'Importing…' : 'Choose file'}
              <input
                type="file"
                accept=".xnetpack,.zip"
                className="hidden"
                disabled={importing || !nodeStore}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void handleImportFile(file)
                  e.target.value = ''
                }}
              />
            </label>
            {importReport ? <span className="text-xs text-ink-3">{importReport}</span> : null}
          </div>
        </SettingRow>

        <SettingRow
          label="Leave with everything"
          description="Your whole workspace, your portable identity, and how to re-import — nothing held back. You don't need our permission to leave."
        >
          <button onClick={handleLeaveWithEverything} disabled={leaving} className={QUIET_BUTTON}>
            <Download size={14} strokeWidth={1.5} />
            {leaving ? 'Preparing…' : 'Export all'}
          </button>
        </SettingRow>

        <SettingRow
          label="Clear all data"
          description="Remove all documents, settings, and identity (cannot be undone)"
        >
          {cleared ? (
            <span className="text-xs text-success">Data cleared! Reloading…</span>
          ) : confirmClear ? (
            <div className="flex gap-2">
              <button onClick={handleCancelClear} className={QUIET_BUTTON}>
                Cancel
              </button>
              <button
                onClick={handleClearData}
                disabled={clearing}
                className="rounded-md bg-destructive px-3 py-1.5 text-xs text-destructive-foreground transition-colors hover:bg-destructive-hover disabled:opacity-50"
              >
                {clearing ? 'Clearing…' : 'Confirm'}
              </button>
            </div>
          ) : (
            <button
              onClick={handleClearData}
              className="rounded-md bg-destructive px-3 py-1.5 text-xs text-destructive-foreground transition-colors hover:bg-destructive-hover"
            >
              Clear Data
            </button>
          )}
        </SettingRow>
      </SettingsGroup>
    </SettingsPanel>
  )
}

// ─── Tips & Tours ──────────────────────────────────────────────────────────────

/**
 * Replay the first-run coachmarks (exploration 0206). Clears the dismissed
 * set and the per-session cap so tips re-appear the next time each view opens.
 */
function TipsSettings() {
  const seenCount = useWorkbench((state) => state.seenTips.length)
  const resetTips = useWorkbench((state) => state.resetTips)
  const [done, setDone] = useState(false)

  const handleReplay = useCallback(() => {
    resetTips()
    resetCoachSession()
    setDone(true)
    setTimeout(() => setDone(false), 2500)
  }, [resetTips])

  return (
    <SettingsPanel
      title="Tips & tours"
      description="Gentle, one-at-a-time tips that appear the first time you open a view"
    >
      <SettingsGroup>
        <SettingRow
          label="Onboarding tips"
          description={
            seenCount === 0
              ? "You haven't dismissed any tips yet"
              : `${seenCount} tip${seenCount === 1 ? '' : 's'} dismissed`
          }
        >
          {done ? (
            <span className="text-xs text-success">Reset — tips will reappear</span>
          ) : (
            <button onClick={handleReplay} disabled={seenCount === 0} className={QUIET_BUTTON}>
              <Lightbulb size={14} strokeWidth={1.5} />
              Replay onboarding
            </button>
          )}
        </SettingRow>
      </SettingsGroup>
    </SettingsPanel>
  )
}

// ─── What We Know About You ─────────────────────────────────────────────────────

/**
 * The "what we know about you" mirror (Charter §Consent, exploration 0234).
 * Because xNet keeps no behavioral surplus, it can do the move no surveillance
 * company can: enumerate everything it has derived about you, from every
 * producer, and let you purge any of it. The common, honest answer is "nothing."
 */
function WhatWeKnowSettings() {
  const { items, loading, purge, purgeAll } = useDerivedData()

  return (
    <SettingsPanel
      title="What we know about you"
      description="Everything xNet has derived about you — and a button to erase any of it."
    >
      {loading ? (
        <p className="text-[13px] text-ink-3">Checking…</p>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-hairline bg-surface-1 p-4">
          <p className="text-[13px] font-medium text-ink-1">Nothing.</p>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-3">
            xNet keeps no behavioral surplus — there is no advertising profile, no engagement score,
            no hidden category. Your data lives on your device. Telemetry is off by default;
            anything you choose to enable is scrubbed, anonymized, and shown here so you can erase
            it. That absence is the point.
          </p>
        </div>
      ) : (
        <SettingsGroup
          label={`${items.length} item${items.length === 1 ? '' : 's'}`}
          description="Each item is local and purgeable. Nothing here is sold or shared."
        >
          {items.map((item) => (
            <SettingRow
              key={item.id}
              label={item.label}
              description={`${describeKind(item.kind)} · ${item.location}`}
            >
              <button
                type="button"
                onClick={() => void purge(item)}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-hairline bg-surface-0 px-2.5 text-[13px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink-1"
              >
                <Trash2 size={13} strokeWidth={1.5} />
                Forget
              </button>
            </SettingRow>
          ))}
          <SettingRow
            label="Forget everything"
            description="Erase every derived item above in one step"
          >
            <button
              type="button"
              onClick={() => void purgeAll()}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-hairline bg-surface-0 px-2.5 text-[13px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink-1"
            >
              <Trash2 size={13} strokeWidth={1.5} />
              Forget all
            </button>
          </SettingRow>
        </SettingsGroup>
      )}
    </SettingsPanel>
  )
}

function describeKind(kind: string): string {
  if (kind === 'telemetry') return 'Diagnostics buffered on this device'
  if (kind === 'embedding') return 'Search embedding'
  if (kind === 'ai-memory') return 'AI memory'
  return kind
}

// ─── Privacy & Diagnostics Settings ─────────────────────────────────────────────

/**
 * The single, durable control for the consent spine (exploration 0210). One
 * decision here gates every off-device sink: the first-party crash collector,
 * the optional Sentry reporter, and product analytics. Available on every build
 * (the first-party path works on self-host); the Sentry/analytics rows note
 * whether those SaaS sinks are wired for this build.
 */
function PrivacySettings() {
  const { allows, setTier } = useConsent()
  const crashes = allows('crashes')
  const anonymous = allows('anonymous')
  const breadcrumbs = useReportBreadcrumbs()
  const [reporting, setReporting] = useState(false)

  return (
    <SettingsPanel
      title="Privacy & Diagnostics"
      description="You decide what leaves your device. Everything here is off by default."
    >
      <SettingsGroup>
        <SettingToggle
          label="Help fix crashes"
          description="Send scrubbed crash reports (no documents, no personal data) so we can fix what breaks."
          checked={crashes}
          onChange={(on) => setTier(on ? 'crashes' : 'off')}
        />
        <SettingToggle
          label="Share anonymous usage"
          description="Bucketed, k-anonymous usage metrics that help prioritize what to build. Implies crash reports."
          checked={anonymous}
          onChange={(on) => setTier(on ? 'anonymous' : 'crashes')}
        />
      </SettingsGroup>
      <SettingsGroup>
        <SettingRow
          label="Crash reporting"
          description={
            isDiagnosticsConfigured()
              ? 'Scrubbed reports go to our own first-party endpoint (no third-party error service) when enabled above.'
              : 'Stored locally only on this build — no diagnostics endpoint is configured.'
          }
        >
          <span className="text-xs text-ink-2">
            {isDiagnosticsConfigured() ? 'First-party' : 'Local only'}
          </span>
        </SettingRow>
        <SettingRow
          label="Analytics"
          description="Cookieless, no personal data, no cross-site tracking — so no cookie banner is needed."
        >
          <span className="text-xs text-ink-2">
            {isAnalyticsConfigured() ? 'Cookieless' : 'Off'}
          </span>
        </SettingRow>
        <SettingRow
          label="Report a problem"
          description="Send us a one-off debug report. You'll see exactly what's included and can edit it before anything is sent."
        >
          <button type="button" onClick={() => setReporting(true)} className={QUIET_BUTTON}>
            Report a problem
          </button>
        </SettingRow>
        <SettingRow label="Privacy policy" description="How we handle data, in plain language.">
          <a
            href="https://xnet.fyi/privacy"
            target="_blank"
            rel="noreferrer"
            className={QUIET_BUTTON}
          >
            Read policy
          </a>
        </SettingRow>
      </SettingsGroup>
      {reporting && (
        <ReportProblemDialog breadcrumbs={breadcrumbs} onClose={() => setReporting(false)} />
      )}
      <DiagnosticsConsoleSettings />
    </SettingsPanel>
  )
}

/**
 * Operator console for the hub's diagnostics inbox (exploration 0341). Only
 * renders content when the connected hub answers the admin-gated summary —
 * non-operators and hubless builds see nothing. "Import reports" drains the
 * quarantine into the Diagnostics Space (bootstrapping it plus the Inbox /
 * By release / By fingerprint saved views on first run). Below it: the two
 * operator-facing escalation switches — per-report "Send to xNet" (preview →
 * hub forwarder, only when sharing is configured) and time-boxed support
 * access to the Diagnostics Space (red while active, one-click revoke).
 */
function DiagnosticsConsoleSettings() {
  const { ready, summary, imported, importing, error, importReports } = useDiagnosticsInbox()
  const navigate = useNavigate()

  if (!ready || !summary) return null

  const lastSeen = summary.lastSeenMs ? new Date(summary.lastSeenMs).toLocaleString() : null
  return (
    <SettingsGroup>
      <SettingRow
        label="Deployment diagnostics"
        description={
          summary.pending > 0
            ? `${summary.pending} report${summary.pending === 1 ? '' : 's'} waiting on your hub${lastSeen ? ` · last seen ${lastSeen}` : ''}. Importing writes them into your Diagnostics Space — nothing has left your deployment.`
            : 'No reports waiting on your hub. Crashes from this deployment land here, not on anyone else’s servers.'
        }
      >
        <button
          type="button"
          onClick={() => void importReports()}
          disabled={importing || summary.pending === 0}
          className={QUIET_BUTTON}
        >
          {importing ? 'Importing…' : 'Import reports'}
        </button>
      </SettingRow>
      {summary.topIssues.length > 0 && (
        <SettingRow
          label="Top issue"
          description={`${summary.topIssues[0].errorName} (${summary.topIssues[0].shortId}) — seen ${summary.topIssues[0].occurrences}×`}
        >
          <button
            type="button"
            onClick={() =>
              void navigate({
                to: '/view/$viewId',
                params: { viewId: DIAGNOSTICS_CONSOLE_VIEW_ID }
              })
            }
            className={QUIET_BUTTON}
          >
            Open console
          </button>
        </SettingRow>
      )}
      {imported !== null && !error && (
        <SettingRow
          label="Last import"
          description={`${imported} report${imported === 1 ? '' : 's'} imported into the Diagnostics Space.`}
        >
          <button
            type="button"
            onClick={() =>
              void navigate({
                to: '/view/$viewId',
                params: { viewId: DIAGNOSTICS_CONSOLE_VIEW_ID }
              })
            }
            className={QUIET_BUTTON}
          >
            Open console
          </button>
        </SettingRow>
      )}
      {error && <SettingRow label="Import failed" description={error} />}
      <EscalationSettings />
      <SupportAccessSettings />
    </SettingsGroup>
  )
}

/**
 * Per-report escalation (0341 P4, switch 1 of 3): recent unescalated reports
 * from the Diagnostics Space, each with a previewed "Send to xNet". Rendered
 * only when the hub's diagnostics-sharing forwarder is configured — with
 * sharing off, the forward route does not exist and neither does this UI.
 */
function EscalationSettings() {
  const { hubUrl, getHubAuthToken } = useXNet()
  const { store, isReady } = useNodeStore()
  const [sharing, setSharing] = useState(false)
  const [escalating, setEscalating] = useState<{
    id: string
    properties: Record<string, unknown>
  } | null>(null)
  const { data: reports } = useQuery(DebugReportSchema, {
    orderBy: { lastSeen: 'desc' },
    limit: 25
  })

  useEffect(() => {
    if (!hubUrl) return
    let cancelled = false
    void fetch(`${normalizeHubHttpUrl(hubUrl)}/diagnostics/health`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((body: { sharing?: boolean }) => {
        if (!cancelled) setSharing(Boolean(body.sharing))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [hubUrl])

  // useQuery returns flattened nodes (properties on the node itself); the
  // escalation payload composer allowlists, so passing the flat node is safe.
  const pendingEscalation = (reports ?? []).filter((node) => !node.escalatedId).slice(0, 5)

  if (!sharing || !store || !isReady || !hubUrl || !getHubAuthToken) return null
  if (pendingEscalation.length === 0) return null

  const request = async (path: string, init?: { method?: string; body?: unknown }) => {
    const token = await getHubAuthToken()
    if (!token) throw new Error('Not authenticated with the hub')
    return hubApiFetch(normalizeHubHttpUrl(hubUrl), token, path, init)
  }

  return (
    <>
      {pendingEscalation.map((node) => (
        <SettingRow
          key={node.id}
          label={String(node.errorName ?? 'Report')}
          description={`Seen ${node.occurrences ?? 1}× · not shared with xNet. You'll preview the exact payload first.`}
        >
          <button
            type="button"
            onClick={() =>
              setEscalating({ id: node.id, properties: node as unknown as Record<string, unknown> })
            }
            className={QUIET_BUTTON}
          >
            Send to xNet…
          </button>
        </SettingRow>
      ))}
      {escalating && (
        <EscalateReportDialog
          nodeId={escalating.id}
          properties={escalating.properties}
          store={store}
          request={request}
          onClose={() => setEscalating(null)}
        />
      )}
    </>
  )
}

const SUPPORT_DURATIONS = [
  { label: '24 hours', ms: 24 * 60 * 60 * 1000 },
  { label: '7 days', ms: 7 * 24 * 60 * 60 * 1000 }
] as const

/**
 * Time-boxed support access (0341 P4, switch 3 of 3). Red while a grant is
 * live; expiry is enforced by the sweep on every render of this section.
 */
function SupportAccessSettings() {
  const { store, isReady } = useNodeStore()
  const { did } = useIdentity()
  const supportDid = supportIdentityDid()
  const [state, setState] = useState<SupportAccessState | null>(null)

  const reload = useCallback(async () => {
    if (!store || !supportDid) return
    await sweepExpiredSupportAccess(store, supportDid)
    setState(await getSupportAccess(store, supportDid))
  }, [store, supportDid])

  useEffect(() => {
    if (isReady) void reload()
  }, [isReady, reload])

  if (!supportDid || !store || !isReady || !state) return null

  if (state.active) {
    return (
      <SettingRow
        label="xNet support access"
        description={`xNet can currently read your Diagnostics Space${state.expiresAt ? ` until ${new Date(state.expiresAt).toLocaleString()}` : ''}. Only that Space — nothing else.`}
      >
        <button
          type="button"
          onClick={() => void revokeSupportAccess(store, supportDid).then(reload)}
          className="rounded-md border border-red-500/50 px-3 py-1.5 text-xs text-red-500 hover:bg-red-500/10"
        >
          Revoke now
        </button>
      </SettingRow>
    )
  }

  return (
    <SettingRow
      label="Let xNet help debug"
      description="Grant xNet support read access to your Diagnostics Space only, for a fixed time. It expires by itself and you can revoke it any moment."
    >
      <div className="flex gap-2">
        {SUPPORT_DURATIONS.map((duration) => (
          <button
            key={duration.label}
            type="button"
            onClick={() =>
              void (did
                ? grantSupportAccess(store, did, supportDid, duration.ms).then(reload)
                : Promise.resolve())
            }
            className={QUIET_BUTTON}
          >
            {duration.label}
          </button>
        ))}
      </div>
    </SettingRow>
  )
}

// ─── Network Settings ──────────────────────────────────────────────────────────

const DEFAULT_HUB_URL = import.meta.env.VITE_HUB_URL || 'wss://hub.xnet.fyi'

function NetworkSettings() {
  const [hubUrl, setHubUrl] = useState(() =>
    typeof window === 'undefined' ? DEFAULT_HUB_URL : persistedHubUrl(DEFAULT_HUB_URL)
  )
  const [saved, setSaved] = useState(false)

  const handleSave = useCallback(() => {
    setPersistedHubUrl(hubUrl)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }, [hubUrl])

  const handleReset = useCallback(() => {
    setHubUrl(DEFAULT_HUB_URL)
    setPersistedHubUrl('')
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }, [])

  const isModified = hubUrl !== DEFAULT_HUB_URL

  return (
    <SettingsPanel title="Network" description="Configure sync and connectivity">
      <SettingsGroup>
        <div className="border-b border-hairline py-3">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <div className="text-sm text-ink-1">Hub URL</div>
              <div className="text-xs text-ink-3">WebSocket server for peer discovery and sync</div>
            </div>
            {saved && <span className="text-xs text-success">Saved! Reload to apply.</span>}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              value={hubUrl}
              onChange={(e) => setHubUrl(e.target.value)}
              placeholder="wss://hub.xnet.fyi"
              className="h-8 flex-1 rounded-md border border-hairline bg-surface-0 px-2 font-mono text-xs text-ink-1 outline-none placeholder:text-ink-3 focus:border-border-emphasis"
            />
            <button onClick={handleSave} className={QUIET_BUTTON}>
              Save
            </button>
            {isModified && (
              <button onClick={handleReset} className={QUIET_BUTTON}>
                Reset
              </button>
            )}
          </div>
        </div>

        <SettingRow label="Protocol" description="Connection type used for sync">
          <span className="text-xs text-ink-3">WebSocket + WebRTC</span>
        </SettingRow>

        <SettingRow label="Encryption" description="All sync traffic is encrypted">
          <span className="text-xs text-ink-3">XChaCha20-Poly1305</span>
        </SettingRow>
      </SettingsGroup>

      <p className="text-xs text-ink-3">
        Changes to the Hub URL require reloading the app to take effect. The default hub at{' '}
        <code className="font-mono">hub.xnet.fyi</code> is provided for convenience, but you can run
        your own signaling server.
      </p>

      <SettingsGroup label="xNet Cloud">
        <SettingRow
          label="Managed hub"
          description="Don't want to run a server? xNet Cloud hosts a dedicated hub for you — backed up, always reachable, and yours alone."
        >
          <a
            href={CLOUD_MARKETING_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={QUIET_BUTTON}
          >
            <Cloud size={14} strokeWidth={1.5} />
            See plans
          </a>
        </SettingRow>

        <SettingRow
          label="Connect a cloud hub"
          description="Already subscribed? Open your dashboard and choose “Approve a device”, then enter the code shown when you connect from this app."
        >
          <a
            href={CLOUD_DASHBOARD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={QUIET_BUTTON}
          >
            Open dashboard
          </a>
        </SettingRow>

        <SettingRow
          label="Billing & AI usage"
          description="Change your plan, manage your payment method, and see your managed-AI usage against the included budget — all on your cloud dashboard. Your billing identity stays separate from this device's data identity."
        >
          <a
            href={CLOUD_BILLING_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={QUIET_BUTTON}
          >
            Manage billing
          </a>
        </SettingRow>
      </SettingsGroup>
    </SettingsPanel>
  )
}

// ─── Account Settings ─────────────────────────────────────────────────────────

/**
 * Reveal-on-demand recovery phrase (exploration 0243). Only recoverable identities
 * have a phrase; for a plain passkey identity we say so plainly. Revealing prompts the
 * passkey (via `exportRecoveryPhrase` → unlock) and we never persist it in the clear.
 */
/** The Electron preload exposes a keychain-backed seed store (apps/electron secure-seed). */
type SeedKeychain = { setSeedPhrase(mnemonic: string): Promise<unknown> }
const seedKeychain = (globalThis as { xnet?: SeedKeychain }).xnet

function RecoveryPhraseRow() {
  const [recoverable, setRecoverable] = useState<boolean | null>(null)
  const [phrase, setPhrase] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [savedToKeychain, setSavedToKeychain] = useState(false)

  useEffect(() => {
    let active = true
    void identityManager.isRecoverable().then((r) => {
      if (active) setRecoverable(r)
    })
    return () => {
      active = false
    }
  }, [])

  const reveal = useCallback(async () => {
    setBusy(true)
    try {
      setPhrase(await identityManager.exportRecoveryPhrase())
    } catch (err) {
      console.error('Failed to reveal recovery phrase:', err)
    } finally {
      setBusy(false)
    }
  }, [])

  if (recoverable === false) {
    return (
      <SettingRow
        label="Recovery phrase"
        description="This identity has no recovery phrase, so losing your passkey means losing access. Set one up by creating a recoverable identity."
      >
        <span className="text-[11px] text-ink-3">Not enabled</span>
      </SettingRow>
    )
  }

  return (
    <SettingRow
      label="Recovery phrase"
      description="Restores your identity and encrypted data on a new device if you lose your passkey. We can't recover it for you — keep it somewhere safe."
    >
      {phrase ? (
        <div className="flex max-w-[280px] flex-col items-end gap-1">
          <span className="break-words text-right font-mono text-[10px] text-ink-2">{phrase}</span>
          <div className="flex gap-3">
            {seedKeychain && (
              <button
                onClick={() => {
                  void seedKeychain.setSeedPhrase(phrase).then(
                    () => setSavedToKeychain(true),
                    () => setSavedToKeychain(false)
                  )
                }}
                className={QUIET_BUTTON}
              >
                {savedToKeychain ? 'Saved to keychain ✓' : 'Back up to this device'}
              </button>
            )}
            <button onClick={() => setPhrase(null)} className={QUIET_BUTTON}>
              <EyeOff size={14} strokeWidth={1.5} />
              Hide
            </button>
          </div>
        </div>
      ) : (
        <button onClick={reveal} disabled={busy || recoverable === null} className={QUIET_BUTTON}>
          <Eye size={14} strokeWidth={1.5} />
          {busy ? 'Unlocking…' : 'View phrase'}
        </button>
      )}
    </SettingRow>
  )
}

/**
 * Trusted guardians (social recovery, exploration 0243) — the Apple recovery-contact
 * analogue. Splits the recovery phrase into 3 share codes, any 2 of which recover the
 * identity, to hand to trusted people. Entirely user-to-user; the cloud never sees them.
 */
/** Small inline number picker for the guardian counts. */
function CountSelect({
  value,
  min,
  max,
  onChange
}: {
  value: number
  min: number
  max: number
  onChange: (n: number) => void
}) {
  const options = []
  for (let n = min; n <= max; n++) options.push(n)
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="rounded-md border border-hairline bg-surface-0 px-2 py-1 text-xs text-ink-1"
    >
      {options.map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  )
}

function GuardianSetupRow() {
  const [recoverable, setRecoverable] = useState<boolean | null>(null)
  const [shares, setShares] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [total, setTotal] = useState(3)
  const [threshold, setThreshold] = useState(2)

  useEffect(() => {
    let active = true
    void identityManager.isRecoverable().then((r) => {
      if (active) setRecoverable(r)
    })
    return () => {
      active = false
    }
  }, [])

  // Threshold can never exceed the number of guardians (and Shamir needs ≥ 2).
  const effectiveThreshold = Math.min(threshold, total)

  const generate = useCallback(async () => {
    setBusy(true)
    try {
      const raw = await identityManager.createGuardianShares({
        totalShares: total,
        threshold: effectiveThreshold
      })
      setShares(raw.map(serializeShare))
    } catch (err) {
      console.error('Failed to create guardian shares:', err)
    } finally {
      setBusy(false)
    }
  }, [total, effectiveThreshold])

  // Only meaningful for recoverable identities; the RecoveryPhraseRow already explains
  // the non-recoverable case, so we stay quiet there.
  if (recoverable !== true) return null

  return (
    <SettingRow
      label="Trusted guardians"
      description="Split recovery across people you trust — like Apple's recovery contacts. Any threshold of them can help you recover, and we never see the shares."
    >
      {shares ? (
        <div className="flex max-w-[300px] flex-col items-end gap-2">
          <p className="text-right text-[11px] text-ink-3">
            Give one code to each guardian. Any {effectiveThreshold} together can restore your
            account.
          </p>
          {shares.map((code, i) => (
            <div key={code} className="flex w-full items-center justify-end gap-2">
              <span className="font-mono text-[10px] text-ink-3">#{i + 1}</span>
              <button
                onClick={() => void navigator.clipboard?.writeText(code)}
                className={QUIET_BUTTON}
                title={code}
              >
                Copy code
              </button>
            </div>
          ))}
          <button onClick={() => setShares(null)} className={QUIET_BUTTON}>
            Done
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-1.5 text-xs text-ink-3">
            <CountSelect value={total} min={2} max={7} onChange={setTotal} />
            <span>guardians,</span>
            <CountSelect value={effectiveThreshold} min={2} max={total} onChange={setThreshold} />
            <span>needed</span>
          </div>
          <button onClick={generate} disabled={busy} className={QUIET_BUTTON}>
            {busy ? 'Generating…' : 'Generate guardian shares'}
          </button>
        </div>
      )}
    </SettingRow>
  )
}

/**
 * Recovery-anchor enrollment (0243/0322/0338). Once a user has linked an
 * ATProto identity, they can protect their account with "Bluesky identity +
 * PIN": we seal the recovery backup key under the PIN (`sealEscrow`) and enroll
 * the sealed blob at the hub under the ATProto anchor. The hub can never open
 * it; recovery needs both a proof of the ATProto account AND the PIN.
 */
function RecoveryAnchorRow() {
  const { authorDID } = useXNet()
  const did = authorDID ?? ''
  const { data: profiles } = useQuery(ProfileSchema, {
    where: { did: did as `did:key:${string}` }
  })
  const [pin, setPin] = useState('')
  const [status, setStatus] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const profile = (profiles ?? []).find((p) => String(p.id) === profileNodeId(did)) as
    | Record<string, unknown>
    | undefined
  const atprotoHandle = typeof profile?.atprotoHandle === 'string' ? profile.atprotoHandle : ''
  const atprotoDid = typeof profile?.atprotoDid === 'string' ? profile.atprotoDid : ''

  const enroll = useCallback(async () => {
    if (pin.length < MIN_ESCROW_PIN_LENGTH || !did || !atprotoDid) return
    setStatus('busy')
    setMessage('')
    try {
      const phrase = await identityManager.exportRecoveryPhrase()
      if (!phrase) throw new Error('This identity has no recovery phrase to protect.')
      const { backupKey } = deriveKeysFromSeed(phrase)
      const sealed = serializeEscrow(sealEscrow(backupKey, pin))
      const bundle = await identityManager.unlock()
      const httpHub = atprotoHubHttpUrl()
      if (!httpHub) throw new Error('No hub configured to hold the escrow.')
      const token = createUCAN({
        issuer: did,
        issuerKey: bundle.signingKey,
        audience: configuredHubUrl(),
        capabilities: [{ with: '*', can: 'backup/write' }],
        expiration: Math.floor(Date.now() / 1000) + 300
      })
      const res = await fetch(`${httpHub}/recovery-anchor/enroll`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          xnetDid: did,
          anchorSubject: atprotoDid,
          sealedEscrowB64: bytesToBase64url(sealed)
        })
      })
      if (!res.ok) throw new Error(`Hub rejected enrollment (${res.status})`)
      setStatus('done')
      setPin('')
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : String(err))
    }
  }, [pin, did, atprotoDid])

  if (!atprotoHandle) {
    return (
      <SettingRow
        label="Recovery anchor"
        description="Link a Bluesky (ATProto) identity from your profile to protect your account with your global identity + a PIN. The hub never holds a key it could use alone."
      >
        <span className="text-[11px] text-ink-3">No linked identity yet</span>
      </SettingRow>
    )
  }

  return (
    <SettingRow
      label="Recovery anchor"
      description={`Protect your account with @${atprotoHandle} + a PIN. We seal your recovery key under the PIN; the hub stores only the sealed blob and can never open it.`}
    >
      {status === 'done' ? (
        <span className="text-[11px] text-green-600">Enrolled with @{atprotoHandle}</span>
      ) : (
        <div className="flex max-w-[300px] flex-col items-end gap-2">
          <input
            type="password"
            inputMode="numeric"
            placeholder={`PIN (min ${MIN_ESCROW_PIN_LENGTH})`}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="h-8 w-40 rounded-md border border-hairline bg-surface-0 px-2 text-sm text-ink-1 outline-none"
          />
          <button
            onClick={() => void enroll()}
            disabled={status === 'busy' || pin.length < MIN_ESCROW_PIN_LENGTH}
            className={QUIET_BUTTON}
          >
            {status === 'busy' ? 'Enrolling…' : 'Enroll recovery anchor'}
          </button>
          {status === 'error' && <span className="text-[11px] text-red-500">{message}</span>}
        </div>
      )}
    </SettingRow>
  )
}

function AccountSettings() {
  const { identity } = useIdentity()
  const [loggingOut, setLoggingOut] = useState(false)

  const handleLogout = useCallback(async () => {
    setLoggingOut(true)
    try {
      await logout()
    } catch (err) {
      console.error('Failed to log out:', err)
      setLoggingOut(false)
    }
  }, [])

  return (
    <SettingsPanel title="Account" description="Your identity and session on this device">
      <SettingsGroup>
        <SettingRow label="Identity" description="Your decentralized identifier (DID)">
          <span className="max-w-[280px] break-all font-mono text-[10px] text-ink-3">
            {identity?.did || 'Not initialized'}
          </span>
        </SettingRow>

        <RecoveryPhraseRow />

        <GuardianSetupRow />

        <RecoveryAnchorRow />

        <SettingRow
          label="Log out"
          description="Ends your session on this device. Your data stays local — sign back in with your passkey."
        >
          <button onClick={handleLogout} disabled={loggingOut} className={QUIET_BUTTON}>
            <LogOut size={14} strokeWidth={1.5} />
            {loggingOut ? 'Logging out…' : 'Log out'}
          </button>
        </SettingRow>
      </SettingsGroup>
    </SettingsPanel>
  )
}

// ─── About Settings ───────────────────────────────────────────────────────────

function AboutSettings() {
  const { identity } = useIdentity()

  return (
    <SettingsPanel title="About" description="Information about xNet">
      <SettingsGroup>
        <SettingRow label="Version" description="Current application version">
          <span className="font-mono text-xs text-ink-1">
            {import.meta.env.VITE_APP_VERSION || 'dev'}
          </span>
        </SettingRow>

        <SettingRow label="Platform" description="Runtime environment">
          <span className="text-xs text-ink-3">Web (PWA)</span>
        </SettingRow>

        <SettingRow label="Built with" description="Core technologies">
          <span className="text-xs text-ink-3">xNet SDK + React</span>
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup label="Your identity">
        <div className="rounded-md border border-hairline bg-surface-1 p-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-ink-3">
            DID (Decentralized Identifier)
          </div>
          <p className="mt-1 break-all font-mono text-[10px] text-ink-1">
            {identity?.did || 'Not initialized'}
          </p>
        </div>
      </SettingsGroup>

      <SettingsGroup label="Links">
        <div className="flex gap-3">
          <a href="https://xnet.fyi" target="_blank" rel="noopener noreferrer" className="text-xs">
            Website
          </a>
          <a
            href="https://github.com/crs48/xNet"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs"
          >
            GitHub
          </a>
          <a
            href="https://xnet.fyi/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs"
          >
            Documentation
          </a>
        </div>
      </SettingsGroup>
    </SettingsPanel>
  )
}
