/**
 * Format a timestamp as a compact relative time string (e.g. "5m ago").
 *
 * Shared by the comment surfaces (CommentBubble, OrphanedThreadList) that
 * previously each carried an identical copy. Falls back to a localized date
 * once the timestamp is more than a week old.
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`

  return new Date(timestamp).toLocaleDateString()
}
