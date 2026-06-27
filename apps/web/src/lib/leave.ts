/**
 * Right to Leave — app-side wiring (Charter §Exit, exploration 0234).
 *
 * Composes the merged `@xnetjs/plugins` leave service with browser-safe
 * capabilities: the IndexedDB workspace dump, the portable did:key identity, and
 * caller-injected `destroyLocal` / `recordLeft` (kept as deps so this module
 * stays free of build-only imports and unit-testable). Leaving takes everything
 * and loses nothing.
 */
import type { LeaveBundle, RightToLeavePorts } from '@xnetjs/plugins'
import { downloadJson, exportBrowserWorkspace } from './browser-export'

export interface LeaveIdentity {
  did?: string
}

export interface LeaveDeps {
  /** Wipe the local master copy (e.g. requestXNetBrowserStorageReset). */
  destroyLocal: () => void
  /** Emit a non-identifying account.left signal (consent-gated). */
  recordLeft: () => void
}

/** Browser implementations of the leave ports. `now` is injected for determinism. */
export function createLeavePorts(
  identity: LeaveIdentity,
  now: string,
  deps: LeaveDeps
): RightToLeavePorts {
  return {
    exportWorkspace: async () => ({
      'workspace.json': `${JSON.stringify(await exportBrowserWorkspace(now), null, 2)}\n`
    }),
    exportIdentity: async () => ({ did: identity.did ?? null }),
    // No hub-purge port wired yet — an offline-only departure tombstones nothing
    // remote. The local master is the user's; destroyLocal wipes it on request.
    destroyLocal: async () => deps.destroyLocal(),
    recordLeft: deps.recordLeft
  }
}

/** Download the whole leave bundle (workspace + identity + README) as one file. */
export function downloadLeaveBundle(bundle: LeaveBundle): void {
  const day = bundle.exportedAt.slice(0, 10)
  downloadJson(`xnet-everything-${day}.json`, bundle)
}
