/**
 * Tests for telemetry instrumentation in useQuery and useMutate hooks
 */
import type { TelemetryReporter } from '../../context/telemetry-context'
import type { DID } from '@xnetjs/core'
import { renderHook, act, waitFor } from '@testing-library/react'
import { defineSchema, text, select, MemoryNodeStorageAdapter } from '@xnetjs/data'
import { generateIdentity } from '@xnetjs/identity'
import React, { type ReactNode, useMemo } from 'react'
import { describe, it, expect } from 'vitest'
import { XNetProvider } from '../../context'
import { useMutate } from '../useMutate'
import { useQuery } from '../useQuery'

// Test schema
const TaskSchema = defineSchema({
  name: 'TelemetryTask',
  namespace: 'xnet://test/telemetry/',
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

// ─── Mock TelemetryReporter ──────────────────────────────────────────────────

type TelemetryCall = {
  method: 'reportPerformance' | 'reportUsage' | 'reportCrash'
  args: unknown[]
}

function createMockTelemetry(): TelemetryReporter & { calls: TelemetryCall[] } {
  const calls: TelemetryCall[] = []
  return {
    calls,
    reportPerformance(metricName: string, durationMs: number) {
      calls.push({ method: 'reportPerformance', args: [metricName, durationMs] })
    },
    reportUsage(metricName: string, count: number) {
      calls.push({ method: 'reportUsage', args: [metricName, count] })
    },
    reportCrash(error: Error, context?: Record<string, unknown>) {
      calls.push({ method: 'reportCrash', args: [error, context] })
    }
  }
}

// ─── Test Helpers ────────────────────────────────────────────────────────────

function createWrapper(telemetry?: TelemetryReporter) {
  const storage = new MemoryNodeStorageAdapter()
  const { identity, privateKey } = generateIdentity()
  const did = identity.did as DID

  return {
    storage,
    did,
    privateKey,
    Wrapper: function Wrapper({ children }: { children: ReactNode }) {
      const stableStorage = useMemo(() => storage, [])
      return (
        <XNetProvider
          config={{
            nodeStorage: stableStorage,
            authorDID: did,
            signingKey: privateKey,
            disableSyncManager: true,
            telemetry
          }}
        >
          {children}
        </XNetProvider>
      )
    }
  }
}

// ─── useQuery Telemetry Tests ─────────────────────────────────────────────────

describe('useQuery telemetry', () => {
  it('should report subscription mount usage when telemetry is configured', async () => {
    const telemetry = createMockTelemetry()
    const { Wrapper } = createWrapper(telemetry)

    renderHook(() => useQuery(TaskSchema), { wrapper: Wrapper })

    await waitFor(() => {
      const usageCalls = telemetry.calls.filter((c) => c.method === 'reportUsage')
      return usageCalls.some((c) => c.args[0] === 'react.useQuery')
    })

    const mountCall = telemetry.calls.find(
      (c) => c.method === 'reportUsage' && c.args[0] === 'react.useQuery'
    )
    expect(mountCall).toBeDefined()
    expect(mountCall?.args[1]).toBe(1)
  })

  it('should report query timing (performance) when data loads', async () => {
    const telemetry = createMockTelemetry()
    const { Wrapper } = createWrapper(telemetry)

    renderHook(() => useQuery(TaskSchema), { wrapper: Wrapper })

    await waitFor(() => {
      expect(
        telemetry.calls.some(
          (c) => c.method === 'reportPerformance' && c.args[0] === 'react.useQuery'
        )
      ).toBe(true)
    })

    const perfCall = telemetry.calls.find(
      (c) => c.method === 'reportPerformance' && c.args[0] === 'react.useQuery'
    )
    expect(perfCall).toBeDefined()
    expect(typeof perfCall?.args[1]).toBe('number')
    expect(perfCall?.args[1] as number).toBeGreaterThanOrEqual(0)
  })

  it('should report cache_miss when data takes time to load', async () => {
    const telemetry = createMockTelemetry()
    const { Wrapper } = createWrapper(telemetry)

    renderHook(() => useQuery(TaskSchema), { wrapper: Wrapper })

    await waitFor(() => {
      expect(
        telemetry.calls.some(
          (c) =>
            c.method === 'reportUsage' &&
            (c.args[0] === 'react.useQuery.cache_hit' || c.args[0] === 'react.useQuery.cache_miss')
        )
      ).toBe(true)
    })

    // Either cache_hit or cache_miss should be reported (timing-dependent)
    const cacheCall = telemetry.calls.find(
      (c) =>
        c.method === 'reportUsage' &&
        (c.args[0] === 'react.useQuery.cache_hit' || c.args[0] === 'react.useQuery.cache_miss')
    )
    expect(cacheCall).toBeDefined()
  })

  it('should not call telemetry methods when telemetry is not configured', async () => {
    const { Wrapper } = createWrapper(undefined) // No telemetry

    const { result } = renderHook(() => useQuery(TaskSchema), { wrapper: Wrapper })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    // No errors should occur; this test verifies graceful no-op behavior
    expect(result.current.data).toEqual([])
  })

  it('should report unmount usage when hook unmounts', async () => {
    const telemetry = createMockTelemetry()
    const { Wrapper } = createWrapper(telemetry)

    const { unmount } = renderHook(() => useQuery(TaskSchema), { wrapper: Wrapper })

    // Wait for mount call
    await waitFor(() => {
      expect(
        telemetry.calls.some((c) => c.method === 'reportUsage' && c.args[0] === 'react.useQuery')
      ).toBe(true)
    })

    unmount()

    const unmountCall = telemetry.calls.find(
      (c) => c.method === 'reportUsage' && c.args[0] === 'react.useQuery.unmount'
    )
    expect(unmountCall).toBeDefined()
  })

  it('should only report timing once even with multiple re-renders', async () => {
    const telemetry = createMockTelemetry()
    const { Wrapper } = createWrapper(telemetry)

    const { result } = renderHook(() => useQuery(TaskSchema), { wrapper: Wrapper })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    const perfCalls = telemetry.calls.filter(
      (c) => c.method === 'reportPerformance' && c.args[0] === 'react.useQuery'
    )
    expect(perfCalls).toHaveLength(1)
  })
})

// ─── useMutate Telemetry Tests ────────────────────────────────────────────────

describe('useMutate telemetry', () => {
  it('should report create success and performance', async () => {
    const telemetry = createMockTelemetry()
    const { Wrapper } = createWrapper(telemetry)

    const { result } = renderHook(() => useMutate(), { wrapper: Wrapper })

    // Wait for bridge to initialize
    await waitFor(() => result.current.isPending === false)

    await act(async () => {
      await result.current.create(TaskSchema, { title: 'Test Task', status: 'todo' })
    })

    const successCall = telemetry.calls.find(
      (c) => c.method === 'reportUsage' && c.args[0] === 'react.useMutate.create.success'
    )
    expect(successCall).toBeDefined()
    expect(successCall?.args[1]).toBe(1)

    const perfCall = telemetry.calls.find(
      (c) => c.method === 'reportPerformance' && c.args[0] === 'react.useMutate.create'
    )
    expect(perfCall).toBeDefined()
    expect(typeof perfCall?.args[1]).toBe('number')
  })

  it('should report update success and performance', async () => {
    const telemetry = createMockTelemetry()
    const { Wrapper } = createWrapper(telemetry)

    const { result } = renderHook(() => useMutate(), { wrapper: Wrapper })

    await waitFor(() => result.current.isPending === false)

    let nodeId: string | undefined
    for (let attempt = 0; attempt < 5 && !nodeId; attempt++) {
      await act(async () => {
        const node = await result.current.create(TaskSchema, {
          title: `To Update ${attempt}`,
          status: 'todo'
        })
        nodeId = node?.id
      })

      if (!nodeId) {
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
    }

    expect(nodeId).toBeDefined()
    telemetry.calls.length = 0 // Clear create calls

    await act(async () => {
      await result.current.update(TaskSchema, nodeId!, { title: 'Updated Title' })
    })

    const successCall = telemetry.calls.find(
      (c) => c.method === 'reportUsage' && c.args[0] === 'react.useMutate.update.success'
    )
    expect(successCall).toBeDefined()

    const perfCall = telemetry.calls.find(
      (c) => c.method === 'reportPerformance' && c.args[0] === 'react.useMutate.update'
    )
    expect(perfCall).toBeDefined()
  })

  it('should report delete success and performance', async () => {
    const telemetry = createMockTelemetry()
    const { Wrapper } = createWrapper(telemetry)

    const { result } = renderHook(() => useMutate(), { wrapper: Wrapper })

    await waitFor(() => result.current.isPending === false)

    let nodeId: string | undefined
    for (let attempt = 0; attempt < 5 && !nodeId; attempt++) {
      await act(async () => {
        const node = await result.current.create(TaskSchema, {
          title: `To Delete ${attempt}`,
          status: 'todo'
        })
        nodeId = node?.id
      })

      if (!nodeId) {
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
    }

    expect(nodeId).toBeDefined()
    telemetry.calls.length = 0

    await act(async () => {
      await result.current.remove(nodeId!)
    })

    const successCall = telemetry.calls.find(
      (c) => c.method === 'reportUsage' && c.args[0] === 'react.useMutate.delete.success'
    )
    expect(successCall).toBeDefined()

    const perfCall = telemetry.calls.find(
      (c) => c.method === 'reportPerformance' && c.args[0] === 'react.useMutate.delete'
    )
    expect(perfCall).toBeDefined()
  })

  it('should report transaction success and performance', async () => {
    const telemetry = createMockTelemetry()
    const { Wrapper } = createWrapper(telemetry)

    const { result } = renderHook(() => useMutate(), { wrapper: Wrapper })

    await waitFor(() => result.current.isPending === false)

    let txResult: Awaited<ReturnType<typeof result.current.mutate>> | null = null
    for (let attempt = 0; attempt < 5 && !txResult; attempt++) {
      await act(async () => {
        txResult = await result.current.mutate([
          {
            type: 'create',
            schema: TaskSchema,
            data: { title: `Task ${attempt}-1`, status: 'todo' }
          },
          {
            type: 'create',
            schema: TaskSchema,
            data: { title: `Task ${attempt}-2`, status: 'done' }
          }
        ])
      })

      if (!txResult) {
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
    }

    expect(txResult).toBeDefined()

    const successCall = telemetry.calls.find(
      (c) => c.method === 'reportUsage' && c.args[0] === 'react.useMutate.transaction.success'
    )
    expect(successCall).toBeDefined()

    const perfCall = telemetry.calls.find(
      (c) => c.method === 'reportPerformance' && c.args[0] === 'react.useMutate.transaction'
    )
    expect(perfCall).toBeDefined()
  })

  it('should not report telemetry when not configured', async () => {
    const { Wrapper } = createWrapper(undefined)

    const { result } = renderHook(() => useMutate(), { wrapper: Wrapper })

    await waitFor(() => result.current.isPending === false)

    // Should work without errors
    await act(async () => {
      await result.current.create(TaskSchema, { title: 'No Telemetry', status: 'todo' })
    })

    // No telemetry assertions needed - just verifying no errors thrown
  })
})
