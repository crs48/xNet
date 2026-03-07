import { describe, expect, it } from 'vitest'
import { createSessionSummaryPatch } from './active-session'

describe('active-session', () => {
  it('clears optional fields when snapshot patches unset them', () => {
    expect(
      createSessionSummaryPatch({
        previewUrl: undefined,
        lastError: undefined,
        lastScreenshotPath: undefined
      })
    ).toEqual({
      previewUrl: undefined,
      lastError: undefined,
      lastScreenshotPath: undefined
    })
  })
})
