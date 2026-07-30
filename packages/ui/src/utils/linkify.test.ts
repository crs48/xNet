import { describe, expect, it } from 'vitest'
import { findLinkTokens, mergeLinkTokens, safeHref, segmentText, type LinkToken } from './linkify'

describe('safeHref', () => {
  it('allows http, https, mailto, and tel', () => {
    expect(safeHref('http://example.com')).toBe('http://example.com')
    expect(safeHref('https://example.com/a?b=c')).toBe('https://example.com/a?b=c')
    expect(safeHref('mailto:alice@acme.io')).toBe('mailto:alice@acme.io')
    expect(safeHref('tel:+14155552671')).toBe('tel:+14155552671')
  })

  it('rejects javascript: and data: schemes', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull()
    expect(safeHref('data:text/html,<script>alert(1)</script>')).toBeNull()
  })

  it('rejects schemes smuggled past checks with control or zero-width chars', () => {
    expect(safeHref('jav\tascript:alert(1)')).toBeNull()
    expect(safeHref('java\u200bscript:alert(1)')).toBeNull()
    expect(safeHref('\u0000javascript:alert(1)')).toBeNull()
  })

  it('rejects non-URL text', () => {
    expect(safeHref('not a url')).toBeNull()
    expect(safeHref('')).toBeNull()
  })
})

describe('findLinkTokens', () => {
  it('finds explicit URLs', () => {
    const tokens = findLinkTokens('see https://example.com/docs for details')
    expect(tokens).toHaveLength(1)
    expect(tokens[0]).toMatchObject({
      type: 'url',
      text: 'https://example.com/docs',
      href: 'https://example.com/docs'
    })
  })

  it('finds fuzzy domains and defaults them to https', () => {
    const tokens = findLinkTokens('see example.com for details')
    expect(tokens).toHaveLength(1)
    expect(tokens[0].href).toBe('https://example.com')
    expect(tokens[0].text).toBe('example.com')
  })

  it('keeps balanced parens inside wikipedia-style URLs', () => {
    const url = 'https://en.wikipedia.org/wiki/Foo_(bar)'
    const tokens = findLinkTokens(`read ${url} today`)
    expect(tokens).toHaveLength(1)
    expect(tokens[0].text).toBe(url)
  })

  it('excludes trailing punctuation and wrapping parens', () => {
    expect(findLinkTokens('go to example.com.')[0].text).toBe('example.com')
    expect(findLinkTokens('(see example.com)')[0].text).toBe('example.com')
  })

  it('finds emails as mailto tokens', () => {
    const tokens = findLinkTokens('ping alice@acme.io re launch')
    expect(tokens).toHaveLength(1)
    expect(tokens[0]).toMatchObject({ type: 'email', href: 'mailto:alice@acme.io' })
  })

  it('handles uppercase hosts', () => {
    const tokens = findLinkTokens('EXAMPLE.COM is fine')
    expect(tokens).toHaveLength(1)
    expect(tokens[0].type).toBe('url')
  })

  it('returns no tokens for non-string input instead of throwing', () => {
    // Untyped property values (formula/rollup results, raw store data) can
    // reach this boundary as numbers or objects.
    expect(findLinkTokens(42 as unknown as string)).toEqual([])
    expect(findLinkTokens({} as unknown as string)).toEqual([])
    expect(findLinkTokens([] as unknown as string)).toEqual([])
    expect(findLinkTokens(null as unknown as string)).toEqual([])
    expect(findLinkTokens(undefined as unknown as string)).toEqual([])
  })

  it('returns multiple tokens in order with correct offsets', () => {
    const text = 'docs at example.com and mail alice@acme.io'
    const tokens = findLinkTokens(text)
    expect(tokens.map((t) => t.type)).toEqual(['url', 'email'])
    for (const token of tokens) {
      expect(text.slice(token.start, token.end)).toBe(token.text)
    }
  })

  it('returns nothing for plain text and empty strings', () => {
    expect(findLinkTokens('no links here, just words.')).toEqual([])
    expect(findLinkTokens('')).toEqual([])
  })

  it('does not link file-like tokens without a valid TLD', () => {
    expect(findLinkTokens('open file.ts and run it')).toEqual([])
  })
})

function token(start: number, end: number, type: LinkToken['type'] = 'url'): LinkToken {
  return { type, text: 'x'.repeat(end - start), href: 'https://x', start, end }
}

describe('mergeLinkTokens', () => {
  it('drops extra tokens that overlap base tokens', () => {
    const base = [token(5, 15)]
    const extra = [token(10, 20, 'phone'), token(30, 40, 'phone')]
    const merged = mergeLinkTokens(base, extra)
    expect(merged).toHaveLength(2)
    expect(merged.map((t) => t.start)).toEqual([5, 30])
  })

  it('sorts merged tokens by position', () => {
    const merged = mergeLinkTokens([token(20, 25)], [token(0, 5, 'phone')])
    expect(merged.map((t) => t.start)).toEqual([0, 20])
  })
})

describe('segmentText', () => {
  it('round-trips the original text', () => {
    const text = 'docs at example.com and mail alice@acme.io now'
    const segments = segmentText(text, findLinkTokens(text))
    expect(segments.map((s) => s.text).join('')).toBe(text)
  })

  it('marks link segments with their token', () => {
    const text = 'see example.com here'
    const segments = segmentText(text, findLinkTokens(text))
    expect(segments.map((s) => Boolean(s.token))).toEqual([false, true, false])
  })

  it('handles token at the start and end of text', () => {
    const text = 'example.com'
    const segments = segmentText(text, findLinkTokens(text))
    expect(segments).toHaveLength(1)
    expect(segments[0].token?.type).toBe('url')
  })

  it('returns one plain segment when there are no tokens', () => {
    expect(segmentText('plain', [])).toEqual([{ text: 'plain' }])
  })
})
