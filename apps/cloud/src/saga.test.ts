import { describe, expect, it } from 'vitest'
import { SagaFailure, saga, sagaStep } from './saga'

/** Records the order effects happen in, so unwinding order is assertable. */
function tracer() {
  const log: string[] = []
  return {
    log,
    step: (name: string, opts: { fail?: boolean; compensateFails?: boolean } = {}) =>
      sagaStep<string>({
        name,
        run: async () => {
          if (opts.fail) throw new Error(`${name} exploded`)
          log.push(`run:${name}`)
          return name
        },
        compensate: async (result) => {
          if (opts.compensateFails) throw new Error(`undo ${name} exploded`)
          log.push(`undo:${result}`)
        }
      })
  }
}

describe('saga', () => {
  it('runs every step in order and compensates nothing on success', async () => {
    const t = tracer()
    await saga([t.step('a'), t.step('b'), t.step('c')])
    expect(t.log).toEqual(['run:a', 'run:b', 'run:c'])
  })

  it('unwinds completed steps in reverse when a later step throws', async () => {
    const t = tracer()
    await expect(saga([t.step('a'), t.step('b'), t.step('c', { fail: true })])).rejects.toThrow(
      SagaFailure
    )
    // c never ran, so only b then a are undone — newest first.
    expect(t.log).toEqual(['run:a', 'run:b', 'undo:b', 'undo:a'])
  })

  it('does not compensate the step that failed', async () => {
    const t = tracer()
    await expect(saga([t.step('a'), t.step('b', { fail: true })])).rejects.toThrow(SagaFailure)
    expect(t.log).not.toContain('undo:b')
  })

  it('carries the original cause and the failing step name', async () => {
    const t = tracer()
    const err = await saga([t.step('a'), t.step('provision-hub', { fail: true })]).catch(
      (e: unknown) => e
    )
    expect(err).toBeInstanceOf(SagaFailure)
    const failure = err as SagaFailure
    expect(failure.step).toBe('provision-hub')
    expect((failure.cause as Error).message).toBe('provision-hub exploded')
    expect(failure.leakedResources).toBe(false)
    expect(failure.message).toContain('rolled back cleanly')
  })

  it('leads with the cause message so callers can still match on it', async () => {
    // The HTTP routes surface `err.message` straight to the client, so wrapping
    // must not hide what actually went wrong.
    const err = await saga([
      sagaStep<void>({
        name: 'bind-identities',
        run: async () => {
          throw new Error('DID challenge failed; refusing to bind')
        }
      })
    ]).catch((e: unknown) => e)

    expect((err as SagaFailure).message).toMatch(/^DID challenge failed; refusing to bind/)
    expect((err as SagaFailure).message).toContain('saga step "bind-identities"')
  })

  it('stringifies a non-Error thrown value', async () => {
    const err = await saga([
      sagaStep<void>({
        name: 'weird',
        run: async () => {
          throw 'just a string'
        }
      })
    ]).catch((e: unknown) => e)

    expect((err as SagaFailure).message).toContain('just a string')
  })

  it('reports a failed compensation rather than swallowing it', async () => {
    const t = tracer()
    const err = await saga([
      t.step('a'),
      t.step('b', { compensateFails: true }),
      t.step('c', { fail: true })
    ]).catch((e: unknown) => e)

    const failure = err as SagaFailure
    expect(failure.compensationFailures.map((f) => f.step)).toEqual(['b'])
    expect(failure.leakedResources).toBe(true)
    expect(failure.message).toContain('compensation(s) ALSO FAILED')
  })

  it('keeps unwinding past a failed compensation', async () => {
    const t = tracer()
    await saga([
      t.step('a'),
      t.step('b', { compensateFails: true }),
      t.step('c', { fail: true })
    ]).catch(() => undefined)
    // b's undo threw, but a's still ran — one un-undoable step must not strand
    // the steps beneath it.
    expect(t.log).toContain('undo:a')
  })

  it('treats a step without compensate as nothing to undo', async () => {
    const log: string[] = []
    const err = await saga([
      sagaStep<void>({
        name: 'idempotent-bind',
        run: async () => {
          log.push('bound')
        }
      }),
      sagaStep<void>({
        name: 'boom',
        run: async () => {
          throw new Error('nope')
        }
      })
    ]).catch((e: unknown) => e)

    expect(log).toEqual(['bound'])
    expect((err as SagaFailure).compensationFailures).toEqual([])
    expect((err as SagaFailure).leakedResources).toBe(false)
  })

  it('propagates the first failure when the very first step throws', async () => {
    const err = await saga([
      sagaStep<void>({
        name: 'first',
        run: async () => {
          throw new Error('immediate')
        }
      })
    ]).catch((e: unknown) => e)

    expect((err as SagaFailure).step).toBe('first')
    expect((err as SagaFailure).compensationFailures).toEqual([])
  })
})
