/**
 * @xnetjs/sqlite - Web-Locks leadership + follower-guard tests (0263)
 *
 * Drives the election state machine with a fake LockManager and the follower
 * plumbing with a fake router — no browser primitives required.
 */

import type { LockManagerLike, RouterLike } from './web-leader'
import { describe, it, expect, vi } from 'vitest'
import {
  FollowerCallGuard,
  LeaderLostError,
  acquireTabRole,
  requestDbPort,
  serveLeaderPorts
} from './web-leader'

/** A fake LockManager: exclusive, single lock name, grant-queue semantics. */
function fakeLocks() {
  let held = false
  const waiters: Array<{
    grant: () => void
    signal?: AbortSignal
  }> = []

  const releaseCurrent = (): void => {
    held = false
    // Grant to the first non-aborted waiter.
    while (waiters.length > 0) {
      const next = waiters.shift()!
      if (next.signal?.aborted) continue
      next.grant()
      return
    }
  }

  const locks: LockManagerLike = {
    async request(_name, options, callback) {
      if (options.ifAvailable) {
        if (held) {
          return callback(null)
        }
        held = true
        const result = await callback({})
        releaseCurrent()
        return result
      }

      // Blocking request: queue until the current holder releases.
      await new Promise<void>((resolve, reject) => {
        const waiter = {
          grant: () => {
            held = true
            resolve()
          },
          signal: options.signal
        }
        options.signal?.addEventListener('abort', () => reject(new Error('aborted')))
        if (!held) {
          waiter.grant()
        } else {
          waiters.push(waiter)
        }
      })
      const result = await callback({})
      releaseCurrent()
      return result
    }
  }

  return { locks, isHeld: () => held }
}

