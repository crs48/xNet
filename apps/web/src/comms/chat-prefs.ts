/**
 * Chat display preferences (0198). Density (comfortable vs compact, like
 * Slack/Discord) is persisted to localStorage and shared across mounted chat
 * surfaces via a tiny external store so toggling updates every open channel.
 */
import { useSyncExternalStore } from 'react'

export type ChatDensity = 'comfortable' | 'compact'

const KEY = 'xnet:chat:density'
const listeners = new Set<() => void>()

export function getDensity(): ChatDensity {
  try {
    return localStorage.getItem(KEY) === 'compact' ? 'compact' : 'comfortable'
  } catch {
    return 'comfortable'
  }
}

export function setDensity(density: ChatDensity): void {
  try {
    localStorage.setItem(KEY, density)
  } catch {
    // Non-fatal: density just won't persist (e.g. private mode).
  }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Read the current density and a setter; re-renders on change. */
export function useChatDensity(): [ChatDensity, (density: ChatDensity) => void] {
  const density = useSyncExternalStore(subscribe, getDensity, () => 'comfortable' as ChatDensity)
  return [density, setDensity]
}
