/**
 * Random timing utilities for privacy.
 *
 * Adds jitter to telemetry operations so exact timing can't be correlated.
 */

/** Schedule a callback with random delay (jitter) */
export function scheduleWithJitter(
  callback: () => void | Promise<void>,
  options: { minDelay?: number; maxDelay?: number } = {}
): ReturnType<typeof setTimeout> {
  const min = options.minDelay ?? 0
  const max = options.maxDelay ?? 5 * 60 * 1000 // 5 minutes default
  const delay = min + Math.random() * (max - min)
  return setTimeout(() => {
    void callback()
  }, delay)
}

/** Generate a random delay between min and max (ms) */
export function randomDelay(min: number, max: number): number {
  return min + Math.random() * (max - min)
}
