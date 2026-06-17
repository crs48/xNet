import { describe, expect, it } from 'vitest'
import {
  EMPTY_TASK_FILTER,
  addFilterValue,
  applyTaskFilter,
  isTaskFilterActive,
  removeFilterValue,
  taskFilterCount
} from './task-filter'

const tasks = [
  { id: 'a', status: 'todo', priority: 'high', assignees: ['did:1'], tags: ['t1'] },
  { id: 'b', status: 'in-progress', priority: 'low', assignee: 'did:2', tags: ['t2'] },
  { id: 'c', status: 'todo', priority: 'low', assignees: [], tags: ['t1', 't2'] }
]

describe('task-filter', () => {
  it('returns all tasks when no filter is active', () => {
    expect(isTaskFilterActive(EMPTY_TASK_FILTER)).toBe(false)
    expect(applyTaskFilter(tasks, EMPTY_TASK_FILTER)).toHaveLength(3)
  })

  it('ORs values within a field', () => {
    const filter = addFilterValue(
      addFilterValue(EMPTY_TASK_FILTER, 'status', 'todo'),
      'status',
      'in-progress'
    )
    expect(applyTaskFilter(tasks, filter).map((t) => t.id)).toEqual(['a', 'b', 'c'])
  })

  it('ANDs across fields', () => {
    let filter = addFilterValue(EMPTY_TASK_FILTER, 'status', 'todo')
    filter = addFilterValue(filter, 'priority', 'low')
    expect(applyTaskFilter(tasks, filter).map((t) => t.id)).toEqual(['c'])
  })

  it('matches assignees from both the array and the legacy single field', () => {
    const byArray = addFilterValue(EMPTY_TASK_FILTER, 'assignee', 'did:1')
    expect(applyTaskFilter(tasks, byArray).map((t) => t.id)).toEqual(['a'])
    const byLegacy = addFilterValue(EMPTY_TASK_FILTER, 'assignee', 'did:2')
    expect(applyTaskFilter(tasks, byLegacy).map((t) => t.id)).toEqual(['b'])
  })

  it('matches labels', () => {
    const filter = addFilterValue(EMPTY_TASK_FILTER, 'label', 't2')
    expect(applyTaskFilter(tasks, filter).map((t) => t.id)).toEqual(['b', 'c'])
  })

  it('tracks count and supports removal', () => {
    let filter = addFilterValue(EMPTY_TASK_FILTER, 'status', 'todo')
    filter = addFilterValue(filter, 'label', 't1')
    expect(taskFilterCount(filter)).toBe(2)
    filter = removeFilterValue(filter, 'status', 'todo')
    expect(taskFilterCount(filter)).toBe(1)
    expect(filter.status).toEqual([])
  })

  it('addFilterValue is idempotent', () => {
    const once = addFilterValue(EMPTY_TASK_FILTER, 'status', 'todo')
    const twice = addFilterValue(once, 'status', 'todo')
    expect(twice.status).toEqual(['todo'])
  })
})
