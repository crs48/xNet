import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { TaskBoard } from './TaskBoard'
import { TaskListGrouped } from './TaskListGrouped'

const tasks = [
  {
    id: 'task_a',
    title: 'Fix the grid',
    completed: false,
    status: 'in-progress',
    sortKey: 'a0'
  },
  {
    id: 'task_b',
    title: 'Ship the board',
    completed: false,
    status: 'todo',
    sortKey: 'a1'
  },
  {
    id: 'task_c',
    title: 'Old cancelled thing',
    completed: true,
    status: 'done',
    sortKey: 'a2'
  }
]

describe('TaskListGrouped', () => {
  it('groups tasks by status in workflow order and hides empty groups', () => {
    render(<TaskListGrouped tasks={tasks} />)

    const list = screen.getByTestId('task-list-grouped')
    expect(list.textContent).toContain('In Progress')
    expect(list.textContent).toContain('To Do')
    expect(list.textContent).toContain('Done')
    expect(list.textContent).not.toContain('Backlog')

    const rows = screen.getAllByTestId('task-row')
    expect(rows).toHaveLength(3)
  })

  it('collapses a group on header click', () => {
    render(<TaskListGrouped tasks={tasks} />)

    fireEvent.click(screen.getByText('In Progress'))
    expect(screen.queryByText('Fix the grid')).toBeNull()
    expect(screen.getByText('Ship the board')).toBeTruthy()
  })

  it('emits open and toggle intents', () => {
    const onOpenTask = vi.fn()
    const onToggleCompleted = vi.fn()
    render(
      <TaskListGrouped
        tasks={tasks}
        onOpenTask={onOpenTask}
        onToggleCompleted={onToggleCompleted}
      />
    )

    fireEvent.click(screen.getByText('Fix the grid'))
    expect(onOpenTask).toHaveBeenCalledWith('task_a')

    // Groups render in workflow order: the todo group (task_b) precedes in-progress
    fireEvent.click(screen.getAllByLabelText('Mark complete')[0])
    expect(onToggleCompleted).toHaveBeenCalledWith('task_b', true)
  })

  it('renders an empty state', () => {
    render(<TaskListGrouped tasks={[]} />)
    expect(screen.getByText('No tasks yet')).toBeTruthy()
  })
})

describe('TaskBoard', () => {
  it('renders all workflow columns with task counts', () => {
    render(<TaskBoard tasks={tasks} onStatusChange={vi.fn()} />)

    expect(screen.getByTestId('task-board')).toBeTruthy()
    expect(screen.getByTestId('task-board-column-in-progress').textContent).toContain(
      'Fix the grid'
    )
    expect(screen.getByTestId('task-board-column-todo').textContent).toContain('Ship the board')
    expect(screen.getByTestId('task-board-column-done').textContent).toContain(
      'Old cancelled thing'
    )
    // Empty columns still render on the board (drop targets)
    expect(screen.getByTestId('task-board-column-triage')).toBeTruthy()
    expect(screen.getByTestId('task-board-column-backlog')).toBeTruthy()
  })
})
