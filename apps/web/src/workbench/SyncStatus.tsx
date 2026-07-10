/**
 * SyncStatus — the status bar's connection cluster (exploration 0233).
 *
 * Tier A: an always-on connection chip (dot + terse label). Tier B: chips that
 * appear only when something is off-nominal — `⇡ N pending` and an integrity
 * `⚠`. Tier C: a click-through popover anchored above the bar that carries the
 * deep detail (last transition, lifecycle phase, tracked/pool counts, runtime
 * mode, storage breakdown, last verification failure) plus a Reconcile action.
 * Diagnostics like lamport/security level/billing plan stay out — this is
 * ambient status, not a dashboard. (Durable-storage usage has its own always-on
 * indicator in the bar — 0172/0287; the popover only echoes the breakdown.)
 */
import { useSyncManager, useXNet } from '@xnetjs/react'
import { Sheet, SheetContent } from '@xnetjs/ui'
import { AlertTriangle } from 'lucide-react'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStorageStatus } from '../hooks/useStorageStatus'
import { getDataRuntime } from '../lib/data-runtime'
import { formatBytes } from '../lib/format-bytes'
import { normalizeHubUrl, persistedHubUrl, setPersistedHubUrl } from '../lib/hub-url'
import { relativeTime, type SyncCoarseState } from './sync-format'
import { useSyncVitals, type SyncVitals } from './useSyncVitals'

/**
 * Other surfaces (the Share dialog's "Connect a hub…" CTA, exploration 0290)
 * open this panel instead of embedding their own hub-connection UI.
 */
export const OPEN_SYNC_STATUS_EVENT = 'xnet:open-sync-status'

export function openSyncStatusPanel(): void {
  window.dispatchEvent(new Event(OPEN_SYNC_STATUS_EVENT))
}

/** Opens the panel (`setOpen(true)`) whenever `openSyncStatusPanel()` fires. */
function useOpenSyncStatusEvent(setOpen: (open: boolean) => void): void {
  useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener(OPEN_SYNC_STATUS_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_SYNC_STATUS_EVENT, onOpen)
  }, [setOpen])
}

export const CHIP: Record<SyncCoarseState, { label: string; tone: string }> = {
  offline: { label: 'offline', tone: 'bg-ink-3' },
  connecting: { label: 'connecting…', tone: 'bg-warning' },
  syncing: { label: 'syncing…', tone: 'bg-warning' },
  error: { label: 'sync error', tone: 'bg-destructive' },
  synced: { label: 'synced', tone: 'bg-success' }
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-ink-3">{label}</span>
      <span className="truncate text-right text-ink-1">{value}</span>
    </div>
  )
}

/**
 * Inline hub connection for the local-first default (exploration 0290). The
 * Share dialog's "Connect a hub…" CTA lands here, so the panel must let the
 * user actually connect — not just report "disconnected". Persists the URL
 * the same way Settings → Network does; reloading applies it.
 */
function HubConnectForm() {
  const [url, setUrl] = useState(() => persistedHubUrl(''))
  const [invalid, setInvalid] = useState(false)

  const connect = () => {
    const normalized = normalizeHubUrl(url)
    if (!normalized) {
      setInvalid(true)
      return
    }
    setPersistedHubUrl(normalized)
    window.location.reload()
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-ink-3">connect a hub to sync and share</span>
      <div className="flex gap-1.5">
        <input
          type="text"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value)
            setInvalid(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') connect()
          }}
          placeholder="wss://hub.xnet.fyi"
          aria-label="Hub URL"
          className="h-6 min-w-0 flex-1 rounded border border-hairline bg-surface-0 px-1.5 font-mono text-[11px] text-ink-1 outline-none placeholder:text-ink-3 focus:border-border-emphasis"
        />
        <button
          type="button"
          onClick={connect}
          className="cursor-pointer rounded border border-hairline bg-surface-2 px-2 py-1 text-ink-1 hover:bg-surface-3"
        >
          Connect
        </button>
      </div>
      {invalid && <span className="text-destructive">Enter a ws(s):// or http(s):// hub URL</span>}
    </div>
  )
}

/**
 * The deep detail panel shared by the desktop popover and the mobile sheet.
 * Presentation over the sync vitals + durable-storage status, plus Reconcile.
 */
