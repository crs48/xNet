/**
 * Tests for board view components
 */

import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBoardState } from '../board/useBoardState'
import type { Schema } from '@xnet/data'
import type { ViewConfig } from '../types'

// Mock schema with select property
const mockSchema: Schema = {
  '@id': 'xnet://xnet.fyi/Task',
  '@type': 'xnet://xnet.fyi/Schema',
  name: 'Task',
  namespace: 'xnet.fyi',
  properties: [
    {
      '@id': 'xnet://xnet.fyi/Task#title',
      name: 'Title',
      type: 'text',
      required: true
    },
    {
      '@id': 'xnet://xnet.fyi/Task#status',
      name: 'Status',
      type: 'select',
      required: false,
      config: {
        options: [
          { id: 'todo', name: 'To Do', color: '#e0e0e0' },
          { id: 'doing', name: 'Doing', color: '#ffd54f' },
          { id: 'done', name: 'Done', color: '#81c784' }
        ]
      }
    }
  ]
}

const mockView: ViewConfig = {
  id: 'view-1',
  name: 'Board',
  type: 'board',
  visibleProperties: ['title', 'status'],
  sorts: [],
  groupByProperty: 'status'
}

const mockData = [
  { id: '1', title: 'Task 1', status: 'todo' },
  { id: '2', title: 'Task 2', status: 'doing' },
  { id: '3', title: 'Task 3', status: 'done' },
  { id: '4', title: 'Task 4', status: 'todo' },
  { id: '5', title: 'Task 5', status: null } // No status
]

describe('useBoardState', () => {
  it('should group items by select property', () => {
    const { result } = renderHook(() =>
      useBoardState({
        schema: mockSchema,
        view: mockView,
        data: mockData
      })
    )

    expect(result.current.columns).toHaveLength(4) // No value + 3 options

    // Find columns by ID
    const noValueCol = result.current.columns.find((c) => c.id === '__none__')
    const todoCol = result.current.columns.find((c) => c.id === 'todo')
    const doingCol = result.current.columns.find((c) => c.id === 'doing')
    const doneCol = result.current.columns.find((c) => c.id === 'done')

    expect(noValueCol?.items).toHaveLength(1)
    expect(todoCol?.items).toHaveLength(2)
    expect(doingCol?.items).toHaveLength(1)
    expect(doneCol?.items).toHaveLength(1)
  })

  it('should move card between columns', () => {
    const onUpdateRow = vi.fn()

    const { result } = renderHook(() =>
      useBoardState({
        schema: mockSchema,
        view: mockView,
        data: mockData,
        onUpdateRow
      })
    )

    // Move task 1 from todo to doing
    act(() => {
      result.current.moveCard('1', 'todo', 'doing')
    })

    expect(onUpdateRow).toHaveBeenCalledWith('1', 'status', 'doing')
  })

  it('should move card to no value column', () => {
    const onUpdateRow = vi.fn()

    const { result } = renderHook(() =>
      useBoardState({
        schema: mockSchema,
        view: mockView,
        data: mockData,
        onUpdateRow
      })
    )

    // Move task 1 from todo to no value
    act(() => {
      result.current.moveCard('1', 'todo', '__none__')
    })

    expect(onUpdateRow).toHaveBeenCalledWith('1', 'status', null)
  })

  it('should toggle column collapse', () => {
    const { result } = renderHook(() =>
      useBoardState({
        schema: mockSchema,
        view: mockView,
        data: mockData
      })
    )

    // Initially not collapsed
    expect(result.current.collapsedColumns.has('todo')).toBe(false)

    // Toggle collapse
    act(() => {
      result.current.toggleColumnCollapse('todo')
    })

    expect(result.current.collapsedColumns.has('todo')).toBe(true)

    // Toggle again to expand
    act(() => {
      result.current.toggleColumnCollapse('todo')
    })

    expect(result.current.collapsedColumns.has('todo')).toBe(false)
  })

  it('should handle missing groupByProperty', () => {
    const viewWithoutGroup: ViewConfig = {
      ...mockView,
      groupByProperty: undefined
    }

    const { result } = renderHook(() =>
      useBoardState({
        schema: mockSchema,
        view: viewWithoutGroup,
        data: mockData
      })
    )

    // Should have one column with all items
    expect(result.current.columns).toHaveLength(1)
    expect(result.current.columns[0].id).toBe('__all__')
    expect(result.current.columns[0].items).toHaveLength(5)
  })

  it('should return column colors from options', () => {
    const { result } = renderHook(() =>
      useBoardState({
        schema: mockSchema,
        view: mockView,
        data: mockData
      })
    )

    const todoCol = result.current.columns.find((c) => c.id === 'todo')
    const doingCol = result.current.columns.find((c) => c.id === 'doing')
    const doneCol = result.current.columns.find((c) => c.id === 'done')

    expect(todoCol?.color).toBe('#e0e0e0')
    expect(doingCol?.color).toBe('#ffd54f')
    expect(doneCol?.color).toBe('#81c784')
  })
})

