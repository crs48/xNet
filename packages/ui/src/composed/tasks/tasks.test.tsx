import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { TaskCard } from './TaskCard'
import { TaskChip } from './TaskChip'
import { TaskRow } from './TaskRow'
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
