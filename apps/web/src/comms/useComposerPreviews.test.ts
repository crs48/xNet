/**
 * Composer external-URL selection for unfurl offers (exploration 0295).
 */
import type { UrlEnv } from '../lib/url-upres'
import { describe, expect, it } from 'vitest'
import { externalUrlsIn } from './useComposerPreviews'

const ENV: UrlEnv = { appHosts: ['xnet.fyi'], hubHosts: ['hub.xnet.fyi'] }

describe('externalUrlsIn', () => {
  it('keeps only external URLs, in order, deduped', () => {
    const text = [
      'https://example.com/a',
      'https://xnet.fyi/#/doc/internal-1', // internal — excluded
      'https://hub.xnet.fyi/s/xv17-H8BwWy9', // share — excluded
      'https://example.com/a', // duplicate — excluded
      'https://other.example/b'
    ].join(' ')
    expect(externalUrlsIn(text, ENV).map((url) => url.text)).toEqual([
      'https://example.com/a',
      'https://other.example/b'
    ])
  })

  it('resolves fuzzy domains through the linkify default protocol', () => {
    const urls = externalUrlsIn('see example.com/page ok', ENV)
    expect(urls).toHaveLength(1)
    expect(urls[0].href).toBe('https://example.com/page')
  })

  it('returns nothing for plain text and emails', () => {
    expect(externalUrlsIn('no links here, mail me: a@b.co', ENV)).toEqual([])
  })
})
