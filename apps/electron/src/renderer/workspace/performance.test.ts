import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearWorkspacePerformanceMarks,
  consumeWorkspacePreviewRestoreDuration,
  consumeWorkspaceSessionSelectionDuration,
  markWorkspacePreviewRestore,
  markWorkspaceSessionSelection
} from './performance'

describe('workspace performance', () => {
  beforeEach(() => {
    clearWorkspacePerformanceMarks()
  })

  it('tracks session selection duration for the matching session only', () => {
    markWorkspaceSessionSelection('session-1', 10)

    expect(consumeWorkspaceSessionSelectionDuration('session-2', 30)).toBeNull()
    expect(consumeWorkspaceSessionSelectionDuration('session-1', 35)).toBe(25)
    expect(consumeWorkspaceSessionSelectionDuration('session-1', 50)).toBeNull()
  })

  it('allows preview restore marks to be reset independently', () => {
    markWorkspaceSessionSelection('session-1', 100)
    markWorkspacePreviewRestore('session-1', 150)

    expect(consumeWorkspacePreviewRestoreDuration('session-1', 225)).toBe(75)
    expect(consumeWorkspaceSessionSelectionDuration('session-1', 240)).toBe(140)
  })
})
