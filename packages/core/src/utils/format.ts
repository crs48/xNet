/**
 * Small, dependency-free formatting helpers shared across packages.
 */

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const

/**
 * Format a byte count into a human-readable string using binary (1024) units.
 *
 * Canonical replacement for the several `formatBytes`/`formatFileSize` copies
 * that diverged across packages — notably ones that silently capped at MB and
 * mis-reported gigabyte-scale sizes. Scales all the way to PB and keeps one
 * decimal place above the byte unit (e.g. `1536` → `"1.5 KB"`, `0` → `"0 B"`).
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return '—'
  const negative = bytes < 0
  let value = Math.abs(bytes)
  if (value < 1024) return `${negative ? '-' : ''}${value} B`

  let unitIndex = 0
  while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${negative ? '-' : ''}${value.toFixed(1)} ${BYTE_UNITS[unitIndex]}`
}
