import { describe, expect, it } from 'vitest'
import {
  diffAssignees,
  dueDateMsToIso,
  fallbackMentionLabel,
  taskHostInfo,
  toTaskDisplayData,
  type TaskNode
} from './task-node-projection'

function node(overrides: Record<string, unknown> = {}): TaskNode {
  return {
    id: 'task_1',
    title: 'A task',
    completed: false,
    updatedAt: 1,
    createdAt: 1,
    ...overrides
  } as unknown as TaskNode
}

describe('toTaskDisplayData', () => {
  it('projects node fields with safe fallbacks', () => {
    const display = toTaskDisplayData(
      node({
        title: 'Ship it',
        status: 'in-progress',
        priority: 'high',
        dueDate: 123,
        assignees: ['did:key:a'],
        references: ['ref1', 'ref2'],
        shortId: 'XN-9'
      })
    )
    expect(display).toMatchObject({
      id: 'task_1',
      title: 'Ship it',
      status: 'in-progress',
      priority: 'high',
      dueDate: 123,
      assignees: ['did:key:a'],
      referenceCount: 2,
      shortId: 'XN-9'
    })
  })

  it('normalizes malformed fields', () => {
    const display = toTaskDisplayData(
      node({ title: 42, status: 7, dueDate: 'soon', assignees: 'nope', references: null })
    )
    expect(display.title).toBe('')
    expect(display.status).toBeUndefined()
    expect(display.dueDate).toBeNull()
    expect(display.assignees).toEqual([])
    expect(display.referenceCount).toBe(0)
    expect(display.shortId).toBeNull()
  })
})

describe('taskHostInfo', () => {
  it('detects page hosting', () => {
    expect(taskHostInfo(node({ page: 'page_1' }))).toEqual({
      pageId: 'page_1',
      canvasId: null,
      sourceLabel: 'Open page',
      hostOwned: true
    })
  })

  it('detects canvas hosting and unhosted tasks', () => {
    expect(taskHostInfo(node({ canvas: 'canvas_1' })).sourceLabel).toBe('Open canvas')
    expect(taskHostInfo(node())).toEqual({
      pageId: null,
      canvasId: null,
      sourceLabel: null,
      hostOwned: false
    })
  })
})

describe('diffAssignees', () => {
  it('reports additions and removals', () => {
    expect(diffAssignees(['a', 'b'], ['b', 'c'])).toEqual({ added: ['c'], removed: ['a'] })
    expect(diffAssignees([], ['a'])).toEqual({ added: ['a'], removed: [] })
    expect(diffAssignees(['a'], ['a'])).toEqual({ added: [], removed: [] })
  })
})

describe('dueDateMsToIso', () => {
  it('formats UTC ms as YYYY-MM-DD and passes null through', () => {
    expect(dueDateMsToIso(Date.UTC(2026, 6, 1))).toBe('2026-07-01')
    expect(dueDateMsToIso(null)).toBeNull()
  })
})

describe('fallbackMentionLabel', () => {
  it('shortens did:key identifiers, leaves others alone', () => {
    expect(fallbackMentionLabel('did:key:z6MkabcdefXYZ')).toBe('z6Mkabcdef')
    expect(fallbackMentionLabel('did:web:example.com')).toBe('did:web:example.com')
  })
})
