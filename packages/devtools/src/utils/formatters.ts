/**
 * Display formatting utilities for DevTools panels
 */

/** Truncate a DID for display: did:key:z6Mk... -> did:key:z6M...xyz */
export function truncateDID(did: string, maxLen = 20): string {
  if (did.length <= maxLen) return did
  const prefix = did.slice(0, maxLen - 6)
  const suffix = did.slice(-3)
  return `${prefix}...${suffix}`
}

/** Truncate a CID for display */
export function truncateCID(cid: string, maxLen = 16): string {
  if (cid.length <= maxLen) return cid
  const prefix = cid.slice(0, maxLen - 6)
  const suffix = cid.slice(-3)
  return `${prefix}...${suffix}`
}

/** Format a timestamp as relative time (e.g., "2s ago", "5m ago") */
export function relativeTime(wallTime: number): string {
  const diff = Date.now() - wallTime
  if (diff < 1000) return 'just now'
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

/** Format a timestamp as HH:MM:SS.mmm */
export function formatTime(wallTime: number): string {
  const d = new Date(wallTime)
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  const s = d.getSeconds().toString().padStart(2, '0')
  const ms = d.getMilliseconds().toString().padStart(3, '0')
  return `${h}:${m}:${s}.${ms}`
}

/** Format bytes to human-readable size */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Format duration in ms */
export function formatDuration(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}us`
  if (ms < 1000) return `${ms.toFixed(1)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}
