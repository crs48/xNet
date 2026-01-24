/**
 * Performance utilities for the editor.
 *
 * Provides debounce, throttle, performance measurement, and
 * requestIdleCallback polyfill.
 */

/**
 * Debounce a function call. The function will only be called after
 * `delay` milliseconds have passed since the last invocation.
 *
 * @param fn - Function to debounce
 * @param delay - Delay in milliseconds
 * @returns Debounced function with a `cancel()` method
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): T & { cancel(): void } {
  let timer: ReturnType<typeof setTimeout> | null = null

  const debounced = function (this: any, ...args: Parameters<T>) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      fn.apply(this, args)
    }, delay)
  } as unknown as T & { cancel(): void }

  debounced.cancel = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  return debounced
}

/**
 * Throttle a function call. The function will be called at most once
 * every `interval` milliseconds.
 *
 * @param fn - Function to throttle
 * @param interval - Minimum interval between calls in milliseconds
 * @returns Throttled function with a `cancel()` method
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  interval: number
): T & { cancel(): void } {
  let lastCall = 0
  let timer: ReturnType<typeof setTimeout> | null = null

  const throttled = function (this: any, ...args: Parameters<T>) {
    const now = Date.now()
    const remaining = interval - (now - lastCall)

    if (remaining <= 0) {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      lastCall = now
      fn.apply(this, args)
    } else if (!timer) {
      timer = setTimeout(() => {
        lastCall = Date.now()
        timer = null
        fn.apply(this, args)
      }, remaining)
    }
  } as unknown as T & { cancel(): void }

  throttled.cancel = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    lastCall = 0
  }

  return throttled
}

export interface MeasureResult<T> {
  result: T
  duration: number
}

/**
 * Measure the execution time of a synchronous function.
 *
 * @param fn - Function to measure
 * @returns Object with the result and duration in milliseconds
 */
export function measure<T>(fn: () => T): MeasureResult<T> {
  const start = performance.now()
  const result = fn()
  const duration = performance.now() - start
  return { result, duration }
}

/**
 * Measure the execution time of an async function.
 *
 * @param fn - Async function to measure
 * @returns Promise resolving to object with the result and duration in milliseconds
 */
export async function measureAsync<T>(fn: () => Promise<T>): Promise<MeasureResult<T>> {
  const start = performance.now()
  const result = await fn()
  const duration = performance.now() - start
  return { result, duration }
}

/**
 * requestIdleCallback polyfill for environments that don't support it.
 * Falls back to setTimeout with a 1ms delay.
 */
export const requestIdle: (
  callback: (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void,
  options?: { timeout?: number }
) => number =
  typeof requestIdleCallback !== 'undefined'
    ? requestIdleCallback
    : (callback, options) => {
        const start = Date.now()
        return setTimeout(() => {
          callback({
            didTimeout: options?.timeout ? Date.now() - start >= options.timeout : false,
            timeRemaining: () => Math.max(0, 50 - (Date.now() - start))
          })
        }, 1) as unknown as number
      }

/**
 * cancelIdleCallback polyfill.
 */
export const cancelIdle: (id: number) => void =
  typeof cancelIdleCallback !== 'undefined' ? cancelIdleCallback : clearTimeout
