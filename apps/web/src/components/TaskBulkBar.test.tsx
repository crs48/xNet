import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TaskBulkBar } from './TaskBulkBar'
import { TaskPeek } from './TaskPeek'

describe('TaskBulkBar', () => {
  it('shows the selection count and fires each bulk action', () => {
    const handlers = {
      onStatus: vi.fn(),
      onPriority: vi.fn(),
      onAssignMe: vi.fn(),
      onDelete: vi.fn(),
      onClear: vi.fn()
    }
    render(<TaskBulkBar count={3} {...handlers} />)

    expect(screen.getByTestId('task-bulk-bar').textContent).toContain('3 selected')

    fireEvent.click(screen.getByText('Status'))
    fireEvent.click(screen.getByText('Priority'))
    fireEvent.click(screen.getByText('Assign me'))
    fireEvent.click(screen.getByText('Delete'))
    fireEvent.click(screen.getByLabelText('Clear selection'))

    expect(handlers.onStatus).toHaveBeenCalledTimes(1)
    expect(handlers.onPriority).toHaveBeenCalledTimes(1)
    expect(handlers.onAssignMe).toHaveBeenCalledTimes(1)
    expect(handlers.onDelete).toHaveBeenCalledTimes(1)
    expect(handlers.onClear).toHaveBeenCalledTimes(1)
  })
})

describe('TaskPeek', () => {
  const task = {
    id: 'task_a',
    title: 'Wire the peek',
    completed: false,
    status: 'in-progress',
    priority: 'high'
  }

  it('renders the focused task and opens it', () => {
    const onOpen = vi.fn()
    const onClose = vi.fn()
    render(<TaskPeek task={task} onOpen={onOpen} onClose={onClose} />)

    expect(screen.getByTestId('task-peek').textContent).toContain('Wire the peek')
    expect(screen.getByTestId('task-peek').textContent).toContain('In Progress')

    fireEvent.click(screen.getByText('Open task'))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onOpen).toHaveBeenCalledWith('task_a')
  })
})
