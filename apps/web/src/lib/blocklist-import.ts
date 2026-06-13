/**
 * Subscribable blocklists (exploration 0177, W3).
 *
 * Import a *signed* `PolicyBlockList` (Bluesky/Ozone-style shared moderation
 * lists), verify its Ed25519 signature, and project its DID entries onto the
 * viewer's local block list — so a community's curated blocklist hides those
 * accounts through the same render gate as a manual block. Pure + testable.
 */
import type { BlockState } from './block-list'
import {
  isSignedPolicyBlockList,
  verifySignedPolicyBlockList,
  type SignedPolicyBlockList
} from '@xnetjs/abuse'

export type ImportedBlock = { did: string; state: BlockState }

/** Map a policy block action to the viewer-local block state. */
const ACTION_TO_STATE: Record<string, BlockState> = {
  'block-peer': 'blocked',
  reject: 'blocked',
  hide: 'muted',
  quarantine: 'restricted'
}

export function parseSignedBlocklist(text: string): SignedPolicyBlockList | null {
  try {
    const parsed: unknown = JSON.parse(text)
    return isSignedPolicyBlockList(parsed) ? parsed : null
  } catch {
    return null
  }
}

export type BlocklistImportResult =
  | { ok: false; error: string }
  | { ok: true; list: SignedPolicyBlockList; blocks: ImportedBlock[] }

/**
 * Verify a pasted signed blocklist and extract the active DID entries to apply.
 * Returns an error result for malformed JSON or an invalid signature.
 */
export function importBlocklist(text: string, now = Date.now()): BlocklistImportResult {
  const list = parseSignedBlocklist(text)
  if (!list) return { ok: false, error: 'That is not a valid signed blocklist.' }

  const verification = verifySignedPolicyBlockList(list)
  if (!verification.valid) {
    return { ok: false, error: verification.errors[0] ?? 'Signature could not be verified.' }
  }

  const seen = new Set<string>()
  const blocks: ImportedBlock[] = []
  for (const entry of list.entries) {
    if (entry.subjectType !== 'did') continue
    if (entry.expiresAt !== undefined && entry.expiresAt <= now) continue
    const state = ACTION_TO_STATE[entry.action]
    if (!state || seen.has(entry.subject)) continue
    seen.add(entry.subject)
    blocks.push({ did: entry.subject, state })
  }

  return { ok: true, list, blocks }
}
