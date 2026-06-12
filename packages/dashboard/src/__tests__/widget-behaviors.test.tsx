/**
 * Widget renderer behaviors: formatters, cover/timestamp resolution, and
 * click/toggle handlers, exercised with crafted WidgetProps.
 */

import type { WidgetData, WidgetProps } from '../types'
import type { DID } from '@xnetjs/core'
import type { ReactNode } from 'react'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { MemoryNodeStorageAdapter } from '@xnetjs/data'
import { generateIdentity } from '@xnetjs/identity'
import { XNetProvider } from '@xnetjs/react'
import { useMemo } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { calendarWidget } from '../widgets/calendar-widget'
import { barChartWidget } from '../widgets/chart-widget'
import { metricWidget } from '../widgets/metric-widget'
import { pinBoardWidget } from '../widgets/pin-board-widget'
import { savedViewWidget } from '../widgets/saved-view-widget'
import { socialFeedWidget } from '../widgets/social-feed-widget'
import { taskListWidget } from '../widgets/task-list-widget'

function Harness({ children }: { children: ReactNode }) {
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
      {children}
    </XNetProvider>
  )
}

function data(overrides: Partial<WidgetData> = {}): WidgetData {
  return { rows: [], aggregates: null, queries: {}, loading: false, error: null, ...overrides }
}

function props(overrides: Partial<WidgetProps> = {}): WidgetProps {
  return {
    config: {},
    data: data(),
    width: 400,
    height: 300,
    variables: {},
    ...overrides
  }
}

describe('saved view widget', () => {
  const Component = savedViewWidget.component

  it('formats string, number, boolean, and empty cells', () => {
    const rows = [
      { id: 'r1', title: 'Row one', count: 3, done: true, note: null },
      { id: 'r2', title: 'Row two', count: 0, done: false, note: null }
    ]
    const { container } = render(
      <Component {...props({ data: data({ rows }), config: { maxColumns: 4 } })} />
    )

    expect(container.textContent).toContain('Row one')
    expect(container.textContent).toContain('3')
    expect(container.textContent).toContain('✓')
  })

  it('opens rows and shows the empty state', () => {
    const onOpenNode = vi.fn()
    const rows = [{ id: 'r1', title: 'Open me', schemaId: 'xnet://xnet.fyi/Task@1.0.0' }]
    const { container } = render(<Component {...props({ data: data({ rows }), onOpenNode })} />)
    fireEvent.click(container.querySelector('tbody tr')!)
    expect(onOpenNode).toHaveBeenCalledWith('r1', 'xnet://xnet.fyi/Task@1.0.0')

    const empty = render(<Component {...props()} />)
    expect(empty.container.textContent).toContain('No rows')
  })
})

describe('pin board widget', () => {
  const Component = pinBoardWidget.component

  it('resolves covers from defaults, config property, and falls back to the pin glyph', () => {
    const rows = [
      { id: 'a', title: 'Thumb', thumbnailUrl: 'https://example.com/a.png' },
      { id: 'b', title: 'Custom', coverImage: 'https://example.com/b.png' },
      { id: 'c', title: 'None', coverImage: 'not-a-url' }
    ]

    const defaults = render(<Component {...props({ data: data({ rows }) })} />)
    expect(defaults.container.querySelectorAll('img')).toHaveLength(1)

    const custom = render(
      <Component {...props({ data: data({ rows }), config: { coverProperty: 'coverImage' } })} />
    )
    expect(custom.container.querySelectorAll('img')).toHaveLength(1)
    expect(custom.container.querySelector('img')?.src).toContain('b.png')
    expect(custom.container.textContent).toContain('📌')
  })

  it('opens pins and shows the empty state', () => {
    const onOpenNode = vi.fn()
    const rows = [{ id: 'a', title: 'Pin', schemaId: 's' }]
    const { container } = render(<Component {...props({ data: data({ rows }), onOpenNode })} />)
    fireEvent.click(container.querySelector('button')!)
    expect(onOpenNode).toHaveBeenCalledWith('a', 's')

    expect(render(<Component {...props()} />).container.textContent).toContain('Nothing pinned')
  })
})

