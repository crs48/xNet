/**
 * EffectScope + ServiceRegistry (exploration 0455): reverse-order awaited
 * disposal with containment, and provide/inject availability semantics.
 */

import { describe, expect, it } from 'vitest'
import { EffectScope, ScopeDisposedError } from '../scope'
import { AGENT_TOOLS_SERVICE, ServiceRegistry, ServiceUnavailableError } from '../service-registry'

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('EffectScope', () => {
  it('disposes effects in reverse registration order, awaiting async disposers', async () => {
    const order: string[] = []
    const scope = new EffectScope()
    scope.use(() => {
      order.push('first')
    })
    scope.use({
      dispose: async () => {
        await tick()
        order.push('second')
      }
    })
    scope.use(() => {
      order.push('third')
    })

    await scope.dispose()
    expect(order).toEqual(['third', 'second', 'first'])
  })

  it('a throwing disposer does not strand the rest', async () => {
    const order: string[] = []
    const scope = new EffectScope()
    scope.use(() => {
      order.push('early')
    })
    scope.use(() => {
      throw new Error('boom')
    })
    scope.use(() => {
      order.push('late')
    })

    await scope.dispose()
    expect(order).toEqual(['late', 'early'])
  })

  it('child scopes dispose with (and before the earlier effects of) the parent', async () => {
    const order: string[] = []
    const parent = new EffectScope()
    parent.use(() => {
      order.push('parent-early')
    })
    const child = parent.child()
    child.use(() => {
      order.push('child')
    })

    await parent.dispose()
    expect(order).toEqual(['child', 'parent-early'])
    expect(child.disposed).toBe(true)
  })

  it('a child disposed early does not re-dispose with the parent', async () => {
    const order: string[] = []
    const parent = new EffectScope()
    const child = parent.child()
    child.use(() => {
      order.push('child')
    })

    await child.dispose()
    await parent.dispose()
    expect(order).toEqual(['child'])
  })

  it('is idempotent and refuses new effects after disposal', async () => {
    const scope = new EffectScope()
    let count = 0
    scope.use(() => {
      count++
    })
    await scope.dispose()
    await scope.dispose()
    expect(count).toBe(1)
    expect(() => scope.use(() => {})).toThrow(ScopeDisposedError)
  })
})

describe('ServiceRegistry', () => {
  it('get throws typed when absent; latest provider wins; getAll keeps every one', () => {
    const services = new ServiceRegistry()
    expect(() => services.get('missing')).toThrow(ServiceUnavailableError)

    const a = services.provide('thing', 'a')
    services.provide('thing', 'b')
    expect(services.get('thing')).toBe('b')
    expect(services.getAll('thing')).toEqual(['a', 'b'])

    a.dispose()
    expect(services.getAll('thing')).toEqual(['b'])
  })

  it('watch fires immediately, on every change, and down to empty', () => {
    const services = new ServiceRegistry()
    const seen: string[][] = []
    services.watch<string>(AGENT_TOOLS_SERVICE, (values) => seen.push(values))

    const p = services.provide(AGENT_TOOLS_SERVICE, 'tools-a')
    p.dispose()
    expect(seen).toEqual([[], ['tools-a'], []])
  })

  it('inject waits for availability, re-runs on swap, disposes when the provider goes', async () => {
    const services = new ServiceRegistry()
    const runs: string[] = []
    const disposals: string[] = []

    services.inject(['db'], (scope) => {
      const value = services.get<string>('db')
      runs.push(value)
      scope.use(() => {
        disposals.push(value)
      })
    })
    expect(runs).toEqual([]) // not yet available

    const first = services.provide('db', 'v1')
    await tick()
    expect(runs).toEqual(['v1'])

    const second = services.provide('db', 'v2') // swap: latest wins → re-run
    await tick()
    expect(disposals).toEqual(['v1'])
    expect(runs).toEqual(['v1', 'v2'])

    second.dispose() // back to v1 → re-run again
    await tick()
    expect(runs).toEqual(['v1', 'v2', 'v1'])

    first.dispose() // last provider gone → body scope disposed, no re-run
    await tick()
    expect(disposals).toEqual(['v1', 'v2', 'v1'])
    expect(runs).toHaveLength(3)
  })

  it('disposing the inject handle disposes the current body scope', async () => {
    const services = new ServiceRegistry()
    const disposals: string[] = []
    services.provide('db', 'v1')

    const handle = services.inject(['db'], (scope) => {
      scope.use(() => {
        disposals.push('body')
      })
    })
    await tick()
    handle.dispose()
    await tick()
    expect(disposals).toEqual(['body'])
  })
})
