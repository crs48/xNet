import type { TranscriptResult } from './types'
import { describe, expect, it } from 'vitest'
import {
  buildTranscriptionFields,
  isEmptyTranscript,
  joinSegments,
  normalizeTranscriptText
} from './transcript'

describe('normalizeTranscriptText', () => {
  it('collapses whitespace and trims', () => {
    expect(normalizeTranscriptText('  hello   world \n')).toBe('hello world')
  })

  it('removes spaces before punctuation', () => {
    expect(normalizeTranscriptText('hello , world . yes ?')).toBe('hello, world. yes?')
  })
})

describe('joinSegments', () => {
  it('joins and normalizes segment text', () => {
    expect(
      joinSegments([
        { text: 'hello', startMs: 0, endMs: 500 },
        { text: 'there', startMs: 500, endMs: 900 }
      ])
    ).toBe('hello there')
  })
})

describe('buildTranscriptionFields', () => {
  const base: TranscriptResult = {
    text: '  the quick   brown fox ',
    durationMs: 2345.6,
    engineId: 'whisper',
    modelId: 'large-v3-turbo',
    language: 'en'
  }

  it('normalizes text, rounds duration, and carries provenance', () => {
    const fields = buildTranscriptionFields(base, 'pushToTalk')
    expect(fields).toEqual({
      text: 'the quick brown fox',
      language: 'en',
      engineId: 'whisper',
      modelId: 'large-v3-turbo',
      durationMs: 2346,
      source: 'pushToTalk'
    })
  })

  it('defaults source to inApp and omits language when absent', () => {
    const fields = buildTranscriptionFields({ ...base, language: undefined })
    expect(fields.source).toBe('inApp')
    expect('language' in fields).toBe(false)
  })
})

describe('isEmptyTranscript', () => {
  it('detects whitespace-only results', () => {
    expect(isEmptyTranscript({ text: '   \n ', durationMs: 0, engineId: 'x', modelId: 'y' })).toBe(
      true
    )
    expect(isEmptyTranscript({ text: 'hi', durationMs: 0, engineId: 'x', modelId: 'y' })).toBe(
      false
    )
  })
})
