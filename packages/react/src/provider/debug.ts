/** Shared debug/scheduling helpers for the XNetProvider units (0276). */

// Debug logging - enable via localStorage.setItem('xnet:sync:debug', 'true')
export function log(...args: unknown[]): void {
  if (typeof localStorage !== 'undefined' && localStorage.getItem('xnet:sync:debug') === 'true') {
    console.log('[XNetProvider]', ...args)
  }
}

/** Run `fn` when the main thread is idle, falling back to a timer. */
export function scheduleIdle(fn: () => void): void {
  if (typeof window === 'undefined') return
  const ric = (window as Window & { requestIdleCallback?: (cb: () => void) => void })
    .requestIdleCallback
  if (typeof ric === 'function') ric(fn)
  else setTimeout(fn, 1000)
}
