/**
 * Tests for tracing instrumentation in useQuery and useMutate hooks
 * (exploration 0190). Uses a local mock TracingReporter (NOT the real
 * @xnetjs/telemetry TraceCollector) so @xnetjs/react keeps zero dependency on
 * @xnetjs/telemetry — the duck-typed context is exactly what we're verifying.
 */
import type { DID } from '@xnetjs/core'
import { defineSchema, text, select, MemoryNodeStorageAdapter } from '@xnetjs/data'
import { generateIdentity } from '@xnetjs/identity'
import { renderHook, act, waitFor } from '@testing-library/react'
import React, { type ReactNode, useMemo } from 'react'
import { describe, it, expect } from 'vitest'
import { XNetProvider } from '../../context'
import type {
  TracingReporter,
  TracingHandle,
  TracingSpanInput,
  TracingRootKind
} from '../../context/tracing-context'
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

// ─── Mock TracingReporter ────────────────────────────────────────────────────
// A minimal duck-typed reporter that records completed traces, mirroring the
// shape @xnetjs/telemetry's TraceCollector exposes (startTrace → handle).

interface RecordedSpan {
  name: string
  attributes?: Record<string, string | number | boolean | undefined>
}
interface RecordedTrace {
  rootKind: TracingRootKind
  rootName: string
  spans: RecordedSpan[]
}

function createMockTracing(): TracingReporter & { traces: RecordedTrace[] } {
  const traces: RecordedTrace[] = []
  return {
    traces,
    startTrace(rootKind: TracingRootKind, rootName: string): TracingHandle {
      const trace: RecordedTrace = { rootKind, rootName, spans: [] }
      let ended = false
      const handle: TracingHandle = {
        traceId: `mock-${traces.length}`,
        active: true,
        mark(name: string) {
          return (attributes) => {
            trace.spans.push({ name, attributes })
            return name
          }
        },
        addSpan(span: TracingSpanInput) {
          trace.spans.push({ name: span.name, attributes: span.attributes })
          return span.name
        },
        end() {
          if (ended) return
          ended = true
          traces.push(trace)
        }
      }
      return handle
    }
  }
}

function createWrapper(tracing?: TracingReporter) {
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
    const tracing = createMockTracing()
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

    const mutateTrace = tracing.traces.find((t) => t.rootName === 'mutate:create')
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
    const tracing = createMockTracing()
    const { Wrapper } = createWrapper(tracing)
    const { result } = renderHook(() => useQuery(TaskSchema), { wrapper: Wrapper })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
    await waitFor(() => {
      expect(tracing.traces.some((t) => t.rootKind === 'query')).toBe(true)
    })

    const queryTrace = tracing.traces.find((t) => t.rootKind === 'query')
    expect(queryTrace).toBeDefined()
    const commit = queryTrace!.spans.find((s) => s.name === 'data.query.commit')
    expect(commit).toBeDefined()
    expect(typeof commit!.attributes?.returnedRows).toBe('number')
  })
})
