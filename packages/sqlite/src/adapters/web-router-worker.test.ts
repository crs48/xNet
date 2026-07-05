/**
 * @xnetjs/sqlite - SharedWorker router message-handler tests (0263)
 *
 * Exercises the pure router state machine with fake ports — no SharedWorker.
 */

import type { RouterClientPort, RouterOutbound } from './web-router-worker'
import { describe, it, expect } from 'vitest'
import { addRouterClient, createRouterState, handleRouterMessage } from './web-router-worker'

interface FakePort extends RouterClientPort {
  sent: Array<{ message: RouterOutbound; transfer?: Transferable[] }>
}

function fakePort(): FakePort {
  const sent: FakePort['sent'] = []
  return {
    sent,
    postMessage(message: unknown, transfer?: Transferable[]) {
      sent.push({ message: message as RouterOutbound, transfer })
    }
  }
}

describe('router message handling (0263)', () => {
  it('answers no-leader when a port is requested before any leader announces', () => {
    const state = createRouterState()
    const follower = fakePort()
    addRouterClient(state, follower)

    handleRouterMessage(state, follower, { t: 'request-db-port', requestId: 'r1' })

    expect(follower.sent).toEqual([{ message: { t: 'no-leader', requestId: 'r1' } }])
  })

  it('forwards port requests to the leader and ferries the minted port back', () => {
    const state = createRouterState()
    const leader = fakePort()
    const follower = fakePort()
    addRouterClient(state, leader)
    addRouterClient(state, follower)

    handleRouterMessage(state, leader, { t: 'leader-ready' })
    handleRouterMessage(state, follower, { t: 'request-db-port', requestId: 'r1' })

    expect(leader.sent).toEqual([{ message: { t: 'mint-db-port', requestId: 'r1' } }])

    const minted = {} as Transferable
    handleRouterMessage(state, leader, { t: 'db-port', requestId: 'r1' }, [minted])

    expect(follower.sent).toEqual([
      { message: { t: 'db-port', requestId: 'r1' }, transfer: [minted] }
    ])
    expect(state.pending.size).toBe(0)
  })

  it('propagates leader-side mint failures to the requesting follower', () => {
    const state = createRouterState()
    const leader = fakePort()
    const follower = fakePort()
    addRouterClient(state, leader)
    addRouterClient(state, follower)
    handleRouterMessage(state, leader, { t: 'leader-ready' })
    handleRouterMessage(state, follower, { t: 'request-db-port', requestId: 'r2' })

    handleRouterMessage(state, leader, { t: 'db-port-failed', requestId: 'r2', error: 'closed' })

    expect(follower.sent).toEqual([
      { message: { t: 'db-port-failed', requestId: 'r2', error: 'closed' } }
    ])
  })

  it('fails a db-port response that carries no transferred port', () => {
    const state = createRouterState()
    const leader = fakePort()
    const follower = fakePort()
    addRouterClient(state, leader)
    addRouterClient(state, follower)
    handleRouterMessage(state, leader, { t: 'leader-ready' })
    handleRouterMessage(state, follower, { t: 'request-db-port', requestId: 'r3' })

    handleRouterMessage(state, leader, { t: 'db-port', requestId: 'r3' }, [])

    expect(follower.sent[0].message.t).toBe('db-port-failed')
  })

  it('broadcasts leader-changed to every OTHER tab on a new announcement', () => {
    const state = createRouterState()
    const oldLeader = fakePort()
    const follower = fakePort()
    const newLeader = fakePort()
    for (const p of [oldLeader, follower, newLeader]) addRouterClient(state, p)

    handleRouterMessage(state, oldLeader, { t: 'leader-ready' })
    handleRouterMessage(state, newLeader, { t: 'leader-ready' })

    expect(follower.sent).toEqual([{ message: { t: 'leader-changed' } }])
    expect(oldLeader.sent).toEqual([{ message: { t: 'leader-changed' } }])
    expect(newLeader.sent).toEqual([])
    expect(state.leader).toBe(newLeader)
  })

  it('survives broadcasting to a dead tab port', () => {
    const state = createRouterState()
    const dead: RouterClientPort = {
      postMessage() {
        throw new Error('port detached')
      }
    }
    const first = fakePort()
    const second = fakePort()
    addRouterClient(state, dead)
    addRouterClient(state, first)
    addRouterClient(state, second)

    handleRouterMessage(state, first, { t: 'leader-ready' })
    // The change broadcast hits the dead port — must not take the router down.
    expect(() => handleRouterMessage(state, second, { t: 'leader-ready' })).not.toThrow()
    expect(first.sent).toEqual([{ message: { t: 'leader-changed' } }])
  })

  it('ignores responses for unknown or already-served requests', () => {
    const state = createRouterState()
    const leader = fakePort()
    addRouterClient(state, leader)
    handleRouterMessage(state, leader, { t: 'leader-ready' })

    expect(() =>
      handleRouterMessage(state, leader, { t: 'db-port', requestId: 'ghost' }, [{} as Transferable])
    ).not.toThrow()
  })
})