describe('social feed widget', () => {
  const Component = socialFeedWidget.component

  it('orders by published/imported/updated timestamps and opens items', () => {
    const onOpenNode = vi.fn()
    const rows = [
      { id: 'old', title: 'Old', publishedAt: 1000, platform: 'x', actorHandle: 'alice' },
      { id: 'imported', title: 'Imported only', importedAt: 3000 },
      { id: 'updated', textPreview: 'Updated only', updatedAt: 2000, schemaId: 's' }
    ]
    const { container } = render(
      <Component
        {...props({ data: data({ queries: { content: rows, actors: [] } }), onOpenNode })}
      />
    )

    const titles = [...container.querySelectorAll('li')].map((li) => li.textContent)
    expect(titles[0]).toContain('Imported only')
    expect(titles[2]).toContain('Old')

    fireEvent.click(container.querySelectorAll('li button')[2])
    expect(onOpenNode).toHaveBeenCalledWith('old', '')
  })

  it('shows the import hint when empty', () => {
    expect(render(<Component {...props()} />).container.textContent).toContain('social import')
  })
})

describe('metric widget', () => {
  const Component = metricWidget.component

  it('renders aggregate values, row-count fallback, loading, and non-numbers', () => {
    const aggregate = render(
      <Component
        {...props({
          config: { label: 'Total' },
          data: data({
            aggregates: {
              scope: 'loaded-snapshot',
              rowCount: 2,
              results: {
                value: {
                  alias: 'value',
                  function: 'count',
                  groupBy: [],
                  rowCount: 2,
                  value: 1234.5
                }
              }
            }
          })
        })}
      />
    )
    expect(aggregate.container.textContent).toContain('1,234.5')
    expect(aggregate.container.textContent).toContain('Total')

    const fallback = render(
      <Component {...props({ data: data({ rows: [{ id: 'a' }, { id: 'b' }] }) })} />
    )
    expect(fallback.container.textContent).toContain('2')

    const loading = render(<Component {...props({ data: data({ loading: true }) })} />)
    expect(loading.container.textContent).toContain('…')
  })
})

describe('calendar widget', () => {
  const Component = calendarWidget.component

  it('buckets rows per day and navigates months', () => {
    const today = Date.now()
    const rows = [
      { id: 'a', dueDate: today },
      { id: 'b', dueDate: today },
      { id: 'c', dueDate: 0 },
      { id: 'd' }
    ]
    const { container, getByLabelText } = render(
      <Component {...props({ data: data({ rows }), config: { dateProperty: 'dueDate' } })} />
    )

    expect(container.querySelector('[title="2 items"]')).not.toBeNull()

    const label = container.textContent
    fireEvent.click(getByLabelText('Next month'))
    expect(container.textContent).not.toBe(label)
    fireEvent.click(getByLabelText('Previous month'))
    fireEvent.click(getByLabelText('Previous month'))
    expect(container.textContent).not.toBe(label)
  })
})

describe('task list widget', () => {
  const Component = taskListWidget.component

  it('filters completed tasks, toggles completion, and opens tasks', async () => {
    const onOpenNode = vi.fn()
    const rows = [
      { id: 't1', title: 'Open task', completed: false, dueDate: Date.now() },
      { id: 't2', title: 'Done task', completed: true }
    ]
    const { container } = render(
      <Harness>
        <Component {...props({ data: data({ rows }), onOpenNode })} />
      </Harness>
    )

    await waitFor(() => expect(container.textContent).toContain('Open task'))
    expect(container.textContent).not.toContain('Done task')

    fireEvent.click(container.querySelector('input[type="checkbox"]')!)
    fireEvent.click(container.querySelector('li button')!)
    expect(onOpenNode).toHaveBeenCalledWith('t1', expect.stringContaining('Task'))

    const showAll = render(
      <Harness>
        <Component {...props({ data: data({ rows }), config: { showCompleted: true } })} />
      </Harness>
    )
    await waitFor(() => expect(showAll.container.textContent).toContain('Done task'))

    const empty = render(
      <Harness>
        <Component {...props()} />
      </Harness>
    )
    await waitFor(() => expect(empty.container.textContent).toContain('No tasks'))
  })
})

describe('chart widget', () => {
  const Component = barChartWidget.component

  it('prompts for an x property, shows empty state, and falls back without canvas', () => {
    const prompt = render(<Component {...props()} />)
    expect(prompt.container.textContent).toContain('Pick an X axis property')

    const empty = render(<Component {...props({ config: { x: 'status' } })} />)
    expect(empty.container.textContent).toContain('No data')

    const chart = render(
      <Component
        {...props({
          config: { x: 'status' },
          data: data({ rows: [{ id: 'a', status: 'todo' }] })
        })}
      />
    )
    // jsdom has no canvas: the charts package renders its text fallback.
    expect(chart.container.querySelector('[data-chart-fallback]')).not.toBeNull()
  })
})
