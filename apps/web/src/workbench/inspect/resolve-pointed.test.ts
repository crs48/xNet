import { resolveLane } from '@xnetjs/devkit/blast-radius'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  PLUGIN_ATTR,
  SLOT_ATTR,
  SOURCE_ATTR,
  browserColorNormalizer,
  buildTokenIndex,
  resolvePointed,
  tokenRefFor
} from './resolve-pointed'

function mount(html: string): HTMLElement {
  document.body.innerHTML = html
  return document.body.firstElementChild as HTMLElement
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('resolvePointed', () => {
  it('reads the source ref off the element itself', () => {
    const el = mount(`<div ${SOURCE_ATTR}="packages/ui/src/Button.tsx:3:2"></div>`)
    expect(resolvePointed(el).source).toBe('packages/ui/src/Button.tsx:3:2')
  })

  it('walks up to the nearest stamped ancestor', () => {
    mount(`<div ${SOURCE_ATTR}="apps/web/src/A.tsx:1:0"><span><i id="deep"></i></span></div>`)
    const deep = document.getElementById('deep')
    expect(resolvePointed(deep).source).toBe('apps/web/src/A.tsx:1:0')
  })

  it('finds slot and plugin owners on ancestors and labels them', () => {
    mount(
      `<section ${SLOT_ATTR}="tasks"><div ${PLUGIN_ATTR}="fyi.xnet.mermaid"><b id="t">x</b></div></section>`
    )
    const pointed = resolvePointed(document.getElementById('t'), {
      slotLabel: (id) => (id === 'tasks' ? 'Tasks' : undefined),
      pluginName: (id) => (id === 'fyi.xnet.mermaid' ? 'Mermaid' : undefined)
    })
    expect(pointed.slotId).toBe('tasks')
    expect(pointed.slotLabel).toBe('Tasks')
    expect(pointed.pluginId).toBe('fyi.xnet.mermaid')
    expect(pointed.pluginName).toBe('Mermaid')
  })

  it('leaves a label undefined when the registry does not know the id', () => {
    const el = mount(`<div ${SLOT_ATTR}="ghost"></div>`)
    expect(resolvePointed(el, { slotLabel: () => undefined }).slotLabel).toBeUndefined()
  })

  it('returns an empty pointer for null — no owners invented', () => {
    expect(resolvePointed(null)).toEqual({})
  })

  it('returns nothing findable for an unstamped tree', () => {
    const el = mount('<div><span></span></div>')
    const pointed = resolvePointed(el)
    expect(pointed.source).toBeUndefined()
    // …and the lane resolver must then refuse rather than guess a package.
    expect(resolveLane(pointed).allowed).toBe(false)
  })

  it('composes with resolveLane end to end', () => {
    const el = mount(`<div ${SOURCE_ATTR}="packages/views/src/Grid.tsx:20:4"></div>`)
    const resolution = resolveLane(resolvePointed(el))
    expect(resolution.lane).toBe(3)
    expect(resolution.pkg).toBe('views')
    expect(resolution.allowed).toBe(true)
  })

  it('refuses a kernel package end to end', () => {
    const el = mount(`<div ${SOURCE_ATTR}="packages/sync/src/change.ts:1:1"></div>`)
    const resolution = resolveLane(resolvePointed(el))
    expect(resolution.allowed).toBe(false)
    expect(resolution.kernel).toBe(true)
  })
})

describe('buildTokenIndex', () => {
  function fakeRootStyle(vars: Record<string, string>): CSSStyleDeclaration {
    const names = Object.keys(vars)
    return {
      length: names.length,
      item: (i: number) => names[i] ?? '',
      getPropertyValue: (name: string) => vars[name] ?? ''
    } as unknown as CSSStyleDeclaration
  }

  it('inverts custom properties into a value → token map', () => {
    const index = buildTokenIndex(
      fakeRootStyle({ '--surface-1': '#fff', '--accent': 'rgb(1, 2, 3)' })
    )
    expect(index.get('#fff')).toBe('--surface-1')
    expect(index.get('rgb(1, 2, 3)')).toBe('--accent')
  })

  it('ignores non-custom properties and empty values', () => {
    const index = buildTokenIndex(fakeRootStyle({ color: 'red', '--empty': '   ' }))
    expect(index.size).toBe(0)
  })

  it('breaks ties by declaration order — the inversion is lossy by nature', () => {
    const index = buildTokenIndex(fakeRootStyle({ '--first': '#000', '--second': '#000' }))
    expect(index.get('#000')).toBe('--first')
  })
})

describe('tokenRefFor', () => {
  const index = new Map([
    ['rgb(10, 20, 30)', '--surface-1'],
    ['rgb(200, 0, 0)', '--danger']
  ])
  const computedWith = (values: Record<string, string>) => () =>
    ({ getPropertyValue: (p: string) => values[p] ?? '' }) as unknown as CSSStyleDeclaration

  it('attributes a background colour to its token', () => {
    const el = mount('<div></div>')
    expect(tokenRefFor(el, index, computedWith({ 'background-color': 'rgb(10, 20, 30)' }))).toBe(
      '--surface-1'
    )
  })

  it('falls through to text colour when the background paints nothing', () => {
    const el = mount('<div></div>')
    expect(
      tokenRefFor(
        el,
        index,
        computedWith({ 'background-color': 'rgba(0, 0, 0, 0)', color: 'rgb(200, 0, 0)' })
      )
    ).toBe('--danger')
  })

  it('skips fully transparent paint — otherwise every element claims a token', () => {
    const el = mount('<div></div>')
    expect(
      tokenRefFor(
        el,
        new Map([['rgba(0, 0, 0, 0)', '--ghost']]),
        computedWith({ 'background-color': 'rgba(0, 0, 0, 0)' })
      )
    ).toBeUndefined()
  })

  it('returns undefined when nothing matches a token', () => {
    const el = mount('<div></div>')
    expect(
      tokenRefFor(el, index, computedWith({ 'background-color': 'rgb(9, 9, 9)' }))
    ).toBeUndefined()
  })
})

describe('browserColorNormalizer', () => {
  it('resolves an HSL component triple to the form computed styles report', () => {
    // The whole reason this exists: `--surface-1: 0 0% 98%` must compare equal
    // to `getComputedStyle(el).backgroundColor === 'rgb(250, 250, 250)'`.
    expect(browserColorNormalizer()('0 0% 98%')).toBe('rgb(250, 250, 250)')
  })

  it('passes through an already-resolved colour', () => {
    expect(browserColorNormalizer()('rgb(1, 2, 3)')).toBe('rgb(1, 2, 3)')
  })

  it('leaves a non-colour token alone rather than indexing it as one', () => {
    const normalize = browserColorNormalizer()
    expect(normalize('0.25rem')).toBe('0.25rem')
    expect(normalize('ui-sans-serif, system-ui')).toBe('ui-sans-serif, system-ui')
  })
})

describe('buildTokenIndex with a normalizer', () => {
  function fakeRootStyle(vars: Record<string, string>): CSSStyleDeclaration {
    const names = Object.keys(vars)
    return {
      length: names.length,
      item: (i: number) => names[i] ?? '',
      getPropertyValue: (name: string) => vars[name] ?? ''
    } as unknown as CSSStyleDeclaration
  }

  it('indexes both the declared and the normalized form', () => {
    const index = buildTokenIndex(fakeRootStyle({ '--surface-1': '0 0% 98%' }), (value) =>
      value === '0 0% 98%' ? 'rgb(250, 250, 250)' : value
    )
    expect(index.get('0 0% 98%')).toBe('--surface-1')
    expect(index.get('rgb(250, 250, 250)')).toBe('--surface-1')
  })

  it('lets a hovered element resolve through the normalized key', () => {
    const index = buildTokenIndex(fakeRootStyle({ '--surface-1': '0 0% 98%' }), (value) =>
      value === '0 0% 98%' ? 'rgb(250, 250, 250)' : value
    )
    const computed = () =>
      ({
        getPropertyValue: (p: string) => (p === 'background-color' ? 'rgb(250, 250, 250)' : '')
      }) as unknown as CSSStyleDeclaration
    expect(tokenRefFor(document.createElement('div'), index, computed)).toBe('--surface-1')
  })
})
