/**
 * Tests for tracing instrumentation in useQuery and useMutate hooks
 * (exploration 0190). Uses the real @xnetjs/telemetry TraceCollector to verify
 * the duck-typed TracingReporter contract holds end to end.
 */
import type { DID } from '@xnetjs/core'
import { defineSchema, text, select, MemoryNodeStorageAdapter } from '@xnetjs/data'
import { generateIdentity } from '@xnetjs/identity'
import { TraceCollector, type Trace } from '@xnetjs/telemetry'
import { renderHook, act, waitFor } from '@testing-library/react'
import React, { type ReactNode, useMemo } from 'react'
import { describe, it, expect } from 'vitest'
import { XNetProvider } from '../../context'
import { useMutate } from '../useMutate'
import { useQuery } from '../useQuery'

const TaskSchema = defineSchema({
  name: 'TracingTask',
  namespace: 'xnet://test/tracing/',
  properties: {
    title: text({ required: true }),
    status: select({
      options: [
        { id: 'todo', name: 'To Do' },
        { id: 'done', name: 'Done' }
      ] as const
    })
  }
})

function createWrapper(tracing?: TraceCollector) {
  const storage = new MemoryNodeStorageAdapter()
  const { identity, privateKey } = generateIdentity()
  const did = identity.did as DID

  return {
    Wrapper: function Wrapper({ children }: { children: ReactNode }) {
      const stableStorage = useMemo(() => storage, [])
      return (
        <XNetProvider
          config={{
            nodeStorage: stableStorage,
            authorDID: did,
            signingKey: privateKey,
            disableSyncManager: true,
            tracing
          }}
        >
          {children}
        </XNetProvider>
      )
    }
  }
}

describe('useMutate tracing', () => {
  it('records a mutate trace with a bridge span', async () => {
    const tracing = new TraceCollector({ sampleRate: 1 })
    const { Wrapper } = createWrapper(tracing)
    const { result } = renderHook(() => useMutate(), { wrapper: Wrapper })

    let nodeId: string | undefined
    for (let attempt = 0; attempt < 5 && !nodeId; attempt++) {
      await act(async () => {
        const node = await result.current.create(TaskSchema, {
          title: `Task ${attempt}`,
          status: 'todo'
        })
        nodeId = node?.id
      })
      if (!nodeId) await new Promise((r) => setTimeout(r, 10))
    }
    expect(nodeId).toBeDefined()

    const traces = tracing.recent()
    const mutateTrace = traces.find((t: Trace) => t.rootName === 'mutate:create')
    expect(mutateTrace).toBeDefined()
    expect(mutateTrace!.rootKind).toBe('mutate')
    expect(mutateTrace!.spans.some((s) => s.name === 'data.mutate.bridge')).toBe(true)
  })

  it('does not throw when no tracing reporter is configured', async () => {
    const { Wrapper } = createWrapper(undefined)
    const { result } = renderHook(() => useMutate(), { wrapper: Wrapper })
    await act(async () => {
      await result.current.create(TaskSchema, { title: 'No tracing', status: 'todo' })
    })
  })
})

describe('useQuery tracing', () => {
  it('records a query trace with a commit span and row count', async () => {
    const tracing = new TraceCollector({ sampleRate: 1 })
    const { Wrapper } = createWrapper(tracing)
    const { result } = renderHook(() => useQuery(TaskSchema), { wrapper: Wrapper })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
    await waitFor(() => {
      expect(tracing.recent().some((t) => t.rootKind === 'query')).toBe(true)
    })

    const queryTrace = tracing.recent().find((t) => t.rootKind === 'query')
    expect(queryTrace).toBeDefined()
    const commit = queryTrace!.spans.find((s) => s.name === 'data.query.commit')
    expect(commit).toBeDefined()
    expect(typeof commit!.attributes?.returnedRows).toBe('number')
  })
})
