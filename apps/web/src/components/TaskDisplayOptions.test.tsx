import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EMPTY_TASK_FILTER, addFilterValue } from './task-filter'
import { TaskDisplayOptions, type TaskDisplaySettings } from './TaskDisplayOptions'
import { TaskFilterBar } from './TaskFilterBar'

const settings: TaskDisplaySettings = {
  groupBy: 'status',
  orderBy: 'manual',
  density: 'comfortable',
  showCompleted: true
}

describe('TaskDisplayOptions', () => {
  it('opens and emits grouping/ordering/density/show-completed changes', () => {
    const onChange = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <TaskDisplayOptions
        settings={settings}
        onChange={onChange}
        open
        onOpenChange={onOpenChange}
      />
    )

    // "Priority" labels both Grouping and Ordering; the first is grouping.
    fireEvent.click(screen.getAllByText('Priority')[0])
    expect(onChange).toHaveBeenCalledWith({ groupBy: 'priority' })

    fireEvent.click(screen.getByText('Compact'))
    expect(onChange).toHaveBeenCalledWith({ density: 'compact' })

    fireEvent.click(screen.getByText('Show completed'))
    expect(onChange).toHaveBeenCalledWith({ showCompleted: false })
  })
})

describe('TaskFilterBar', () => {
  const options = {
    status: [
      { id: 'todo', label: 'To Do' },
      { id: 'done', label: 'Done' }
    ],
    priority: [{ id: 'high', label: 'High' }],
    assignee: [],
    label: []
  }

  it('adds a filter value through the menu', () => {
    const onChange = vi.fn()
    render(
      <TaskFilterBar
        filter={EMPTY_TASK_FILTER}
        onChange={onChange}
        options={options}
        menuOpen
        onMenuOpenChange={vi.fn()}
      />
    )

    fireEvent.click(screen.getByText('Status'))
    fireEvent.click(screen.getByText('To Do'))
    expect(onChange).toHaveBeenCalledWith({
      status: ['todo'],
      priority: [],
      assignee: [],
      label: []
    })
  })

  it('renders active chips and removes them', () => {
    const onChange = vi.fn()
    const filter = addFilterValue(EMPTY_TASK_FILTER, 'status', 'done')
    render(
      <TaskFilterBar
        filter={filter}
        onChange={onChange}
        options={options}
        menuOpen={false}
        onMenuOpenChange={vi.fn()}
      />
    )

    expect(screen.getByText('Done')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Remove Status Done filter'))
    expect(onChange).toHaveBeenCalledWith({
      status: [],
      priority: [],
      assignee: [],
      label: []
    })
  })
})
