import { fireEvent, render, screen, within } from '@testing-library/react'
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

  it('opens a status dropdown from the row glyph and emits onStatusChange', () => {
    const onStatusChange = vi.fn()
    const onToggleCompleted = vi.fn()
    render(
      <TaskListGrouped
        tasks={tasks}
        onStatusChange={onStatusChange}
        onToggleCompleted={onToggleCompleted}
      />
    )

    // The glyph is a status picker, not a complete/incomplete toggle.
    expect(screen.queryByLabelText('Mark complete')).toBeNull()

    // The todo group (task_b) renders first in workflow order.
    fireEvent.click(screen.getAllByLabelText('Change status')[0])
    const panel = screen.getByTestId('task-status-menu-panel')
    fireEvent.click(within(panel).getByText('In Progress'))

    expect(onStatusChange).toHaveBeenCalledWith('task_b', 'in-progress', false)
    expect(onToggleCompleted).not.toHaveBeenCalled()
  })

  it('renders an empty state', () => {
    render(<TaskListGrouped tasks={[]} />)
    expect(screen.getByText('No tasks yet')).toBeTruthy()
  })

  it('shows selection checkboxes and emits select intents with modifiers', () => {
    const onSelectTask = vi.fn()
    render(
      <TaskListGrouped
        tasks={tasks}
        selectedTaskIds={new Set(['task_b'])}
        onSelectTask={onSelectTask}
      />
    )

    const checkboxes = screen.getAllByTestId('task-row-select')
    expect(checkboxes).toHaveLength(3)

    // The todo group (task_b) renders first; it is the pre-selected row.
    fireEvent.click(checkboxes[0], { shiftKey: true })
    expect(onSelectTask).toHaveBeenCalledWith('task_b', {
      shiftKey: true,
      metaKey: false
    })
    expect(screen.getByTestId('task-list-grouped').querySelector('[data-selected]')).toBeTruthy()
  })

  it('omits selection checkboxes when onSelectTask is absent', () => {
    render(<TaskListGrouped tasks={tasks} />)
    expect(screen.queryByTestId('task-row-select')).toBeNull()
  })

  it('emits create-in-group from the header "+" affordance', () => {
    const onCreateInGroup = vi.fn()
    render(<TaskListGrouped tasks={tasks} onCreateInGroup={onCreateInGroup} />)

    fireEvent.click(screen.getByLabelText('Add task to todo'))
    expect(onCreateInGroup).toHaveBeenCalledWith({ groupBy: 'status', key: 'todo' })
  })

  it('renders compact rows at a tighter height', () => {
    const { container } = render(<TaskListGrouped tasks={tasks} density="compact" />)
    const row = container.querySelector('[data-testid="task-row"]')
    expect(row?.className).toContain('h-[30px]')
  })

  it('groups by priority when asked', () => {
    const withPriority = tasks.map((t, i) => ({
      ...t,
      priority: (['urgent', 'low', 'high'] as const)[i]
    }))
    render(<TaskListGrouped tasks={withPriority} groupBy="priority" />)
    const list = screen.getByTestId('task-list-grouped')
    expect(list.textContent).toContain('Urgent')
    expect(list.textContent).toContain('High')
    expect(list.textContent).toContain('Low')
  })

  it('renders a flat list with no headers when groupBy is none', () => {
    render(<TaskListGrouped tasks={tasks} groupBy="none" />)
    const list = screen.getByTestId('task-list-grouped')
    expect(list.textContent).not.toContain('In Progress')
    expect(screen.getAllByTestId('task-row')).toHaveLength(3)
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
