import { fireEvent, render, screen, within } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { TaskCard } from './TaskCard'
import { TaskChip } from './TaskChip'
import { TaskRow } from './TaskRow'
import { TaskStatusMenu } from './TaskStatusMenu'
import { formatDueDate, getTaskStatusMeta, isCompletedStatus } from './types'

const baseTask = {
  id: 'task_1',
  title: 'Ship task components',
  completed: false,
  status: 'in-progress',
  priority: 'high',
  dueDate: Date.UTC(2026, 5, 10),
  assignees: ['did:key:alice', 'did:key:bob'],
  shortId: 'XN-42',
  referenceCount: 2
}

describe('task display helpers', () => {
  it('derives completion from status categories', () => {
    expect(isCompletedStatus('done')).toBe(true)
    expect(isCompletedStatus('cancelled')).toBe(true)
    expect(isCompletedStatus('in-progress')).toBe(false)
    expect(isCompletedStatus(undefined)).toBe(false)
  })

  it('falls back to todo metadata for unknown statuses', () => {
    expect(getTaskStatusMeta('custom-state').id).toBe('todo')
  })

  it('classifies due dates as overdue/today/upcoming', () => {
    const now = Date.UTC(2026, 5, 11, 12)
    expect(formatDueDate(Date.UTC(2026, 5, 10), now).urgency).toBe('overdue')
    expect(formatDueDate(Date.UTC(2026, 5, 11), now).urgency).toBe('today')
    expect(formatDueDate(Date.UTC(2026, 5, 12), now).urgency).toBe('upcoming')
    expect(formatDueDate(null, now).urgency).toBe('none')
  })
})

describe('TaskChip', () => {
  it('renders title and toggles completion', () => {
    const onToggleCompleted = vi.fn()
    render(<TaskChip task={baseTask} onToggleCompleted={onToggleCompleted} />)

    expect(screen.getByText('Ship task components')).toBeTruthy()
    expect(screen.getByText('XN-42')).toBeTruthy()

    fireEvent.click(screen.getByLabelText('Mark complete'))
    expect(onToggleCompleted).toHaveBeenCalledWith('task_1', true)
  })

  it('renders a tombstone for archived tasks with a restore affordance', () => {
    const onRestore = vi.fn()
    render(<TaskChip task={{ ...baseTask, deleted: true }} onRestore={onRestore} />)

    expect(screen.getByTestId('task-chip-tombstone')).toBeTruthy()
    fireEvent.click(screen.getByText('Restore'))
    expect(onRestore).toHaveBeenCalledWith('task_1')
  })

  it('renders a tombstone for missing tasks', () => {
    render(<TaskChip task={null} />)
    expect(screen.getByText('Task removed')).toBeTruthy()
  })
})

describe('TaskRow', () => {
  it('opens the task on click and shows focus state', () => {
    const onOpen = vi.fn()
    render(<TaskRow task={baseTask} focused onOpen={onOpen} />)

    const row = screen.getByTestId('task-row')
    expect(row.getAttribute('data-focused')).toBe('true')

    fireEvent.click(row)
    expect(onOpen).toHaveBeenCalledWith('task_1')
  })

  it('toggles completion from the glyph when only onToggleCompleted is wired', () => {
    const onToggleCompleted = vi.fn()
    render(<TaskRow task={baseTask} onToggleCompleted={onToggleCompleted} />)

    fireEvent.click(screen.getByLabelText('Mark complete'))
    expect(onToggleCompleted).toHaveBeenCalledWith('task_1', true)
    expect(screen.queryByLabelText('Change status')).toBeNull()
  })

  it('opens a status dropdown from the glyph instead of toggling completion', () => {
    const onStatusChange = vi.fn()
    const onOpen = vi.fn()
    const onToggleCompleted = vi.fn()
    render(
      <TaskRow
        task={baseTask}
        onStatusChange={onStatusChange}
        onOpen={onOpen}
        onToggleCompleted={onToggleCompleted}
      />
    )

    // With status editing wired the glyph is a picker, not a complete toggle.
    expect(screen.queryByLabelText('Mark complete')).toBeNull()

    fireEvent.click(screen.getByLabelText('Change status'))
    const panel = screen.getByTestId('task-status-menu-panel')
    expect(panel.textContent).toContain('To Do')
    expect(panel.textContent).toContain('In Review')
    expect(panel.textContent).toContain('Cancelled')

    fireEvent.click(within(panel).getByText('In Review'))
    expect(onStatusChange).toHaveBeenCalledWith('task_1', 'in-review', false)
    // Opening the menu or picking a status never opens or toggles the task.
    expect(onOpen).not.toHaveBeenCalled()
    expect(onToggleCompleted).not.toHaveBeenCalled()
  })
})