/** A fake in-memory router bus (both directions on one listener set). */
function fakeRouter(): RouterLike & {
  posted: unknown[]
  emit: (message: unknown, ports?: MessagePort[]) => void
} {
  const listeners = new Set<(message: unknown, ports: readonly MessagePort[]) => void>()
  const posted: unknown[] = []
  return {
    posted,
    post(message) {
      posted.push(message)
    },
    onMessage(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    emit(message, ports = []) {
      for (const listener of [...listeners]) listener(message, ports)
    }
  }
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe('acquireTabRole (0263)', () => {
  it('the first tab becomes leader and holds the lock', async () => {
    const { locks, isHeld } = fakeLocks()
    const handle = await acquireTabRole(locks, () => {}, 'test-lock')
    expect(handle.role).toBe('leader')
    expect(isHeld()).toBe(true)
  })

  it('a second tab becomes follower and is promoted when the leader releases', async () => {
    const { locks } = fakeLocks()
    const leader = await acquireTabRole(locks, () => {}, 'test-lock')
    expect(leader.role).toBe('leader')

    const promoted = vi.fn()
    const follower = await acquireTabRole(locks, promoted, 'test-lock')
    expect(follower.role).toBe('follower')
    expect(promoted).not.toHaveBeenCalled()

    leader.release()
    await tick()
    expect(promoted).toHaveBeenCalledTimes(1)
  })

  it("a closed follower's pending promotion is cancelled by release()", async () => {
    const { locks } = fakeLocks()
    const leader = await acquireTabRole(locks, () => {}, 'test-lock')

    const promoted = vi.fn()
    const follower = await acquireTabRole(locks, promoted, 'test-lock')
    follower.release() // proxy.close() on the follower

    leader.release()
    await tick()
    expect(promoted).not.toHaveBeenCalled()
  })

  it('promotion passes over aborted followers to the next waiter', async () => {
    const { locks } = fakeLocks()
    const leader = await acquireTabRole(locks, () => {}, 'test-lock')

    const promotedA = vi.fn()
    const promotedB = vi.fn()
    const followerA = await acquireTabRole(locks, promotedA, 'test-lock')
    await acquireTabRole(locks, promotedB, 'test-lock')

    followerA.release()
    leader.release()
    await tick()
    expect(promotedA).not.toHaveBeenCalled()
    expect(promotedB).toHaveBeenCalledTimes(1)
  })
})

describe('serveLeaderPorts (0263)', () => {
  it('announces leadership and serves mint requests', async () => {
    const router = fakeRouter()
    const minted = { port: true } as unknown as MessagePort
    const unsubscribe = serveLeaderPorts(router, async () => minted)

    expect(router.posted).toContainEqual({ t: 'leader-ready' })

    router.emit({ t: 'mint-db-port', requestId: 'r1' })
    await tick()
    expect(router.posted).toContainEqual({ t: 'db-port', requestId: 'r1' })

    unsubscribe()
    router.emit({ t: 'mint-db-port', requestId: 'r2' })
    await tick()
    expect(router.posted.filter((m) => (m as { t: string }).t === 'db-port')).toHaveLength(1)
  })

  it('reports mint failures instead of dropping the request', async () => {
    const router = fakeRouter()
    serveLeaderPorts(router, async () => {
      throw new Error('database closed')
    })
    router.emit({ t: 'mint-db-port', requestId: 'r1' })
    await tick()
    expect(router.posted).toContainEqual({
      t: 'db-port-failed',
      requestId: 'r1',
      error: 'database closed'
    })
  })
})

describe('requestDbPort (0263)', () => {
  it('resolves with the transferred port', async () => {
    const router = fakeRouter()
    const port = { fake: 'port' } as unknown as MessagePort

    const request = requestDbPort(router, { timeoutMs: 500, retryDelayMs: 10 })
    await tick()
    const sent = router.posted.at(-1) as { t: string; requestId: string }
    expect(sent.t).toBe('request-db-port')
    router.emit({ t: 'db-port', requestId: sent.requestId }, [port])

    await expect(request).resolves.toBe(port)
  })

  it('retries on no-leader until the leader announces, then succeeds', async () => {
    const router = fakeRouter()
    const port = { fake: 'port' } as unknown as MessagePort

    const request = requestDbPort(router, { timeoutMs: 2_000, retryDelayMs: 5 })
    await tick()
    const first = router.posted.at(-1) as { requestId: string }
    router.emit({ t: 'no-leader', requestId: first.requestId })

    // Second attempt fires after the retry delay; answer it with the port.
    await new Promise((r) => setTimeout(r, 20))
    const second = router.posted.at(-1) as { requestId: string }
    expect(second.requestId).not.toBe(first.requestId)
    router.emit({ t: 'db-port', requestId: second.requestId }, [port])

    await expect(request).resolves.toBe(port)
  })

  it('rejects on db-port-failed', async () => {
    const router = fakeRouter()
    const request = requestDbPort(router, { timeoutMs: 500, retryDelayMs: 10 })
    await tick()
    const sent = router.posted.at(-1) as { requestId: string }
    router.emit({ t: 'db-port-failed', requestId: sent.requestId, error: 'nope' })
    await expect(request).rejects.toThrow(/Timed out|leader/)
  })

  it('times out when nobody ever answers', async () => {
    const router = fakeRouter()
    await expect(requestDbPort(router, { timeoutMs: 30, retryDelayMs: 5 })).rejects.toThrow(
      /Timed out/
    )
  })
})

describe('FollowerCallGuard (0263)', () => {
  it('passes results and errors through untouched', async () => {
    const guard = new FollowerCallGuard()
    await expect(guard.run(async () => 42)).resolves.toBe(42)
    await expect(
      guard.run(async () => {
        throw new Error('sql error')
      })
    ).rejects.toThrow('sql error')
  })

  it('rejects in-flight calls on leader loss (abort-on-remote-close)', async () => {
    const guard = new FollowerCallGuard()
    const hanging = guard.run(() => new Promise<never>(() => {}))
    guard.markLeaderLost()
    await expect(hanging).rejects.toBeInstanceOf(LeaderLostError)
  })

  it('re-issues retryable reads after reconnection', async () => {
    const guard = new FollowerCallGuard()
    let attempts = 0
    const read = guard.run(
      () => {
        attempts += 1
        return new Promise<string>(() => {}) // first attempt hangs on the dead port
      },
      {
        retry: async () => {
          attempts += 1
          return 'fresh-rows'
        }
      }
    )
    guard.markLeaderLost()
    guard.markReconnected()
    await expect(read).resolves.toBe('fresh-rows')
    expect(attempts).toBe(2)
  })

  it('rejects new non-retryable calls while disconnected', async () => {
    const guard = new FollowerCallGuard()
    guard.markLeaderLost()
    await expect(guard.run(async () => 'write')).rejects.toBeInstanceOf(LeaderLostError)
    guard.markReconnected()
    await expect(guard.run(async () => 'write')).resolves.toBe('write')
  })
})
