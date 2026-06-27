/**
 * runAdapterConformance — the executable "use xNet from any framework" contract.
 *
 * Exploration 0237 argues that the costly part of multi-framework support is not
 * *writing* a Vue/Svelte/Solid binding (each is ~40 lines over {@link liveQuery})
 * but *validating* that every binding behaves identically forever. The answer is
 * to test the behaviour **once**, framework-agnostically, and have each adapter
 * run only a tiny render-harness check on top.
 *
 * This is that once. Given a `makeClient` factory, it asserts the reactive data
 * contract every adapter depends on:
 *
 *   1. live query delivers an immediate snapshot, then updates on `mutate`
 *   2. unsubscribing stops delivery
 *   3. one-shot `fetch` round-trips a write
 *   4. the authorization surface is reachable and **denial surfaces**
 *   5. `destroy()` is idempotent
 *
 * It imports no test framework and no UI framework, so it runs in vitest, a
 * browser test runner, or a plain Node script. It **throws** on the first failed
 * check (with the full check list attached) and otherwise resolves with the
 * result — so `await runAdapterConformance(makeClient)` *is* the assertion.
 */
import type { CreateXNetClientOptions, XNetClient } from './client'
import type { AuthCheckInput, AuthDecision, PolicyEvaluator } from '@xnetjs/core'
import { defineSchema, text } from '@xnetjs/data'
import { liveQuery } from './live-query'

/** The schema the conformance run reads and writes. Self-contained, unique ns. */
const ConformanceSchema = defineSchema({
  name: 'ConformanceItem',
  namespace: 'xnet://adapter-conformance/',
  properties: { label: text({ required: true }) }
})

/**
 * Factory for the client under test. Accepts the same overrides
 * {@link CreateXNetClientOptions} so the suite can, for example, inject a
 * deny-writes evaluator for the authorization check. Adapter authors typically
 * pass a one-liner that spreads `overrides` into `createXNetClient`.
 */
export type ConformanceClientFactory = (
  overrides?: Partial<CreateXNetClientOptions>
) => Promise<XNetClient>

/** Outcome of a single contract check. */
export interface AdapterConformanceCheck {
  name: string
  passed: boolean
  detail?: string
}

/** Aggregate result of a conformance run. */
export interface AdapterConformanceResult {
  passed: boolean
  checks: AdapterConformanceCheck[]
}

/** Thrown when one or more checks fail; carries the full check list. */
export class AdapterConformanceError extends Error {
  readonly checks: AdapterConformanceCheck[]
  constructor(checks: AdapterConformanceCheck[]) {
    const failed = checks.filter((c) => !c.passed).map((c) => `${c.name}: ${c.detail ?? 'failed'}`)
    super(`adapter conformance failed:\n  ${failed.join('\n  ')}`)
    this.name = 'AdapterConformanceError'
    this.checks = checks
  }
}

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

/** A PolicyEvaluator that allows reads and denies everything else. */
function denyWrites(): PolicyEvaluator {
  const decide = async (input: AuthCheckInput): Promise<AuthDecision> => ({
    allowed: input.action === 'read',
    action: input.action,
    subject: input.subject,
    resource: input.nodeId,
    roles: [],
    grants: [],
    reasons: [],
    cached: false,
    evaluatedAt: 0,
    duration: 0
  })
  return {
    can: decide,
    explain: async () => {
      throw new Error('conformance: explain() is not exercised')
    },
    invalidate: () => {},
    invalidateSubject: () => {}
  }
}

/** Run `body` against a fresh client and always destroy it. */
async function withClient(
  makeClient: ConformanceClientFactory,
  overrides: Partial<CreateXNetClientOptions> | undefined,
  body: (client: XNetClient) => Promise<void>
): Promise<void> {
  const client = await makeClient(overrides)
  try {
    await body(client)
  } finally {
    await client.destroy()
  }
}

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message)
}

interface Check {
  name: string
  run: (makeClient: ConformanceClientFactory) => Promise<void>
}

