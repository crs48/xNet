/**
 * Composer URL up-res pill logic (exploration 0295).
 */
import type { UrlEnv } from '../lib/url-upres'
import type { WikilinkTarget } from '@xnetjs/editor/react'
import { describe, expect, it } from 'vitest'
import { applyUrlUpres, internalUrlCandidate } from './url-upres-composer'

const ENV: UrlEnv = { appHosts: ['xnet.fyi'], hubHosts: ['hub.xnet.fyi'] }

const TARGETS: WikilinkTarget[] = [
  { href: 'page-1', title: 'Q3 Plan', kind: 'page' },
  { href: 'xnet://database/db-1', title: 'Deals', kind: 'database' }
]

const NONE: ReadonlySet<string> = new Set()

describe('internalUrlCandidate', () => {
  it('offers a resolvable page deep link', () => {
    const text = 'see https://xnet.fyi/app/#/doc/page-1 for context'
    const candidate = internalUrlCandidate(text, TARGETS, ENV, NONE)
    expect(candidate).toMatchObject({ nodeId: 'page-1', title: 'Q3 Plan', kind: 'page' })
    expect(text.slice(candidate!.start, candidate!.end)).toBe('https://xnet.fyi/app/#/doc/page-1')
  })

  it('offers a database deep link resolved via its xnet:// target href', () => {
    const candidate = internalUrlCandidate('https://xnet.fyi/#/db/db-1', TARGETS, ENV, NONE)
    expect(candidate).toMatchObject({ nodeId: 'db-1', title: 'Deals', kind: 'database' })
  })

  it('skips external URLs, unresolvable ids, and dismissed candidates', () => {
    expect(internalUrlCandidate('https://example.com/doc/page-1', TARGETS, ENV, NONE)).toBeNull()
    expect(internalUrlCandidate('https://xnet.fyi/#/doc/not-local', TARGETS, ENV, NONE)).toBeNull()
    const url = 'https://xnet.fyi/#/doc/page-1'
    expect(internalUrlCandidate(url, TARGETS, ENV, new Set([url]))).toBeNull()
  })

  it('offers the first internal URL when several are present', () => {
    const text = 'https://xnet.fyi/#/db/db-1 then https://xnet.fyi/#/doc/page-1'
    expect(internalUrlCandidate(text, TARGETS, ENV, NONE)?.nodeId).toBe('db-1')
  })
})

describe('applyUrlUpres', () => {
  it('replaces the URL span with the wikilink and moves the caret', () => {
    const text = 'see https://xnet.fyi/app/#/doc/page-1 for context'
    const candidate = internalUrlCandidate(text, TARGETS, ENV, NONE)!
    const next = applyUrlUpres(text, candidate)
    expect(next.text).toBe('see [[Q3 Plan]] for context')
    expect(next.caret).toBe('see [[Q3 Plan]]'.length)
  })
})
