import { describe, expect, it } from 'vitest'
import {
  buildRecordingDraft,
  defaultRecordingTitle,
  truncationNotice,
  type CaptureOutcome
} from './create-recording'

const outcome = (overrides: Partial<CaptureOutcome> = {}): CaptureOutcome => ({
  durationMs: 90_000,
  width: 1920,
  height: 1080,
  capturePath: 'screencapturekit-helper',
  truncated: false,
  truncationReason: null,
  ...overrides
})

describe('defaultRecordingTitle', () => {
  it('names the recording after when it was made', () => {
    const title = defaultRecordingTitle(Date.UTC(2026, 2, 14, 10, 42), 'en-GB')

    expect(title).toMatch(/^Screen recording, /)
    expect(title).toMatch(/2026/)
  })
})

describe('buildRecordingDraft', () => {
  it('defaults to private with an empty edit list', () => {
    const draft = buildRecordingDraft(outcome(), 1_750_000_000_000)

    expect(draft.visibility).toBe('private')
    expect(draft.cuts).toEqual([])
    expect(draft.chapters).toEqual([])
    expect(draft.cameraLayout.corner).toBe('bottom-left')
  })

  it('records which capture rung produced the file', () => {
    const draft = buildRecordingDraft(
      outcome({ capturePath: 'chromium-desktop-capturer' }),
      1_750_000_000_000
    )

    expect(draft.capturePath).toBe('chromium-desktop-capturer')
  })

  it('leaves truncationReason empty when the capture finished cleanly', () => {
    const draft = buildRecordingDraft(outcome(), 1_750_000_000_000)

    expect(draft.truncated).toBe(false)
    expect(draft.truncationReason).toBe('')
  })

  it('carries the truncation reason through verbatim', () => {
    const draft = buildRecordingDraft(
      outcome({ truncated: true, truncationReason: 'The disk filled up.' }),
      1_750_000_000_000
    )

    expect(draft.truncated).toBe(true)
    expect(draft.truncationReason).toBe('The disk filled up.')
  })

  it('never leaves a truncated recording without a stated reason', () => {
    const draft = buildRecordingDraft(
      outcome({ truncated: true, truncationReason: null }),
      1_750_000_000_000
    )

    expect(draft.truncationReason).not.toBe('')
  })

  it('does not treat dropped frames alone as truncation', () => {
    const draft = buildRecordingDraft(outcome({ droppedFrames: 400 }), 1_750_000_000_000)

    expect(draft.truncated).toBe(false)
  })

  it('prefers an explicit title and ignores whitespace-only ones', () => {
    expect(buildRecordingDraft(outcome(), 0, { title: 'Onboarding walkthrough' }).title).toBe(
      'Onboarding walkthrough'
    )
    expect(buildRecordingDraft(outcome(), 0, { title: '   ' }).title).toMatch(/^Screen recording, /)
  })

  it('clamps a negative duration rather than storing it', () => {
    expect(buildRecordingDraft(outcome({ durationMs: -5 }), 0).durationMs).toBe(0)
  })
})

describe('truncationNotice', () => {
  it('says nothing for a clean recording', () => {
    expect(truncationNotice({ truncated: false, truncationReason: '' })).toBeNull()
  })

  it('states the reason and that the partial capture was kept', () => {
    const notice = truncationNotice({
      truncated: true,
      truncationReason: 'The helper stopped responding.'
    })

    expect(notice).toMatch(/incomplete/)
    expect(notice).toMatch(/The helper stopped responding./)
    expect(notice).toMatch(/has been kept/)
  })
})
