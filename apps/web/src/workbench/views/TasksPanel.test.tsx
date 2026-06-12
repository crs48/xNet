import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useWorkbench } from '../state'
import { TasksDashboard } from './TasksPanel'

const state = vi.hoisted(() => ({
  me: 'did:key:z6Mkme',
  tasksData: [] as Array<Record<string, unknown>>,
  projectsData: [] as Array<Record<string, unknown>>
}))
const me = state.me

vi.mock('@xnetjs/react', () => ({
  useIdentity: () => ({ did: state.me }),
  useTasks: () => ({ data: state.tasksData, tree: [], loading: false }),
  useQuery: () => ({ data: state.projectsData, loading: false })
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    search,
    ...rest
  }: React.PropsWithChildren<{ search?: Record<string, string> }>) => (
    <a data-search={JSON.stringify(search)} {...rest}>
      {children}
    </a>
  )
}))

let nextId = 0
function task(overrides: Record<string, unknown> = {}) {
  nextId += 1
  return {
    id: `task_${nextId}`,
    title: `Task ${nextId}`,
    completed: false,
    status: 'todo',
    priority: 'medium',
    assignees: [me],
    updatedAt: 1,
    ...overrides
  }
}

beforeEach(() => {
  state.tasksData = []
  state.projectsData = []
  useWorkbench.setState({ pinnedNodeIds: [] })
})

describe('TasksDashboard', () => {
  it('renders the hint state when nothing is relevant', () => {
    render(<TasksDashboard />)
    expect(screen.getByTestId('tasks-panel-empty')).toBeTruthy()
  })

  it('buckets pinned and in-progress tasks into their sections', () => {
    const pinned = task({ title: 'Pinned thing' })
    const inFlight = task({ title: 'Cooking', status: 'in-progress' })
    state.tasksData = [pinned, inFlight]
    useWorkbench.setState({ pinnedNodeIds: [pinned.id as string] })

    render(<TasksDashboard />)

    expect(screen.getByText('Pinned')).toBeTruthy()
    expect(screen.getByText('Pinned thing')).toBeTruthy()
    expect(screen.getByText('In progress')).toBeTruthy()
    expect(screen.getByText('Cooking')).toBeTruthy()
  })

  it('paginates assignments and reveals more on demand', () => {
    state.tasksData = [task(), task(), task(), task(), task()]

    render(<TasksDashboard />)

    expect(screen.getAllByTestId('tasks-panel-row')).toHaveLength(3)
    const showMore = screen.getByTestId('tasks-panel-show-more')
    expect(showMore.textContent).toContain('2 hidden')

    fireEvent.click(showMore)
    expect(screen.getAllByTestId('tasks-panel-row')).toHaveLength(5)
  })

  it('lists followed projects with open counts linking to the scoped board', () => {
    state.projectsData = [{ id: 'proj_1', name: 'Skunkworks', lead: me }]
    state.tasksData = [task({ project: 'proj_1' }), task({ project: 'proj_1', assignees: [] })]

    render(<TasksDashboard />)

    const row = screen.getByTestId('tasks-panel-project')
    expect(row.textContent).toContain('Skunkworks')
    expect(row.textContent).toContain('2')
    expect(row.getAttribute('data-search')).toBe(JSON.stringify({ project: 'proj_1' }))
  })
})
