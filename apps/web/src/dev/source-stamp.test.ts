import { describe, expect, it } from 'vitest'
import { SOURCE_ATTR, formatSource, repoRelative, shouldStamp, stampProps } from './source-stamp'

describe('shouldStamp', () => {
  it('stamps host elements', () => {
    expect(shouldStamp('div', {})).toBe(true)
    expect(shouldStamp('button', { onClick: () => {} })).toBe(true)
    expect(shouldStamp('my-element', {})).toBe(true)
  })

  it('skips components — the attribute would become an unexpected prop', () => {
    expect(shouldStamp(() => null, {})).toBe(false)
    expect(shouldStamp('Button', {})).toBe(false)
  })

  it('skips fragments, which are symbols and cannot carry attributes', () => {
    expect(shouldStamp(Symbol.for('react.fragment'), {})).toBe(false)
  })

  it('skips an empty type and non-object props', () => {
    expect(shouldStamp('', {})).toBe(false)
    expect(shouldStamp('div', null)).toBe(false)
    expect(shouldStamp('div', undefined)).toBe(false)
  })

  it('never stamps twice', () => {
    expect(shouldStamp('div', { [SOURCE_ATTR]: 'a.tsx:1:1' })).toBe(false)
  })
})

describe('repoRelative', () => {
  it('trims to the packages/ segment', () => {
    expect(repoRelative('/Users/x/Code/xNet/packages/ui/src/Button.tsx')).toBe(
      'packages/ui/src/Button.tsx'
    )
  })

  it('trims to the apps/ segment', () => {
    expect(repoRelative('/Users/x/Code/xNet/apps/web/src/main.tsx')).toBe('apps/web/src/main.tsx')
  })

  it('takes the LAST occurrence — a checkout can itself live under apps/', () => {
    expect(repoRelative('/srv/apps/deploy/xNet/packages/sync/src/change.ts')).toBe(
      'packages/sync/src/change.ts'
    )
  })

  it('normalizes Windows separators', () => {
    expect(repoRelative('C:\\repo\\packages\\ui\\src\\A.tsx')).toBe('packages/ui/src/A.tsx')
  })

  it('leaves an unrecognized path alone rather than guessing', () => {
    expect(repoRelative('/tmp/scratch.tsx')).toBe('/tmp/scratch.tsx')
  })
})

describe('formatSource', () => {
  it('builds file:line:col', () => {
    expect(
      formatSource({ fileName: '/repo/packages/ui/src/A.tsx', lineNumber: 12, columnNumber: 4 })
    ).toBe('packages/ui/src/A.tsx:12:4')
  })

  it('defaults a missing position to zero rather than dropping the ref', () => {
    expect(formatSource({ fileName: '/repo/apps/web/src/A.tsx' })).toBe('apps/web/src/A.tsx:0:0')
  })

  it('returns undefined without a filename — no ref is better than a wrong one', () => {
    expect(formatSource({ lineNumber: 3 })).toBeUndefined()
    expect(formatSource(undefined)).toBeUndefined()
  })
})

describe('stampProps', () => {
  const source = { fileName: '/repo/apps/web/src/A.tsx', lineNumber: 7, columnNumber: 2 }

  it('folds the ref into a copy of props', () => {
    const props = { className: 'x' }
    const stamped = stampProps('div', props, source)
    expect(stamped).toEqual({ className: 'x', [SOURCE_ATTR]: 'apps/web/src/A.tsx:7:2' })
    // Hoisted static elements share one props object across renders; mutating
    // it would stamp every reuse with whichever call site rendered first.
    expect(props).toEqual({ className: 'x' })
    expect(stamped).not.toBe(props)
  })

  it('returns the original object when there is nothing to add', () => {
    const props = { className: 'x' }
    expect(stampProps(() => null, props, source)).toBe(props)
    expect(stampProps('div', props, undefined)).toBe(props)
    expect(stampProps('div', props, { lineNumber: 1 })).toBe(props)
  })

  it('is idempotent', () => {
    const once = stampProps('div', { a: 1 }, source)
    expect(stampProps('div', once, { ...source, lineNumber: 99 })).toBe(once)
  })
})