const CHECKS: Check[] = [
  {
    name: 'live-query:immediate-and-update',
    run: (makeClient) =>
      withClient(makeClient, undefined, async (client) => {
        const items = liveQuery(client, ConformanceSchema)
        const seen: (number | null)[] = []
        const unsubscribe = items.subscribe((rows) => seen.push(rows === null ? null : rows.length))
        assert(seen.length >= 1, 'subscribe did not deliver an immediate snapshot')

        await client.mutate.create(ConformanceSchema, { label: 'alpha' })
        await tick()
        assert(seen.at(-1) === 1, `expected 1 row after create, saw ${String(seen.at(-1))}`)
        assert(items.get()?.length === 1, 'get() did not reflect the write')

        unsubscribe()
        items.destroy()
      })
  },
  {
    name: 'live-query:stops-after-unsubscribe',
    run: (makeClient) =>
      withClient(makeClient, undefined, async (client) => {
        const items = liveQuery(client, ConformanceSchema)
        let calls = 0
        const unsubscribe = items.subscribe(() => {
          calls += 1
        })
        const afterSubscribe = calls
        unsubscribe()

        await client.mutate.create(ConformanceSchema, { label: 'ignored' })
        await tick()
        assert(calls === afterSubscribe, 'subscriber was notified after unsubscribe')
        items.destroy()
      })
  },
  {
    name: 'mutate:round-trips-via-fetch',
    run: (makeClient) =>
      withClient(makeClient, undefined, async (client) => {
        await client.mutate.create(ConformanceSchema, { label: 'beta' })
        const rows = await client.fetch(ConformanceSchema)
        assert(rows.length === 1, `expected 1 fetched row, saw ${rows.length}`)
        assert(rows[0].properties.label === 'beta', 'fetched row lost its properties')
      })
  },
  {
    name: 'auth:permissive-by-default',
    run: (makeClient) =>
      withClient(makeClient, undefined, async (client) => {
        const decision = await client.can({
          subject: client.authorDID,
          action: 'write',
          nodeId: 'conformance-node'
        })
        assert(typeof decision.allowed === 'boolean', 'can() did not return an AuthDecision')
        assert(decision.allowed === true, 'default client was not permissive')
      })
  },
  {
    name: 'auth:denial-surfaces',
    run: (makeClient) =>
      withClient(makeClient, { authEvaluator: denyWrites() }, async (client) => {
        const write = await client.can({
          subject: client.authorDID,
          action: 'write',
          nodeId: 'conformance-node'
        })
        const read = await client.can({
          subject: client.authorDID,
          action: 'read',
          nodeId: 'conformance-node'
        })
        assert(write.allowed === false, 'denied write was reported as allowed')
        assert(read.allowed === true, 'allowed read was reported as denied')
      })
  },
  {
    name: 'lifecycle:destroy-is-idempotent',
    run: async (makeClient) => {
      const client = await makeClient()
      await client.destroy()
      await client.destroy()
      assert(client.runtimeStatus.phase === 'destroyed', 'phase was not destroyed after destroy()')
    }
  }
]

/**
 * Run the full adapter-conformance suite against a client factory.
 *
 * Resolves with the {@link AdapterConformanceResult} when every check passes,
 * and throws {@link AdapterConformanceError} (with the full check list) on the
 * first failure — so the call itself is the assertion.
 *
 * @example
 * ```ts
 * import { runAdapterConformance } from '@xnetjs/runtime'
 * import { MemoryNodeStorageAdapter } from '@xnetjs/data'
 *
 * await runAdapterConformance((overrides) =>
 *   createXNetClient({
 *     nodeStorage: new MemoryNodeStorageAdapter(),
 *     authorDID,
 *     signingKey,
 *     ...overrides
 *   })
 * )
 * ```
 */
export async function runAdapterConformance(
  makeClient: ConformanceClientFactory
): Promise<AdapterConformanceResult> {
  const checks: AdapterConformanceCheck[] = []
  for (const check of CHECKS) {
    try {
      await check.run(makeClient)
      checks.push({ name: check.name, passed: true })
    } catch (error) {
      checks.push({
        name: check.name,
        passed: false,
        detail: error instanceof Error ? error.message : String(error)
      })
    }
  }
  const passed = checks.every((c) => c.passed)
  if (!passed) throw new AdapterConformanceError(checks)
  return { passed, checks }
}
