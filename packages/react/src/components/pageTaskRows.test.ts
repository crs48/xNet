import type { TaskTreeItem } from '../hooks/useTasks'
import { describe, expect, it } from 'vitest'
import { flattenTaskTree, formatTaskDueDate, isTaskOverdue } from './pageTaskRows'

const DAY = 24 * 60 * 60 * 1000

function treeItem(overrides: Record<string, unknown>, children: TaskTreeItem[] = []): TaskTreeItem {
  return { task: overrides, children } as unknown as TaskTreeItem
}

describe('flattenTaskTree', () => {
  it('flattens nested tasks depth-first with their depth', () => {
    const tree = [
      treeItem({ id: 'a', title: 'Parent', completed: false }, [
        treeItem({ id: 'b', title: 'Child', completed: true }, [
          treeItem({ id: 'c', title: 'Grandchild' })
        ])
      ]),
      treeItem({ id: 'd', title: 'Sibling' })
    ]

    const rows = flattenTaskTree(tree)

    expect(rows.map((row) => [row.id, row.depth])).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 2],
      ['d', 0]
    ])
  })

  it('normalizes missing fields', () => {
    const rows = flattenTaskTree([treeItem({ id: 'a' })])

    expect(rows[0]).toEqual({
      id: 'a',
      title: 'Untitled task',
      completed: false,
      dueDate: undefined,
      depth: 0,
      assigneeCount: 0
    })
  })

  it('counts assignees and keeps numeric due dates', () => {
    const rows = flattenTaskTree([
      treeItem({ id: 'a', dueDate: 1000, assignees: ['did:1', 'did:2'] }),
      treeItem({ id: 'b', dueDate: 'tomorrow' })
    ])

    expect(rows[0].dueDate).toBe(1000)
    expect(rows[0].assigneeCount).toBe(2)
    expect(rows[1].dueDate).toBeUndefined()
  })
})

describe('formatTaskDueDate', () => {
  it('returns null without a timestamp', () => {
    expect(formatTaskDueDate(undefined)).toBeNull()
  })

  it('formats a timestamp as a short date', () => {
    expect(formatTaskDueDate(Date.UTC(2026, 0, 15, 12))).toMatch(/Jan/i)
  })
})

describe('isTaskOverdue', () => {
  it('is true for an incomplete task due yesterday', () => {
    expect(isTaskOverdue(Date.now() - 2 * DAY, false)).toBe(true)
  })

  it('is false once the task is completed', () => {
    expect(isTaskOverdue(Date.now() - 2 * DAY, true)).toBe(false)
  })

  it('is false for today, the future, and missing dates', () => {
    expect(isTaskOverdue(Date.now(), false)).toBe(false)
    expect(isTaskOverdue(Date.now() + 2 * DAY, false)).toBe(false)
    expect(isTaskOverdue(undefined, false)).toBe(false)
  })
})
