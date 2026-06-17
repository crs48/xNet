import { describe, it, expect } from 'vitest'
import { normalizeIncomingWebhook, legacyAttachmentsToMarkdown } from './normalize'

describe('legacyAttachmentsToMarkdown', () => {
  it('returns undefined for no attachments', () => {
    expect(legacyAttachmentsToMarkdown(undefined)).toBeUndefined()
    expect(legacyAttachmentsToMarkdown([])).toBeUndefined()
  })

  it('renders pretext, title, text and fields', () => {
    expect(
      legacyAttachmentsToMarkdown([
        {
          pretext: 'New *deploy*',
          title: 'web',
          text: 'shipped <https://x|build 42>',
          fields: [
            { title: 'env', value: 'prod' },
            { value: 'no-title' }
          ]
        }
      ])
    ).toBe('New **deploy**\n**web**\nshipped [build 42](https://x)\n**env**: prod\nno-title')
  })

  it('falls back to the fallback when nothing structured renders', () => {
    expect(legacyAttachmentsToMarkdown([{ fallback: 'plain' }])).toBe('plain')
  })

  it('drops an attachment that renders nothing', () => {
    expect(legacyAttachmentsToMarkdown([{}])).toBeUndefined()
  })
})

describe('normalizeIncomingWebhook', () => {
  it('prefers blocks over attachments and text', () => {
    const msg = normalizeIncomingWebhook({
      text: 'plain',
      attachments: [{ text: 'attach' }],
      blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '*block*' } }]
    })
    expect(msg.content).toBe('**block**')
  })

  it('falls back to attachments when there are no blocks', () => {
    const msg = normalizeIncomingWebhook({ text: 'plain', attachments: [{ text: 'attach me' }] })
    expect(msg.content).toBe('attach me')
  })

  it('falls back to text when there are no blocks or attachments', () => {
    const msg = normalizeIncomingWebhook({ text: 'just *text*' })
    expect(msg.content).toBe('just **text**')
  })

  it('passes through channel, username and icon hints', () => {
    const msg = normalizeIncomingWebhook({
      text: 'hi',
      channel: '#ops',
      username: 'CI Bot',
      icon_emoji: ':rocket:'
    })
    expect(msg).toEqual({
      content: 'hi',
      channelHint: '#ops',
      username: 'CI Bot',
      iconEmoji: ':rocket:'
    })
  })

  it('yields empty content for an empty payload', () => {
    expect(normalizeIncomingWebhook({}).content).toBe('')
  })
})
