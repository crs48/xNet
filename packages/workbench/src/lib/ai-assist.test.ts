/**
 * Assist-mode preference (0422): the opt-in Charter §Agency promises must
 * round-trip, and every failure path must land on `scaffold`.
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  AI_ASSIST_MODE_KEY,
  DEFAULT_ASSIST_MODE,
  readAssistMode,
  writeAssistMode
} from './ai-assist'

afterEach(() => localStorage.removeItem(AI_ASSIST_MODE_KEY))

describe('assist mode preference', () => {
  it('defaults to scaffold when nothing is stored', () => {
    expect(DEFAULT_ASSIST_MODE).toBe('scaffold')
    expect(readAssistMode()).toBe('scaffold')
  })

  it('round-trips an explicit opt-in to draft', () => {
    writeAssistMode('draft')
    expect(localStorage.getItem(AI_ASSIST_MODE_KEY)).toBe('draft')
    expect(readAssistMode()).toBe('draft')
  })

  it('clears the key when returning to the default', () => {
    writeAssistMode('draft')
    writeAssistMode('scaffold')
    expect(localStorage.getItem(AI_ASSIST_MODE_KEY)).toBeNull()
    expect(readAssistMode()).toBe('scaffold')
  })

  it('falls back to scaffold on an unrecognised stored value', () => {
    // An unparseable preference is not a licence to draft — the deskilling
    // guard must survive a corrupted or hand-edited localStorage entry.
    localStorage.setItem(AI_ASSIST_MODE_KEY, 'ghostwriter')
    expect(readAssistMode()).toBe('scaffold')
  })
})
