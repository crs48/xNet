/**
 * HubFeature v2 lifecycle + storage discipline (0383 W2).
 */
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { mountFeatures } from './registry'
import type { HubFeature } from './types'

const deps = () => ({
  app: new Hono(),
  env: {},
  requireAuth: (async (_c: unknown, next: () => Promise<void>) => next()) as never,
  storage: 'memory' as const,
  dataDir: '/tmp/xnet-registry-test',
  appUrl: 'http://localhost'
})

describe('mountFeatures v2 (0383 W2)', () => {
  it('runs storage before mount and enforces the declared table prefix', async () => {
    const order: string[] = []
    const feature: HubFeature = {
      id: 'test.prefixed',
      storage: {
        prefix: 'idx_',
        setup: ({ assertOwnTable }) => {
          order.push('storage')
          expect(assertOwnTable('idx_entries')).toBe('idx_entries')
          expect(() => assertOwnTable('search_index')).toThrow(/may only create "idx_\*"/)
        }
      },
      mount: () => {
        order.push('mount')
      }
    }
    await mountFeatures([feature], deps())
    expect(order).toEqual(['storage', 'mount'])
  })

  it('owns loops: starts in order, stops in reverse, isolates stop failures', async () => {
    const events: string[] = []
    const make = (id: string, failStop = false): HubFeature => ({
      id,
      loops: [
        {
          id: `${id}-loop`,
          start: () => {
            events.push(`start:${id}`)
          },
          stop: () => {
            events.push(`stop:${id}`)
            if (failStop) throw new Error('boom')
          }
        }
      ]
    })
    const mounted = await mountFeatures([make('a', true), make('b')], deps())
    await mounted.start()
    await mounted.stop()
    // Starts in feature order; stops in reverse; a's failure doesn't block b's
    // (already stopped) or wedge shutdown.
    expect(events).toEqual(['start:a', 'start:b', 'stop:b', 'stop:a'])
  })

  it('collects ws handler maps by feature id for the future pump consumer', async () => {
    const handler = (): void => {}
    const feature: HubFeature = { id: 'test.ws', ws: () => ({ 'sub-update': handler }) }
    const mounted = await mountFeatures([feature], deps())
    expect(mounted.wsHandlers.get('test.ws')).toEqual({ 'sub-update': handler })
  })
})