describe('useBoardState with multiSelect', () => {
  const multiSelectSchema: Schema = {
    '@id': 'xnet://xnet.fyi/Task',
    '@type': 'xnet://xnet.fyi/Schema',
    name: 'Task',
    namespace: 'xnet.fyi',
    properties: [
      {
        '@id': 'xnet://xnet.fyi/Task#title',
        name: 'Title',
        type: 'text',
        required: true
      },
      {
        '@id': 'xnet://xnet.fyi/Task#tags',
        name: 'Tags',
        type: 'multiSelect',
        required: false,
        config: {
          options: [
            { id: 'bug', name: 'Bug', color: '#f44336' },
            { id: 'feature', name: 'Feature', color: '#2196f3' },
            { id: 'urgent', name: 'Urgent', color: '#ff9800' }
          ]
        }
      }
    ]
  }

  const multiSelectView: ViewConfig = {
    id: 'view-1',
    name: 'Board',
    type: 'board',
    visibleProperties: ['title', 'tags'],
    sorts: [],
    groupByProperty: 'tags'
  }

  const multiSelectData = [
    { id: '1', title: 'Task 1', tags: ['bug'] },
    { id: '2', title: 'Task 2', tags: ['feature', 'urgent'] },
    { id: '3', title: 'Task 3', tags: [] }
  ]

  it('should show item in multiple columns for multiSelect', () => {
    const { result } = renderHook(() =>
      useBoardState({
        schema: multiSelectSchema,
        view: multiSelectView,
        data: multiSelectData
      })
    )

    const bugCol = result.current.columns.find((c) => c.id === 'bug')
    const featureCol = result.current.columns.find((c) => c.id === 'feature')
    const urgentCol = result.current.columns.find((c) => c.id === 'urgent')
    const noValueCol = result.current.columns.find((c) => c.id === '__none__')

    // Task 1 is only in bug
    expect(bugCol?.items).toHaveLength(1)
    // Task 2 is in both feature and urgent
    expect(featureCol?.items).toHaveLength(1)
    expect(urgentCol?.items).toHaveLength(1)
    // Task 3 is in no value (empty array)
    expect(noValueCol?.items).toHaveLength(1)
  })

  it('should update multiSelect array on move', () => {
    const onUpdateRow = vi.fn()

    const { result } = renderHook(() =>
      useBoardState({
        schema: multiSelectSchema,
        view: multiSelectView,
        data: multiSelectData,
        onUpdateRow
      })
    )

    // Move task 1 from bug to feature (adds feature, removes bug)
    act(() => {
      result.current.moveCard('1', 'bug', 'feature')
    })

    expect(onUpdateRow).toHaveBeenCalledWith('1', 'tags', ['feature'])
  })
})
