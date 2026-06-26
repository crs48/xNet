/**
 * Small, dependency-free numeric helpers.
 *
 * These were independently re-implemented across many packages; this is the
 * single canonical home for the behaviour-identical variants. Specialized
 * clampers (`clampRatio`, `clampLimit`, `clampInteger`, …) intentionally stay
 * local to their callers — they encode caller-specific fallbacks and bounds.
 */

/** Clamp `value` into the inclusive `[min, max]` range. */
export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

/** Clamp `value` into the inclusive `[0, 1]` range. */
export function clamp01(value: number): number {
  return clamp(value, 0, 1)
}
