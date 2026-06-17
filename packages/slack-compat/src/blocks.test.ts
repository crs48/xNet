import { describe, it, expect } from 'vitest'
import { blockKitToMarkdown, blockToMarkdown, renderTextObject } from './blocks'

describe('renderTextObject', () => {
  it('converts mrkdwn but leaves plain_text as-is', () => {
    expect(renderTextObject({ type: 'mrkdwn', text: '*hi* <@U1>' })).toBe('**hi** @U1')
    expect(renderTextObject({ type: 'plain_text', text: '*hi*' })).toBe('*hi*')
  })

  it('returns empty string for missing/empty text', () => {
    expect(renderTextObject(undefined)).toBe('')
    expect(renderTextObject({ type: 'mrkdwn', text: '' })).toBe('')
  })
})

describe('blockToMarkdown', () => {
  it('renders a header as an h2', () => {
    expect(blockToMarkdown({ type: 'header', text: { type: 'plain_text', text: 'Deploy' } })).toBe(
      '## Deploy'
    )
  })

  it('renders a section with text and fields', () => {
    expect(
      blockToMarkdown({
        type: 'section',
        text: { type: 'mrkdwn', text: '*Status*: ok' },
        fields: [
          { type: 'mrkdwn', text: 'env: prod' },
          { type: 'plain_text', text: 'region: us' }
        ]
      })
    ).toBe('**Status**: ok\nenv: prod\nregion: us')
  })

  it('renders a context block italicized', () => {
    expect(
      blockToMarkdown({
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: 'by *bot*' },
          { type: 'image', image_url: 'x' },
          { type: 'plain_text', text: 'now' }
        ]
      })
    ).toBe('_by **bot** now_')
  })

  it('renders a divider', () => {
    expect(blockToMarkdown({ type: 'divider' })).toBe('---')
  })

  it('falls back to text for an unknown block type', () => {
    expect(blockToMarkdown({ type: 'actions', text: { type: 'plain_text', text: 'btns' } })).toBe(
      'btns'
    )
    expect(blockToMarkdown({ type: 'actions' })).toBe('')
  })
})

describe('blockKitToMarkdown', () => {
  it('returns undefined for missing or empty blocks', () => {
    expect(blockKitToMarkdown(undefined)).toBeUndefined()
    expect(blockKitToMarkdown([])).toBeUndefined()
  })

  it('returns undefined when no block produces text', () => {
    expect(blockKitToMarkdown([{ type: 'actions' }, { type: 'image' }])).toBeUndefined()
  })

  it('joins rendered blocks with blank lines', () => {
    expect(
      blockKitToMarkdown([
        { type: 'header', text: { type: 'plain_text', text: 'Alert' } },
        { type: 'divider' },
        { type: 'section', text: { type: 'mrkdwn', text: 'CPU > 90%' } }
      ])
    ).toBe('## Alert\n\n---\n\nCPU > 90%')
  })
})
