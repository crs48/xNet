/**
 * Human-readable byte sizes for storage UI.
 *
 * Single source for the storage banner and the StatusBar indicator so the
 * two never diverge. apps/web doesn't depend on @xnetjs/core, so this mirrors
 * that package's formatter; it scales B→PB and drops the decimal once the
 * value reaches double digits (`12.7 MB` but `128 MB`, `10 GB` not `10.0 GB`).
 */
const BYTE_UNITS = ['KB', 'MB', 'GB', 'TB', 'PB'] as const

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return '—'
  if (bytes < 1024) return `${bytes} B`

  let value = bytes
  let unitIndex = -1
  while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${BYTE_UNITS[unitIndex]}`
}
