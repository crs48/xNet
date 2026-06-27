/**
 * Right to Leave (xNet Humane Internet Charter §Exit, exploration 0234).
 *
 * Leaving is a right, not a retention funnel. `leaveWithEverything` bundles
 * everything you'd need to recreate yourself elsewhere — your whole workspace,
 * your portable identity, and a README on how to re-import — into one archive.
 * `deleteDay` is the honest, irreversible version: stop feeding the system.
 *
 * This module is the orchestration; the app injects the real capabilities
 * (AiWorkspaceExporter for the workspace, the identity keystore, hub purge, OPFS
 * destroy, consent-gated telemetry). Keeping them as ports makes the policy —
 * "no confirmshaming, take everything, the local copy is yours" — testable in
 * isolation.
 */

/** The capabilities the app wires in. Only `exportWorkspace`/`exportIdentity` are required. */
export interface RightToLeavePorts {
  /** The full workspace as relative-path → file-content (e.g. via AiWorkspaceExporter). */
  exportWorkspace(): Promise<Record<string, string>>
  /** The portable identity bundle (did:key + recovery), JSON-serializable. */
  exportIdentity(): Promise<unknown>
  /** Tombstone the user's copies on every connected hub. Absent ⇒ offline-only user. */
  purgeRemoteCopies?(): Promise<void>
  /** Wipe the local master copy (OPFS/SQLite). Absent ⇒ nothing local to wipe. */
  destroyLocal?(): Promise<void>
  /** Record a non-identifying `account.left` signal (consent-gated). */
  recordLeft?(): void
}

export interface LeaveBundle {
  /** relative path → file content; a complete, portable copy of you. */
  files: Record<string, string>
  exportedAt: string
}

export interface DeleteDayOptions {
  /** Keep the local master copy on this device (export-and-go) vs. full wipe. */
  keepLocal: boolean
  /** Injected timestamp (ISO) — no implicit clock, so the result is deterministic. */
  now: string
}

export interface DeleteDayResult {
  remotePurged: boolean
  localWiped: boolean
  recordedLeft: boolean
}

export const LEAVE_README = `# Your xNet data — yours to keep

This archive is a complete, portable copy of your workspace.

- \`workspace/\` — every page, database, canvas, and node, plus a manifest.
- \`identity.did.json\` — your portable did:key identity and recovery material.

To continue elsewhere: run your own hub (\`xnet-hub start\`) or any xNet-compatible
backend, then import this archive. Your did:key works on any hub — there is no
account to transfer and nothing held back. You don't need our permission to leave.
`

/** Prefix every key in a file map (so the workspace nests under a folder). */
function underFolder(folder: string, files: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [path, content] of Object.entries(files)) out[`${folder}${path}`] = content
  return out
}

/**
 * Everything you'd need to recreate yourself elsewhere, in one bundle. There is
 * deliberately no "are you sure you'll miss out?" — this is a right, not a funnel.
 */
export async function leaveWithEverything(
  ports: RightToLeavePorts,
  opts: { now: string }
): Promise<LeaveBundle> {
  const [workspace, identity] = await Promise.all([ports.exportWorkspace(), ports.exportIdentity()])
  const files: Record<string, string> = {
    ...underFolder('workspace/', workspace),
    'identity.did.json': `${JSON.stringify(identity, null, 2)}\n`,
    'README.md': LEAVE_README
  }
  return { files, exportedAt: opts.now }
}

/**
 * Delete Day: stop feeding the system, for real. Tombstones remote copies on
 * every hub and (unless `keepLocal`) wipes the local master too. The only signal
 * emitted is an anonymous `account.left` — never anything that identifies who.
 */
export async function deleteDay(
  ports: RightToLeavePorts,
  opts: DeleteDayOptions
): Promise<DeleteDayResult> {
  let remotePurged = false
  let localWiped = false
  let recordedLeft = false

  if (ports.purgeRemoteCopies) {
    await ports.purgeRemoteCopies()
    remotePurged = true
  }
  if (!opts.keepLocal && ports.destroyLocal) {
    await ports.destroyLocal()
    localWiped = true
  }
  if (ports.recordLeft) {
    ports.recordLeft()
    recordedLeft = true
  }
  return { remotePurged, localWiped, recordedLeft }
}