describe('TaskStatusMenu', () => {
  it('derives completion from the chosen status category', () => {
    const onPick = vi.fn()
    render(<TaskStatusMenu status="todo" onPick={onPick} />)

    fireEvent.click(screen.getByLabelText('Change status'))
    const panel = screen.getByTestId('task-status-menu-panel')
    fireEvent.click(within(panel).getByText('Done'))
    expect(onPick).toHaveBeenCalledWith('done', true)
  })

  it('closes after a pick and reflects the current status', () => {
    const onPick = vi.fn()
    render(<TaskStatusMenu status="in-progress" onPick={onPick} />)

    fireEvent.click(screen.getByLabelText('Change status'))
    expect(screen.getByTestId('task-status-menu-panel')).toBeTruthy()
    fireEvent.click(within(screen.getByTestId('task-status-menu-panel')).getByText('Cancelled'))

    expect(onPick).toHaveBeenCalledWith('cancelled', true)
    expect(screen.queryByTestId('task-status-menu-panel')).toBeNull()
  })
})

describe('TaskCard', () => {
  it('renders full card with status name', () => {
    render(<TaskCard task={baseTask} />)
    expect(screen.getByTestId('task-card')).toBeTruthy()
    expect(screen.getByText('In Progress')).toBeTruthy()
  })

  it('renders mini mode', () => {
    render(<TaskCard task={baseTask} mode="mini" />)
    expect(screen.getByTestId('task-card-mini')).toBeTruthy()
  })

  it('renders tombstone when task is archived', () => {
    render(<TaskCard task={{ ...baseTask, deleted: true }} />)
    expect(screen.getByTestId('task-card-tombstone')).toBeTruthy()
  })
})

describe('GitHub state badges', () => {
  it('derives state from pull-request reference metadata', async () => {
    const { githubStateFromReferences } = await import('./types')

    const state = githubStateFromReferences([
      { kind: 'link', metadata: '{"prState":"open"}', updatedAt: 5 },
      {
        kind: 'pull-request',
        metadata: '{"prState":"merged","reviewState":"approved","ciState":"passing"}',
        updatedAt: 10
      },
      { kind: 'pull-request', metadata: 'not json', updatedAt: 20 }
    ])

    expect(state).toEqual({ prState: 'merged', reviewState: 'approved', ciState: 'passing' })
    expect(githubStateFromReferences([])).toBeUndefined()
  })

  it('renders PR/review/CI badges on rows and cards', () => {
    const github = {
      prState: 'open',
      reviewState: 'approved',
      ciState: 'failing'
    } as const

    render(<TaskRow task={{ ...baseTask, github }} />)
    expect(screen.getByLabelText('PR open')).toBeTruthy()
    expect(screen.getByLabelText('Review approved')).toBeTruthy()
    expect(screen.getByLabelText('Checks failing')).toBeTruthy()
  })

  it('renders merged badge on cards and nothing without state', () => {
    render(<TaskCard task={{ ...baseTask, github: { prState: 'merged' } }} />)
    expect(screen.getByLabelText('PR merged')).toBeTruthy()

    render(<TaskCard task={{ ...baseTask, id: 'task_2' }} />)
    expect(screen.queryAllByTestId('task-github-badges')).toHaveLength(1)
  })
})
