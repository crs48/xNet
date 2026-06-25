import { describe, expect, it } from 'vitest'
import { fetchChangelog, parseFeed, selectUnseen } from './feed'

const SAMPLE = {
  version: 'https://jsonfeed.org/version/1.1',
  items: [
    {
      id: '2026-06-17',
      url: 'https://xnet.fyi/changelog#2026-06-17',
      title: 'Automated changelog',
      content_text: 'fallback text',
      image: 'https://xnet.fyi/images/workbench-dark.png',
      tags: ['app', 'ci'],
      _xnet: {
        date: 'June 17, 2026',
        mergedAt: '2026-06-17T16:41:38Z',
        summary: 'A real summary',
        highlights: ['a', 'b'],
        pr: 146,
        authors: [{ login: 'crs48' }, { login: 'octocat', name: 'The Octocat' }]
      }
    },
    {
      id: '2026-06-10',
      title: 'Older release',
      tags: ['ci'],
      _xnet: { date: 'June 2026', summary: 'Older', highlights: ['x'], author: { login: 'legacy' } }
    }
  ]
}

describe('parseFeed', () => {
  it('maps JSON Feed items, preferring the _xnet extension fields', () => {
    const items = parseFeed(SAMPLE)
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      id: '2026-06-17',
      title: 'Automated changelog',
      date: 'June 17, 2026',
      mergedAt: '2026-06-17T16:41:38Z',
      summary: 'A real summary',
      highlights: ['a', 'b'],
      tags: ['app', 'ci'],
      image: 'https://xnet.fyi/images/workbench-dark.png',
      pr: 146
    })
    // mergedAt is optional — absent when the extension omits it.
    expect(items[1].mergedAt).toBeUndefined()
  })

  it('falls back to id/content_text when the extension is absent', () => {
    const [item] = parseFeed({ items: [{ id: '2026-01-01', title: 'X', content_text: 'body' }] })
    expect(item.date).toBe('2026-01-01')
    expect(item.summary).toBe('body')
    expect(item.highlights).toEqual([])
  })

  it('drops malformed items and tolerates non-feed input', () => {
    expect(parseFeed({ items: [{ title: 'no id' }, { id: 'x', title: 'ok' }] })).toHaveLength(1)
    expect(parseFeed(null)).toEqual([])
    expect(parseFeed({})).toEqual([])
  })

  it('parses contributors, falls back to the legacy author, and defaults to []', () => {
    const items = parseFeed(SAMPLE)
    expect(items[0].authors).toEqual([
      { login: 'crs48' },
      { login: 'octocat', name: 'The Octocat' }
    ])
    expect(items[1].authors).toEqual([{ login: 'legacy' }]) // legacy single `author`
    const [bare] = parseFeed({ items: [{ id: '2026-01-01', title: 'X' }] })
    expect(bare.authors).toEqual([])
    // malformed contributor entries (no login) are dropped
    const [filtered] = parseFeed({
      items: [{ id: 'a', title: 'b', _xnet: { authors: [{ name: 'no login' }, { login: 'ok' }] } }]
    })
    expect(filtered.authors).toEqual([{ login: 'ok' }])
  })
})

describe('selectUnseen', () => {
  const items = parseFeed(SAMPLE)

  it('returns entries strictly newer than the last-seen id', () => {
    expect(selectUnseen(items, '2026-06-10').map((i) => i.id)).toEqual(['2026-06-17'])
  })

  it('returns nothing when caught up', () => {
    expect(selectUnseen(items, '2026-06-17')).toEqual([])
  })

  it('returns nothing when never seen (seeded later by the hook)', () => {
    expect(selectUnseen(items, null)).toEqual([])
  })
})

describe('fetchChangelog', () => {
  it('returns [] on a failed response without throwing', async () => {
    const failing = (async () => ({ ok: false }) as Response) as typeof fetch
    expect(await fetchChangelog(failing)).toEqual([])
  })

  it('returns [] when fetch rejects (offline)', async () => {
    const rejecting = (async () => {
      throw new Error('offline')
    }) as typeof fetch
    expect(await fetchChangelog(rejecting)).toEqual([])
  })

  it('parses a successful response', async () => {
    const ok = (async () =>
      ({ ok: true, json: async () => SAMPLE }) as unknown as Response) as typeof fetch
    expect((await fetchChangelog(ok)).map((i) => i.id)).toEqual(['2026-06-17', '2026-06-10'])
  })
})
