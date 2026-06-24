/**
 * Boot timeline reader for the Performance panel.
 *
 * The app's cold-start instrumentation (apps/web boot-timeline.ts) emits a
 * `performance.mark('xnet:<phase>')` for each boot phase. Since devtools is a
 * separate package it can't import that module — instead it reads the same
 * marks back off the Performance timeline and derives the identical segments.
 */

export const BOOT_PHASES = [
  'init:start',
  'sqlite:open',
  'sqlite:schema',
  'identity:ready',
  'store:ready',
  'hub:connected',
  'sync:first',
  'query:first-rows'
] as const

export type BootPhase = (typeof BOOT_PHASES)[number]

export type BootMarks = Partial<Record<BootPhase, number>>

export interface BootSegment {
  label: string
  from: BootPhase
  to: BootPhase
  ms: number
}

const SEGMENT_DEFS: Array<{ label: string; from: BootPhase; to: BootPhase }> = [
  { label: 'WASM init', from: 'init:start', to: 'sqlite:open' },
  { label: 'Schema', from: 'sqlite:open', to: 'sqlite:schema' },
  { label: 'Identity', from: 'sqlite:schema', to: 'identity:ready' },
  { label: 'Store', from: 'identity:ready', to: 'store:ready' },
  { label: 'Connect', from: 'store:ready', to: 'hub:connected' },
  { label: 'First sync', from: 'hub:connected', to: 'sync:first' }
]

/** Read the boot marks back off the Performance timeline. */
export function readBootMarks(): BootMarks {
  const out: BootMarks = {}
  if (typeof performance === 'undefined' || typeof performance.getEntriesByName !== 'function') {
    return out
  }
  for (const phase of BOOT_PHASES) {
    const entries = performance.getEntriesByName(`xnet:${phase}`, 'mark')
    if (entries.length > 0) out[phase] = entries[0].startTime
  }
  return out
}

/** Derive per-segment durations from whatever phases were marked. */
export function computeBootSegments(marks: BootMarks): BootSegment[] {
  const segments: BootSegment[] = []
  for (const def of SEGMENT_DEFS) {
    const a = marks[def.from]
    const b = marks[def.to]
    if (a != null && b != null) {
      segments.push({
        label: def.label,
        from: def.from,
        to: def.to,
        ms: Math.max(0, Math.round(b - a))
      })
    }
  }
  return segments
}

/** Wall-clock from boot start to first rows painted, if both marks exist. */
export function firstPaintMs(marks: BootMarks): number | undefined {
  const a = marks['init:start']
  const b = marks['query:first-rows']
  return a != null && b != null ? Math.round(b - a) : undefined
}
