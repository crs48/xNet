/**
 * Dashboard runtime integration tests over the real reactive stack
 * (XNetProvider + memory storage + DataBridge):
 *
 * - a live widget query updates when a node is created elsewhere
 * - the dashboard time-range variable re-queries bound widgets
 * - metric aggregates execute through the widget data path
 */

import type { WidgetDataRequest } from '../types'
import type { DID } from '@xnetjs/core'
import type { DashboardVariablesState, SavedViewDescriptor } from '@xnetjs/data'
import { act, renderHook, waitFor } from '@testing-library/react'
import { MemoryNodeStorageAdapter, TaskSchema } from '@xnetjs/data'
import { generateIdentity } from '@xnetjs/identity'
import { XNetProvider, useMutate, type SavedViewSchemaRegistry } from '@xnetjs/react'
import { useMemo, useState, type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { DashboardRuntimeProvider } from '../runtime/context'
import { useWidgetData } from '../runtime/useWidgetData'

const SCHEMAS = [TaskSchema] as unknown as SavedViewSchemaRegistry

function taskListDescriptor(): SavedViewDescriptor {
  return {
    version: 1,
    title: 'Tasks',
    query: {
      version: 1,
      kind: 'node',
      schemaId: TaskSchema._schemaId,
      orderBy: [{ field: 'title', direction: 'asc' }]
    }
  }
}

function metricDescriptor(): SavedViewDescriptor {
  return {
    version: 1,
    title: 'Task count',
    query: {
      version: 1,
      kind: 'node',
      schemaId: TaskSchema._schemaId,
      aggregates: [{ kind: 'aggregate', alias: 'value', function: 'count' }]
    }
  }
}

function createHarness(initialVariables?: DashboardVariablesState) {
  const identity = generateIdentity()
  const storage = new MemoryNodeStorageAdapter()
  let setVariablesExternal: (next: DashboardVariablesState | undefined) => void = () => {}

  function Wrapper({ children }: { children: ReactNode }) {
    const stableStorage = useMemo(() => storage, [])
    const [variables, setVariables] = useState<DashboardVariablesState | undefined>(
      initialVariables
    )
    setVariablesExternal = setVariables

    return (
      <XNetProvider
        config={{
          nodeStorage: stableStorage,
          authorDID: identity.identity.did as DID,
          signingKey: identity.privateKey
        }}
      >
        <DashboardRuntimeProvider schemas={SCHEMAS} variables={variables}>
          {children}
        </DashboardRuntimeProvider>
      </XNetProvider>
    )
  }

  return {
    Wrapper,
    setVariables: (next: DashboardVariablesState | undefined) => setVariablesExternal(next)
  }
}

function useWidgetHarness(request: WidgetDataRequest) {
  const widget = useWidgetData(request)
  const { create } = useMutate()
  return { widget, create }
}

describe('dashboard runtime', () => {
  it('updates a live widget when a task is created elsewhere', async () => {
    const { Wrapper } = createHarness()
    const request: WidgetDataRequest = { descriptor: taskListDescriptor(), refresh: 'live' }

    const { result } = renderHook(() => useWidgetHarness(request), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.widget.data.loading).toBe(false))
    expect(result.current.widget.data.rows).toHaveLength(0)

    await act(async () => {
      await result.current.create(TaskSchema, { title: 'Reactive task' })
    })

    await waitFor(() => expect(result.current.widget.data.rows).toHaveLength(1))
    expect(result.current.widget.data.rows[0]?.title).toBe('Reactive task')
  })

  it('re-queries bound widgets when the time-range variable changes', async () => {
    const now = Date.now()
    const { Wrapper, setVariables } = createHarness({
      timeRange: { kind: 'absolute', start: now - 1000, end: now + 60_000 }
    })
    const request: WidgetDataRequest = {
      descriptor: taskListDescriptor(),
      refresh: 'live',
      timeField: 'createdAt'
    }

    const { result } = renderHook(() => useWidgetHarness(request), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.widget.data.loading).toBe(false))

    await act(async () => {
      await result.current.create(TaskSchema, { title: 'In range' })
    })

    await waitFor(() => expect(result.current.widget.data.rows).toHaveLength(1))
    expect(result.current.widget.variables['timeRange.start']).toBe(now - 1000)

    // Move the window into the past: the created task falls outside it.
    act(() => {
      setVariables({ timeRange: { kind: 'absolute', start: now - 60_000, end: now - 30_000 } })
    })

    await waitFor(() => expect(result.current.widget.data.rows).toHaveLength(0))

    // And back to an open window: the task reappears.
    act(() => {
      setVariables(undefined)
    })

    await waitFor(() => expect(result.current.widget.data.rows).toHaveLength(1))
  })

  it('executes metric aggregates through the widget data path', async () => {
    const { Wrapper } = createHarness()
    const request: WidgetDataRequest = { descriptor: metricDescriptor(), refresh: 'live' }

    const { result } = renderHook(() => useWidgetHarness(request), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.widget.data.loading).toBe(false))

    await act(async () => {
      await result.current.create(TaskSchema, { title: 'One' })
      await result.current.create(TaskSchema, { title: 'Two' })
    })

    await waitFor(() => {
      expect(result.current.widget.data.aggregates?.results.value?.value).toBe(2)
    })
  })
})
