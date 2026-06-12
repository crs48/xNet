/**
 * DashboardSurface component flow over the real in-memory stack: create the
 * dashboard node, add a widget through the picker, edit it through the
 * config panel, change the time-range variable, and remove it again. Also
 * exercises the gridstack host (with a stubbed ResizeObserver) and the
 * user-widget editor entry point.
 */

import type { DID } from '@xnetjs/core'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DashboardSchema, MemoryNodeStorageAdapter, TaskSchema } from '@xnetjs/data'
import { generateIdentity } from '@xnetjs/identity'
import { XNetProvider, useMutate, useQuery, type SavedViewSchemaRegistry } from '@xnetjs/react'
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { beforeAll, describe, expect, it } from 'vitest'
import { DashboardSurface } from '../components/DashboardSurface'

const SCHEMAS = [TaskSchema, DashboardSchema] as unknown as SavedViewSchemaRegistry

beforeAll(() => {
  // gridstack requires ResizeObserver; jsdom has none.
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver
})

function Seeder({ dashboardId, children }: { dashboardId: string | null; children: ReactNode }) {
  const { create } = useMutate()
  // Wait for the initial snapshot before mutating: creates racing the first
  // load are not pushed into in-flight jsdom subscriptions.
  const { loading } = useQuery(DashboardSchema, dashboardId ?? '__none__')
  const seeded = useRef(false)

  useEffect(() => {
    if (loading || seeded.current) return
    seeded.current = true
    void (async () => {
      await create(TaskSchema, { title: 'Surface task' })
      if (dashboardId) {
        await create(DashboardSchema, { title: 'Test board', icon: '🧪' }, dashboardId)
      }
    })()
  }, [create, dashboardId, loading])

  return children
}

function Harness({
  dashboardId,
  seedDashboard = true
}: {
  dashboardId: string
  seedDashboard?: boolean
}) {
  const identity = useMemo(() => generateIdentity(), [])
  const storage = useMemo(() => new MemoryNodeStorageAdapter(), [])

  return (
    <XNetProvider
      config={{
        nodeStorage: storage,
        authorDID: identity.identity.did as DID,
        signingKey: identity.privateKey
      }}
    >
      <Seeder dashboardId={seedDashboard ? dashboardId : null}>
        <DashboardSurface dashboardId={dashboardId} schemas={SCHEMAS} />
      </Seeder>
    </XNetProvider>
  )
}

async function findButton(name: string): Promise<HTMLElement> {
  return waitFor(() => {
    const button = [...document.querySelectorAll('button')].find((candidate) =>
      candidate.textContent?.includes(name)
    )
    if (!button) throw new Error(`button not found: ${name}`)
    return button
  })
}

describe('DashboardSurface', () => {
  it('offers creation when the dashboard node does not exist', async () => {
    render(<Harness dashboardId="missing-board" seedDashboard={false} />)

    fireEvent.click(await findButton('Create dashboard'))
    await waitFor(() => expect(screen.getByText('New dashboard')).toBeTruthy())
  })

  it('adds, configures, rebinds, and removes a widget', async () => {
    const { unmount } = render(<Harness dashboardId="board-1" />)

    await waitFor(() => expect(screen.getByText('Test board')).toBeTruthy())

    // Add a metric through the picker.
    fireEvent.click(await findButton('Add widget'))
    fireEvent.click(await findButton('Metric'))
    await waitFor(() => expect(document.querySelector('.grid-stack-item')).not.toBeNull())

    // Enter edit mode and open the config panel.
    fireEvent.click(await findButton('Edit'))
    fireEvent.click(await waitFor(() => screen.getByLabelText(/Configure/)))

    const panel = document.querySelector('aside')!
    const [titleInput] = panel.querySelectorAll('input[type="text"]')
    fireEvent.change(titleInput, { target: { value: 'Renamed metric' } })
    await waitFor(() => expect(screen.getByText('Renamed metric')).toBeTruthy())

    const selects = [...panel.querySelectorAll('select')]
    // Refresh policy → interval; time-range field → updatedAt.
    fireEvent.change(selects.find((s) => [...s.options].some((o) => o.value === 'live'))!, {
      target: { value: '30000' }
    })
    fireEvent.change(selects.at(-1)!, { target: { value: 'updatedAt' } })

    fireEvent.click(await findButton('Done'))

    // Change the dashboard time range.
    const timeRange = screen.getByLabelText('Time range') as HTMLSelectElement
    fireEvent.change(timeRange, { target: { value: '7d' } })
    await waitFor(() => expect(timeRange.value).toBe('7d'))
    fireEvent.change(timeRange, { target: { value: 'all' } })

    // Remove the widget.
    fireEvent.click(await findButton('Edit'))
    fireEvent.click(await waitFor(() => screen.getByLabelText(/Remove/)))
    await waitFor(() => expect(document.querySelector('.grid-stack-item')).toBeNull())

    unmount()
  })

  it('opens the user widget editor from the picker', async () => {
    render(<Harness dashboardId="board-2" />)

    await waitFor(() => expect(screen.getByText('Test board')).toBeTruthy())
    fireEvent.click(await findButton('Add widget'))
    fireEvent.click(await findButton('Create your own widget'))

    await waitFor(() =>
      expect(document.querySelector('[aria-label="Widget editor"] textarea')).not.toBeNull()
    )
    fireEvent.click(await findButton('Cancel'))
  })
})
