/**
 * Console instrumentation — patches console.* for the provider's lifetime and
 * feeds entries into the ConsoleLogStore (exploration 0275).
 *
 * Dev-only surface: wired by XNetDevToolsProvider (index.dev.ts); the
 * production entry point never imports this, so production console.* stays
 * untouched.
 */

import type { ConsoleLogStore, LogLevel } from '../core/log-store'
import { classifyChannel, stringifyArgs } from '../core/log-store'

const LEVELS: LogLevel[] = ['debug', 'log', 'info', 'warn', 'error']

/**
 * Patch console.debug/log/info/warn/error to record into the store.
 * Returns a restore function. The original method always runs first, so the
 * browser console is unaffected.
 */
export function instrumentConsole(store: ConsoleLogStore): () => void {
  if (typeof console === 'undefined') return () => {}

  const originals = {} as Record<LogLevel, (...args: unknown[]) => void>
  // Recursion guard: anything our own path logs (e.g. a store listener
  // console.error'ing) must not re-enter the tap.
  let inTap = false

  for (const level of LEVELS) {
    originals[level] = console[level] as (...args: unknown[]) => void
    console[level] = (...args: unknown[]) => {
      originals[level](...args)
      if (inTap || !store.recording) return
      inTap = true
      try {
        const message = stringifyArgs(args)
        store.push({ level, channel: classifyChannel(message), message, at: Date.now() })
      } finally {
        inTap = false
      }
    }
  }

  return () => {
    for (const level of LEVELS) {
      console[level] = originals[level]
    }
  }
}
