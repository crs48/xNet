/**
 * Right to Leave — app-side wiring (Charter §Exit, exploration 0234; real
 * data source per exploration 0344).
 *
 * Composes the merged `@xnetjs/plugins` leave service with browser-safe
 * capabilities. The workspace payload is the `.xnetpack` bundle built from
 * the OPFS SQLite master (signed change log + Yjs doc states) — the
 * IndexedDB dump rides along as a sidecar for completeness, but it is no
 * longer the master copy's stand-in. Leaving takes everything and loses
 * nothing.
 */
import type { NodeStore } from '@xnetjs/data'
import type { LeaveBundle, RightToLeavePorts } from '@xnetjs/plugins'
import { exportXnetpackEntries } from './bundle-export'
import { downloadJson, exportBrowserWorkspace } from './browser-export'

export interface LeaveIdentity {
  did?: string
}

export interface LeaveDeps {
  /** Wipe the local master copy (e.g. requestXNetBrowserStorageReset). */
  destroyLocal: () => void
  /** Emit a non-identifying account.left signal (consent-gated). */
  recordLeft: () => void
  /**
   * The live NodeStore (the OPFS SQLite master). When present the leave
   * bundle carries the signed `.xnetpack` change log; without it the bundle
   * degrades to the IndexedDB sidecar dump only.
   */
  store?: NodeStore | null
  /** Signs the bundle manifest with the identity's key. */
  signBytes?: (bytes: Uint8Array) => Uint8Array | Promise<Uint8Array>
  /**
   * Purge this identity's authored changes from the configured hub
   * (`DELETE /export/changes`, exploration 0344). Absent when no hub is
   * configured — an offline-only departure has nothing remote to purge.
   */
  purgeRemote?: () => Promise<void>
}

/** Browser implementations of the leave ports. `now` is injected for determinism. */
export function createLeavePorts(
  identity: LeaveIdentity,
  now: string,
  deps: LeaveDeps
): RightToLeavePorts {
  return {
    exportWorkspace: async () => {
      const files: Record<string, string> = {}
      if (deps.store && identity.did) {
        const entries = await exportXnetpackEntries(deps.store, identity.did, deps.signBytes)
        for (const [path, content] of Object.entries(entries)) {
          files[`workspace.xnetpack/${path}`] = content
        }
      }
      // IndexedDB sidecars (queues, caches) — supplementary, not the master.
      files['sidecars/indexeddb.json'] =
        `${JSON.stringify(await exportBrowserWorkspace(now), null, 2)}\n`
      return files
    },
    exportIdentity: async () => ({ did: identity.did ?? null }),
    ...(deps.purgeRemote ? { purgeRemoteCopies: deps.purgeRemote } : {}),
    destroyLocal: async () => deps.destroyLocal(),
    recordLeft: deps.recordLeft
  }
}

/** Download the whole leave bundle (workspace + identity + README) as one file. */
export function downloadLeaveBundle(bundle: LeaveBundle): void {
  const day = bundle.exportedAt.slice(0, 10)
  downloadJson(`xnet-everything-${day}.json`, bundle)
}
