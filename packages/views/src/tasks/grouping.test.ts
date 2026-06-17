import { describe, expect, it } from 'vitest'
import { buildTaskGroups, orderTasks } from './grouping'

const tasks = [
  {
    id: 'a',
    title: 'Beta',
    status: 'todo',
    priority: 'low',
    dueDate: 300,
    sortKey: 'a2',
    assignees: ['did:1']
  },
  {
    id: 'b',
    title: 'Alpha',
    status: 'in-progress',
    priority: 'urgent',
    dueDate: 100,
    sortKey: 'a0',
    assignees: ['did:2']
  },
  {
    id: 'c',
    title: 'Gamma',
    status: 'todo',
    priority: 'high',
    dueDate: 200,
    sortKey: 'a1',
    assignees: []
  }
]

describe('orderTasks', () => {
  it('orders by manual sortKey', () => {
    expect(orderTasks(tasks, 'manual').map((t) => t.id)).toEqual(['b', 'c', 'a'])
  })
  it('orders by priority (urgent first)', () => {
    expect(orderTasks(tasks, 'priority').map((t) => t.id)).toEqual(['b', 'c', 'a'])
  })
  it('orders by due date (soonest first)', () => {
    expect(orderTasks(tasks, 'due').map((t) => t.id)).toEqual(['b', 'c', 'a'])
  })
  it('orders by title', () => {
    expect(orderTasks(tasks, 'title').map((t) => t.id)).toEqual(['b', 'a', 'c'])
  })
})

describe('buildTaskGroups', () => {
  it('groups by status in workflow order, hiding empty groups', () => {
    const groups = buildTaskGroups(tasks, { groupBy: 'status' })
    expect(groups.map((g) => g.key)).toEqual(['todo', 'in-progress'])
    expect(groups[0].tasks.map((t) => t.id)).toEqual(['c', 'a']) // manual order within group
  })

  it('groups by priority (urgent → low)', () => {
    const groups = buildTaskGroups(tasks, { groupBy: 'priority' })
    expect(groups.map((g) => g.key)).toEqual(['urgent', 'high', 'low'])
  })

  it('groups by assignee with an unassigned bucket', () => {
    const groups = buildTaskGroups(tasks, {
      groupBy: 'assignee',
      assigneeOrder: ['did:1', 'did:2']
    })
    expect(groups.map((g) => g.key)).toEqual(['did:1', 'did:2', ''])
    expect(groups[2].tasks.map((t) => t.id)).toEqual(['c'])
  })

  it('groupBy none yields a single ordered group', () => {
    const groups = buildTaskGroups(tasks, { groupBy: 'none', orderBy: 'title' })
    expect(groups).toHaveLength(1)
    expect(groups[0].key).toBe('all')
    expect(groups[0].tasks.map((t) => t.id)).toEqual(['b', 'a', 'c'])
  })

  it('respects the orderBy within groups', () => {
    const groups = buildTaskGroups(tasks, { groupBy: 'status', orderBy: 'due' })
    expect(groups[0].tasks.map((t) => t.id)).toEqual(['c', 'a']) // due 200 before 300
  })
})