export function SystemInfoDetails({ vitals }: { vitals: SyncVitals }) {
  const syncManager = useSyncManager()
  const { runtimeStatus } = useXNet()
  const storage = useStorageStatus()
  const [reconciling, setReconciling] = useState(false)

  const chip = CHIP[vitals.state]
  const runtimeMode = runtimeStatus.activeMode ?? runtimeStatus.requestedMode ?? getDataRuntime()
  const storageValue =
    storage && typeof storage.usageBytes === 'number'
      ? typeof storage.quotaBytes === 'number'
        ? `${formatBytes(storage.usageBytes)} / ${formatBytes(storage.quotaBytes)}`
        : formatBytes(storage.usageBytes)
      : null

  const reconcile = useCallback(async () => {
    if (!syncManager) return
    setReconciling(true)
    try {
      await syncManager.reconcile({ reason: 'manual' })
    } catch {
      // Reconcile is best-effort; failures surface again on the next event.
    } finally {
      setReconciling(false)
    }
  }, [syncManager])

  return (
    <div className="flex w-72 flex-col gap-3 p-3 font-mono text-[11px] text-ink-2">
      <div className="flex items-center gap-1.5 text-ink-1">
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${chip.tone}`} />
        <span className="font-semibold">{chip.label}</span>
        <span className="ml-auto text-ink-3">{vitals.lifecyclePhase}</span>
      </div>

      <div className="flex flex-col gap-1">
        <DetailRow label="hub" value={vitals.hub} />
        <DetailRow label="last change" value={relativeTime(vitals.lastTransitionAt)} />
        <DetailRow label="pending" value={`${vitals.queueSize}`} />
        <DetailRow label="tracked nodes" value={`${vitals.trackedCount}`} />
        <DetailRow label="pool" value={`${vitals.poolSize}`} />
        <DetailRow
          label="runtime"
          value={runtimeStatus.usedFallback ? `${runtimeMode} (fallback)` : runtimeMode}
        />
        {storageValue && <DetailRow label="storage" value={storageValue} />}
      </div>

      {(vitals.hub === 'disconnected' || !vitals.hasSyncManager) && <HubConnectForm />}

      {vitals.integrityAlert && vitals.verificationFailure && (
        <div className="flex flex-col gap-1 rounded border border-destructive/40 bg-destructive/10 p-2 text-destructive">
          <span className="flex items-center gap-1 font-semibold">
            <AlertTriangle size={11} strokeWidth={1.5} />
            integrity check failed
          </span>
          <span className="break-all text-ink-2">
            {vitals.verificationFailure.reason} · {vitals.verificationFailure.nodeId.slice(0, 16)}…
          </span>
        </div>
      )}

      <button
        type="button"
        onClick={() => void reconcile()}
        disabled={!syncManager || reconciling}
        className="cursor-pointer rounded border border-hairline bg-surface-2 px-2 py-1 text-ink-1 hover:bg-surface-3 disabled:cursor-default disabled:opacity-50"
      >
        {reconciling ? 'reconciling…' : 'Reconcile now'}
      </button>
    </div>
  )
}

/**
 * Desktop connection cluster: the connection chip + conditional tier-B chips,
 * all opening one shared popover anchored above the bar.
 */
export function SyncStatus() {
  const vitals = useSyncVitals()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  useOpenSyncStatusEvent(setOpen)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (containerRef.current?.contains(target) || popoverRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const chip = CHIP[vitals.state]
  const toggle = () => setOpen((value) => !value)

  return (
    <div ref={containerRef} className="relative flex items-center gap-4">
      <button
        type="button"
        onClick={toggle}
        title={`Hub: ${vitals.hub} · ${vitals.lifecyclePhase}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex cursor-pointer items-center gap-1.5 border-none bg-transparent p-0 font-mono text-[11px] text-ink-2 hover:text-ink-1"
      >
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${chip.tone}`} />
        {chip.label}
      </button>

      {vitals.queueSize > 0 && (
        <button
          type="button"
          onClick={toggle}
          title="Unsynced local changes — click for detail"
          className="cursor-pointer border-none bg-transparent p-0 font-mono text-[11px] text-warning hover:opacity-80"
        >
          ⇡ {vitals.queueSize} pending
        </button>
      )}

      {vitals.integrityAlert && (
        <button
          type="button"
          onClick={toggle}
          title="A replicated change failed signature/hash verification — click for detail"
          aria-label="Integrity check failed"
          className="flex cursor-pointer items-center gap-1 border-none bg-transparent p-0 font-mono text-[11px] text-destructive hover:opacity-80"
        >
          <AlertTriangle size={11} strokeWidth={1.5} />
        </button>
      )}

      {open && (
        <SyncStatusPopover anchorRef={containerRef} popoverRef={popoverRef} vitals={vitals} />
      )}
    </div>
  )
}

/**
 * The desktop detail popover, portaled out of the status bar. The floating
 * islands shell (0286) clips the bar island with `overflow-hidden`, which
 * swallowed an in-place `absolute bottom-full` popover entirely — so this
 * renders fixed-position above the chip instead. Portal target is the shell
 * root, not `body`: dark-mode tokens resolve via `.dark .wb-root` descendant
 * selectors (0286) and would go dead outside it.
 */
function SyncStatusPopover({
  anchorRef,
  popoverRef,
  vitals
}: {
  anchorRef: React.RefObject<HTMLDivElement>
  popoverRef: React.MutableRefObject<HTMLDivElement | null>
  vitals: SyncVitals
}) {
  const [anchor] = useState(() => {
    const rect = anchorRef.current?.getBoundingClientRect()
    return rect
      ? { left: rect.left, bottom: window.innerHeight - rect.top + 6 }
      : { left: 8, bottom: 44 }
  })
  const portalTarget = document.querySelector('.wb-root') ?? document.body

  return createPortal(
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Sync status"
      style={{ left: anchor.left, bottom: anchor.bottom }}
      className="fixed z-50 overflow-hidden rounded-lg border border-hairline bg-island-pop shadow-pop"
    >
      <SystemInfoDetails vitals={vitals} />
    </div>,
    portalTarget
  )
}

/**
 * Mobile health glyph for the top bar: the same coarse dot, tapping it opens a
 * bottom Sheet with the shared detail content. Mobile has no status bar, so this
 * is the one home for sync health on a phone.
 */
export function MobileSyncGlyph() {
  const vitals = useSyncVitals()
  const [open, setOpen] = useState(false)
  useOpenSyncStatusEvent(setOpen)
  const chip = CHIP[vitals.state]

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`Sync: ${chip.label}`}
        aria-label={`Sync status: ${chip.label}`}
        className="touch-target tap-highlight-none flex items-center justify-center rounded border-none bg-transparent text-ink-3 hover:text-ink-1"
      >
        <span className={`inline-block h-2 w-2 rounded-full ${chip.tone}`} />
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="gap-0 rounded-t-2xl border-hairline bg-surface-1 p-0 safe-area-inset-bottom"
        >
          <SystemInfoDetails vitals={vitals} />
        </SheetContent>
      </Sheet>
    </>
  )
}
