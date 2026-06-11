/**
 * 10k-task query-path benchmark through the bridge (exploration 0161:
 * "Benchmark 10k-task board/list rendering through DataBridge").
 *
 * Seeds 10,000 Task nodes with one deterministic-import bulk write, then
 * measures a full useTasks load (query + flatten + sort). The in-memory
 * adapter approximates the local SQLite read path; the budget is generous
 * for CI variance — the point is catching order-of-magnitude regressions.
 */
import type { DID } from '@xnetjs/core'
import { renderHook, act, waitFor } from '@testing-library/react'
import { MemoryNodeStorageAdapter, TaskSchema } from '@xnetjs/data'
import { generateIdentity, type Identity } from '@xnetjs/identity'
import React, { type ReactNode, useMemo } from 'react'
import { describe, expect, it, beforeEach } from 'vitest'
import { XNetProvider } from '../context'
import { useMutate } from './useMutate'
import { useTasks } from './useTasks'

const TASK_COUNT = 10_000
const STATUSES = ['triage', 'backlog', 'todo', 'in-progress', 'in-review', 'done', 'cancelled']

describe('useTasks at 10k tasks', () => {
  let identityResult: { identity: Identity; privateKey: Uint8Array }
  let did: DID
  let storage: MemoryNodeStorageAdapter

  beforeEach(() => {
    identityResult = generateIdentity()
    did = identityResult.identity.did as DID
    storage = new MemoryNodeStorageAdapter()
  })

  function createWrapper() {
    const currentStorage = storage
    const currentDid = did
    const currentKey = identityResult.privateKey

    return function Wrapper({ children }: { children: ReactNode }) {
      const stableStorage = useMemo(() => currentStorage, [])

      return (
        <XNetProvider
          config={{
            nodeStorage: stableStorage,
            authorDID: currentDid,
            signingKey: currentKey,
            disableSyncManager: true
          }}
        >
          {children}
        </XNetProvider>
      )
    }
  }

  it('bulk-seeds and loads 10k tasks within budget', async () => {
    const wrapper = createWrapper()

    const { result } = renderHook(
      () => ({
        mutate: useMutate(),
        tasks: useTasks({ includeCompleted: true })
      }),
      { wrapper }
    )

    await waitFor(() => {
      expect(result.current.tasks.loading).toBe(false)
    })

    const drafts = Array.from({ length: TASK_COUNT }, (_, index) => ({
      id: `perf_task_${index}`,
      schemaId: TaskSchema._schemaId,
      properties: {
        title: `Perf task ${index}`,
        completed: index % 5 === 0,
        status: STATUSES[index % STATUSES.length],
        sortKey: String(index).padStart(6, '0'),
        source: 'api'
      }
    }))

    const seedStart = performance.now()
    await act(async () => {
      await result.current.mutate.bulk({
        kind: 'deterministic-import',
        drafts,
        policy: { notificationMode: 'batch' }
      })
    })
    const seedMs = performance.now() - seedStart

    const loadStart = performance.now()
    await act(async () => {
      await result.current.tasks.reload()
    })
    await waitFor(() => {
      expect(result.current.tasks.data).toHaveLength(TASK_COUNT)
    })
    const loadMs = performance.now() - loadStart

    console.info(
      `[perf] bulk seed ${TASK_COUNT}: ${seedMs.toFixed(0)}ms; useTasks load: ${loadMs.toFixed(0)}ms`
    )

    // Generous CI budget — catches order-of-magnitude regressions, not
    // browser frame budgets (those are validated against SQLite/OPFS).
    expect(loadMs).toBeLessThan(5000)
  }, 120_000)
})
