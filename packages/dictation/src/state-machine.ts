/**
 * Hold-to-talk state machine.
 *
 * This is the heart of the VoiceInk-style workflow: press and hold a key to
 * record, release to transcribe, then the text is inserted. It is a *pure*
 * reducer — every event carries the timestamp it happened at, so there are no
 * timers or `Date.now()` inside (which keeps it deterministic and testable, and
 * matches the repo's "no `Date.now()` in pure modules" convention).
 *
 *   idle ──keyDown──▶ listening ──keyUp(held)──▶ transcribing ──result──▶
 *   inserting ──inserted──▶ idle
 *
 * A `keyUp` that arrives too soon after `keyDown` is treated as an accidental
 * tap and discarded back to `idle`.
 */

import type { TranscriptResult } from './types'

export interface DictationConfig {
  /** Holds shorter than this (ms) are accidental taps — discarded, not transcribed. */
  minHoldMs: number
}

export const DEFAULT_DICTATION_CONFIG: DictationConfig = { minHoldMs: 200 }

export type DictationStatus = 'idle' | 'listening' | 'transcribing' | 'inserting' | 'error'

export type DictationState =
  | { status: 'idle' }
  | { status: 'listening'; startedAt: number }
  | { status: 'transcribing'; startedAt: number; endedAt: number }
  | { status: 'inserting'; result: TranscriptResult }
  | { status: 'error'; message: string }

export type DictationEvent =
  | { type: 'keyDown'; at: number }
  | { type: 'keyUp'; at: number }
  | { type: 'result'; result: TranscriptResult }
  | { type: 'failure'; message: string }
  | { type: 'inserted' }
  | { type: 'reset' }

export const initialDictationState: DictationState = { status: 'idle' }

/**
 * Advance the machine. Invalid transitions return the state unchanged, so the
 * caller can dispatch freely without guarding every combination.
 */
export function dictationReducer(
  state: DictationState,
  event: DictationEvent,
  config: DictationConfig = DEFAULT_DICTATION_CONFIG
): DictationState {
  // `reset` always wins, from any state.
  if (event.type === 'reset') {
    return initialDictationState
  }

  switch (state.status) {
    case 'idle': {
      if (event.type === 'keyDown') {
        return { status: 'listening', startedAt: event.at }
      }
      return state
    }

    case 'listening': {
      if (event.type === 'keyUp') {
        const held = event.at - state.startedAt
        if (held < config.minHoldMs) {
          // Accidental tap — discard.
          return initialDictationState
        }
        return { status: 'transcribing', startedAt: state.startedAt, endedAt: event.at }
      }
      // A second keyDown while already listening is a no-op.
      return state
    }

    case 'transcribing': {
      if (event.type === 'result') {
        return { status: 'inserting', result: event.result }
      }
      if (event.type === 'failure') {
        return { status: 'error', message: event.message }
      }
      return state
    }

    case 'inserting': {
      if (event.type === 'inserted') {
        return initialDictationState
      }
      return state
    }

    case 'error': {
      // Re-arm by holding the key again; otherwise stay in error until reset.
      if (event.type === 'keyDown') {
        return { status: 'listening', startedAt: event.at }
      }
      return state
    }
  }
}

/** How long the key has been held while listening (ms), else 0. */
export function holdDurationMs(state: DictationState, now: number): number {
  return state.status === 'listening' ? Math.max(0, now - state.startedAt) : 0
}

/** Is the machine actively capturing audio? */
export function isListening(state: DictationState): boolean {
  return state.status === 'listening'
}

/** Is the machine busy (recording, transcribing, or inserting)? */
export function isBusy(state: DictationState): boolean {
  return state.status !== 'idle' && state.status !== 'error'
}

/**
 * A tiny stateful wrapper over {@link dictationReducer} — holds the current
 * state, lets callers `dispatch`, and notifies subscribers. No timers, no I/O;
 * a thin convenience for app code that wants an object instead of threading
 * state through React/whatever.
 */
export class DictationMachine {
  private state: DictationState = initialDictationState
  private readonly subscribers = new Set<(state: DictationState) => void>()

  constructor(private readonly config: DictationConfig = DEFAULT_DICTATION_CONFIG) {}

  getState(): DictationState {
    return this.state
  }

  dispatch(event: DictationEvent): DictationState {
    const next = dictationReducer(this.state, event, this.config)
    if (next !== this.state) {
      this.state = next
      for (const fn of this.subscribers) fn(next)
    }
    return this.state
  }

  subscribe(fn: (state: DictationState) => void): () => void {
    this.subscribers.add(fn)
    return () => {
      this.subscribers.delete(fn)
    }
  }
}
