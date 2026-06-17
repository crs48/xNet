import type { TranscriptResult } from './types'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DICTATION_CONFIG,
  DictationMachine,
  dictationReducer,
  holdDurationMs,
  initialDictationState,
  isBusy,
  isListening,
  type DictationState
} from './state-machine'

const RESULT: TranscriptResult = {
  text: 'hello world',
  durationMs: 1000,
  engineId: 'fake',
  modelId: 'fake-1'
}

function run(events: Parameters<typeof dictationReducer>[1][], config = DEFAULT_DICTATION_CONFIG) {
  return events.reduce<DictationState>(
    (state, event) => dictationReducer(state, event, config),
    initialDictationState
  )
}

describe('dictationReducer', () => {
  it('starts idle', () => {
    expect(initialDictationState).toEqual({ status: 'idle' })
  })

  it('idle + keyDown → listening', () => {
    const next = dictationReducer(initialDictationState, { type: 'keyDown', at: 100 })
    expect(next).toEqual({ status: 'listening', startedAt: 100 })
  })

  it('held release → transcribing', () => {
    const state = run([
      { type: 'keyDown', at: 0 },
      { type: 'keyUp', at: 500 }
    ])
    expect(state).toEqual({ status: 'transcribing', startedAt: 0, endedAt: 500 })
  })

  it('discards an accidental tap shorter than minHoldMs', () => {
    const state = run([
      { type: 'keyDown', at: 0 },
      { type: 'keyUp', at: 50 } // < 200ms default
    ])
    expect(state).toEqual({ status: 'idle' })
  })

  it('honors a custom minHoldMs', () => {
    const state = run(
      [
        { type: 'keyDown', at: 0 },
        { type: 'keyUp', at: 50 }
      ],
      { minHoldMs: 10 }
    )
    expect(state.status).toBe('transcribing')
  })

  it('result moves transcribing → inserting, inserted → idle', () => {
    const inserting = run([
      { type: 'keyDown', at: 0 },
      { type: 'keyUp', at: 500 },
      { type: 'result', result: RESULT }
    ])
    expect(inserting).toEqual({ status: 'inserting', result: RESULT })

    const done = dictationReducer(inserting, { type: 'inserted' })
    expect(done).toEqual({ status: 'idle' })
  })

  it('failure moves transcribing → error', () => {
    const state = run([
      { type: 'keyDown', at: 0 },
      { type: 'keyUp', at: 500 },
      { type: 'failure', message: 'engine offline' }
    ])
    expect(state).toEqual({ status: 'error', message: 'engine offline' })
  })

  it('can re-arm from error with a fresh keyDown', () => {
    const error: DictationState = { status: 'error', message: 'x' }
    const next = dictationReducer(error, { type: 'keyDown', at: 999 })
    expect(next).toEqual({ status: 'listening', startedAt: 999 })
  })

  it('reset returns to idle from any state', () => {
    for (const state of [
      { status: 'listening', startedAt: 0 },
      { status: 'transcribing', startedAt: 0, endedAt: 1 },
      { status: 'inserting', result: RESULT },
      { status: 'error', message: 'x' }
    ] as DictationState[]) {
      expect(dictationReducer(state, { type: 'reset' })).toEqual({ status: 'idle' })
    }
  })

  it('ignores invalid transitions (returns same reference)', () => {
    const listening: DictationState = { status: 'listening', startedAt: 0 }
    // a second keyDown while listening is a no-op
    expect(dictationReducer(listening, { type: 'keyDown', at: 5 })).toBe(listening)
    // a stray result while idle is a no-op
    expect(dictationReducer(initialDictationState, { type: 'result', result: RESULT })).toBe(
      initialDictationState
    )
  })

  it('selectors report listening/busy/hold duration', () => {
    const listening: DictationState = { status: 'listening', startedAt: 100 }
    expect(isListening(listening)).toBe(true)
    expect(isBusy(listening)).toBe(true)
    expect(holdDurationMs(listening, 350)).toBe(250)
    expect(holdDurationMs(initialDictationState, 350)).toBe(0)
    expect(isBusy({ status: 'error', message: 'x' })).toBe(false)
    expect(isBusy(initialDictationState)).toBe(false)
  })
})

describe('DictationMachine', () => {
  it('drives a full press-hold-release-insert cycle and notifies subscribers', () => {
    const machine = new DictationMachine({ minHoldMs: 100 })
    const seen: string[] = []
    const unsubscribe = machine.subscribe((state) => seen.push(state.status))

    machine.dispatch({ type: 'keyDown', at: 0 })
    machine.dispatch({ type: 'keyUp', at: 400 })
    machine.dispatch({ type: 'result', result: RESULT })
    machine.dispatch({ type: 'inserted' })

    expect(seen).toEqual(['listening', 'transcribing', 'inserting', 'idle'])
    expect(machine.getState()).toEqual({ status: 'idle' })

    unsubscribe()
    machine.dispatch({ type: 'keyDown', at: 1000 })
    expect(seen).toHaveLength(4) // no more notifications after unsubscribe
  })

  it('does not notify on a no-op dispatch', () => {
    const machine = new DictationMachine()
    let calls = 0
    machine.subscribe(() => calls++)
    machine.dispatch({ type: 'result', result: RESULT }) // invalid from idle
    expect(calls).toBe(0)
  })
})
