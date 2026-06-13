/**
 * Viewer-local block / mute / restrict list (exploration 0176).
 *
 * Personal moderation actions, stored per-device like the sensitivity dial.
 * - mute: hide this person's content from my feeds (they aren't notified)
 * - block: hide content + sever contact (waves/DMs disabled)
 * - restrict: don't hide content, but route their first contact to requests
 *
 * Federation-aware blocking (signed PolicyBlockList) is a follow-up; this is the
 * per-viewer UI layer that drives the render gate's `actor.localBlocked` fact.
 */
import { useCallback, useEffect, useState } from 'react'

export type BlockState = 'blocked' | 'muted' | 'restricted'

export interface BlockList {
  blocked: string[]
  muted: string[]
  restricted: string[]
}

export const EMPTY_BLOCK_LIST: BlockList = { blocked: [], muted: [], restricted: [] }

function storageKey(): string {
  const scope = (globalThis as { __XNET_STORAGE_SCOPE__?: string }).__XNET_STORAGE_SCOPE__
  return scope ? `xnet:block-list:${scope}` : 'xnet:block-list'
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

export function loadBlockList(): BlockList {
  try {
    const raw = localStorage.getItem(storageKey())
    const parsed = raw ? (JSON.parse(raw) as Partial<BlockList>) : {}
    return {
      blocked: strings(parsed.blocked),
      muted: strings(parsed.muted),
      restricted: strings(parsed.restricted)
    }
  } catch {
    return { blocked: [], muted: [], restricted: [] }
  }
}

export function saveBlockList(list: BlockList): void {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(list))
  } catch {
    // storage unavailable; in-memory state still applies
  }
}

/** The single state a DID is in, or null. A DID lives in exactly one bucket. */
export function blockStateOf(list: BlockList, did: string): BlockState | null {
  if (list.blocked.includes(did)) return 'blocked'
  if (list.muted.includes(did)) return 'muted'
  if (list.restricted.includes(did)) return 'restricted'
  return null
}

/** Whether this person's content should be hidden from my view. */
export function hidesContent(list: BlockList, did: string): boolean {
  const state = blockStateOf(list, did)
  return state === 'blocked' || state === 'muted'
}

/** Whether contact (waves/DMs) from/to this person should be severed. */
export function contactSevered(list: BlockList, did: string): boolean {
  return blockStateOf(list, did) === 'blocked'
}

function withState(list: BlockList, did: string, state: BlockState | null): BlockList {
  const next: BlockList = {
    blocked: list.blocked.filter((d) => d !== did),
    muted: list.muted.filter((d) => d !== did),
    restricted: list.restricted.filter((d) => d !== did)
  }
  if (state) next[state] = [...next[state], did]
  return next
}

export interface BlockListController {
  list: BlockList
  stateOf: (did: string) => BlockState | null
  block: (did: string) => void
  mute: (did: string) => void
  restrict: (did: string) => void
  unblock: (did: string) => void
  /** Apply many (did, state) pairs at once — used by blocklist import. */
  importMany: (entries: readonly { did: string; state: BlockState }[]) => void
}

/** Apply many state changes to a list in one pass (pure). */
export function withMany(
  list: BlockList,
  entries: readonly { did: string; state: BlockState }[]
): BlockList {
  return entries.reduce((current, entry) => withState(current, entry.did, entry.state), list)
}

export function useBlockList(): BlockListController {
  const [list, setList] = useState<BlockList>(() => loadBlockList())

  useEffect(() => {
    saveBlockList(list)
  }, [list])

  const set = useCallback(
    (did: string, state: BlockState | null) => setList((current) => withState(current, did, state)),
    []
  )

  const importMany = useCallback(
    (entries: readonly { did: string; state: BlockState }[]) =>
      setList((current) => withMany(current, entries)),
    []
  )

  return {
    list,
    stateOf: (did: string) => blockStateOf(list, did),
    block: (did: string) => set(did, 'blocked'),
    mute: (did: string) => set(did, 'muted'),
    restrict: (did: string) => set(did, 'restricted'),
    unblock: (did: string) => set(did, null),
    importMany
  }
}
