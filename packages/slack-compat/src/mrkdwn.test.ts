import { describe, it, expect } from 'vitest'
import {
  slackMrkdwnToMarkdown,
  replaceAngleTokens,
  convertInlineFormatting,
  unescapeSlackEntities
} from './mrkdwn'

describe('replaceAngleTokens', () => {
  it('converts a labelled link to a GFM link', () => {
    expect(replaceAngleTokens('see <https://x.com|the site>')).toBe('see [the site](https://x.com)')
  })

  it('leaves a bare link as the URL', () => {
    expect(replaceAngleTokens('go <https://x.com>')).toBe('go https://x.com')
  })

  it('renders a user mention with and without a name', () => {
    expect(replaceAngleTokens('hi <@U123|alice>')).toBe('hi @alice')
    expect(replaceAngleTokens('hi <@U123>')).toBe('hi @U123')
  })

  it('renders a channel reference with and without a name', () => {
    expect(replaceAngleTokens('in <#C1|ops>')).toBe('in #ops')
    expect(replaceAngleTokens('in <#C1>')).toBe('in #C1')
  })

  it('renders special commands and subteams', () => {
    expect(replaceAngleTokens('<!here> ping')).toBe('@here ping')
    expect(replaceAngleTokens('<!channel>')).toBe('@channel')
    expect(replaceAngleTokens('<!everyone>')).toBe('@everyone')
    expect(replaceAngleTokens('<!subteam^S1|@devs>')).toBe('@devs')
    expect(replaceAngleTokens('<!date^123|today>')).toBe('today')
    expect(replaceAngleTokens('<!weird>')).toBe('@weird')
  })

  it('leaves non-token angle brackets untouched', () => {
    expect(replaceAngleTokens('a < b and c > d')).toBe('a < b and c > d')
  })
})

describe('convertInlineFormatting', () => {
  it('converts single-star bold to double-star', () => {
    expect(convertInlineFormatting('a *bold* b')).toBe('a **bold** b')
  })

  it('converts single-tilde strike to double-tilde', () => {
    expect(convertInlineFormatting('a ~gone~ b')).toBe('a ~~gone~~ b')
  })

  it('leaves already-double tilde untouched', () => {
    expect(convertInlineFormatting('a ~~gone~~ b')).toBe('a ~~gone~~ b')
  })

  it('does not match a lone star with trailing space', () => {
    expect(convertInlineFormatting('2 * 3 = 6')).toBe('2 * 3 = 6')
  })
})

describe('unescapeSlackEntities', () => {
  it('unescapes &lt; &gt; &amp; without double-decoding', () => {
    expect(unescapeSlackEntities('a &lt;b&gt; &amp; c')).toBe('a <b> & c')
    expect(unescapeSlackEntities('&amp;lt;')).toBe('&lt;')
  })
})

describe('slackMrkdwnToMarkdown', () => {
  it('returns empty string for empty input', () => {
    expect(slackMrkdwnToMarkdown('')).toBe('')
  })

  it('composes link, formatting, and entity stages', () => {
    expect(slackMrkdwnToMarkdown('*Build* failed: <https://ci|logs> &amp; retry')).toBe(
      '**Build** failed: [logs](https://ci) & retry'
    )
  })
})
