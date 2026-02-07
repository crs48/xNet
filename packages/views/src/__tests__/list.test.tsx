/**
 * Tests for list view components
 */

import type { ViewConfig } from '../types'
import type { Schema } from '@xnet/data'
import { renderHook } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { useListState } from '../list/useListState'

// Mock schema with text and checkbox properties
const mockSchema: Schema = {
  '@id': 'xnet://xnet.fyi/Task',
  '@type': 'xnet://xnet.fyi/Schema',
  name: 'Task',
  namespace: 'xnet.fyi',
  version: '1.0.0',
  properties: [
    {
      '@id': 'xnet://xnet.fyi/Task#title',
      name: 'Title',
      type: 'text',
      required: true
    },
    {
      '@id': 'xnet://xnet.fyi/Task#done',
      name: 'Done',
      type: 'checkbox',
      required: false
    },
    {
      '@id': 'xnet://xnet.fyi/Task#priority',
      name: 'Priority',
      type: 'select',
      required: false,
      config: {
        options: [
          { id: 'low', name: 'Low' },
          { id: 'medium', name: 'Medium' },
          { id: 'high', name: 'High' }
        ]
      }
    }
  ]
}

const mockView: ViewConfig = {
  id: 'view-1',
  name: 'List',
  type: 'list',
  visibleProperties: ['title', 'done', 'priority'],
  sorts: []
}

const mockData = [
  { id: '1', title: 'Task 1', done: false, priority: 'high' },
  { id: '2', title: 'Task 2', done: true, priority: 'low' },
  { id: '3', title: 'Task 3', done: false, priority: 'medium' }
]

describe('useListState', () => {
  it('should identify title property', () => {
    const { result } = renderHook(() =>
      useListState({
        schema: mockSchema,
        view: mockView,
        data: mockData
      })
    )

    expect(result.current.titleProperty).not.toBeNull()
    expect(result.current.titleProperty?.name).toBe('Title')
  })

  it('should identify checkbox property', () => {
    const { result } = renderHook(() =>
      useListState({
        schema: mockSchema,
        view: mockView,
        data: mockData
      })
    )

    expect(result.current.checkboxProperty).not.toBeNull()
    expect(result.current.checkboxProperty?.name).toBe('Done')
  })

  it('should return display properties excluding title and checkbox', () => {
    const { result } = renderHook(() =>
      useListState({
        schema: mockSchema,
        view: mockView,
        data: mockData
      })
    )

    // Should only have priority (title and done are excluded)
    expect(result.current.displayProperties).toHaveLength(1)
    expect(result.current.displayProperties[0].name).toBe('Priority')
  })

  it('should return all items', () => {
    const { result } = renderHook(() =>
      useListState({
        schema: mockSchema,
        view: mockView,
        data: mockData
      })
    )

    expect(result.current.items).toHaveLength(3)
  })

  it('should handle schema without checkbox property', () => {
    const schemaWithoutCheckbox: Schema = {
      '@id': 'xnet://xnet.fyi/Note',
      '@type': 'xnet://xnet.fyi/Schema',
      name: 'Note',
      namespace: 'xnet.fyi',
      version: '1.0.0',
      properties: [
        {
          '@id': 'xnet://xnet.fyi/Note#title',
          name: 'Title',
          type: 'text',
          required: true
        },
        {
          '@id': 'xnet://xnet.fyi/Note#content',
          name: 'Content',
          type: 'text',
          required: false
        }
      ]
    }

    const { result } = renderHook(() =>
      useListState({
        schema: schemaWithoutCheckbox,
        view: mockView,
        data: [{ id: '1', title: 'Note 1', content: 'Some content' }]
      })
    )

    expect(result.current.checkboxProperty).toBeNull()
    expect(result.current.titleProperty?.name).toBe('Title')
  })

  it('should find title property by name', () => {
    const schemaWithName: Schema = {
      '@id': 'xnet://xnet.fyi/Person',
      '@type': 'xnet://xnet.fyi/Schema',
      name: 'Person',
      namespace: 'xnet.fyi',
      version: '1.0.0',
      properties: [
        {
          '@id': 'xnet://xnet.fyi/Person#name',
          name: 'Name',
          type: 'text',
          required: true
        },
        {
          '@id': 'xnet://xnet.fyi/Person#email',
          name: 'Email',
          type: 'email',
          required: false
        }
      ]
    }

    const { result } = renderHook(() =>
      useListState({
        schema: schemaWithName,
        view: mockView,
        data: [{ id: '1', name: 'John Doe', email: 'john@example.com' }]
      })
    )

    expect(result.current.titleProperty?.name).toBe('Name')
  })

  it('should limit display properties to 3', () => {
    const schemaWithManyProps: Schema = {
      '@id': 'xnet://xnet.fyi/Item',
      '@type': 'xnet://xnet.fyi/Schema',
      name: 'Item',
      namespace: 'xnet.fyi',
      version: '1.0.0',
      properties: [
        { '@id': 'xnet://xnet.fyi/Item#title', name: 'Title', type: 'text', required: true },
        { '@id': 'xnet://xnet.fyi/Item#prop1', name: 'Prop1', type: 'text', required: false },
        { '@id': 'xnet://xnet.fyi/Item#prop2', name: 'Prop2', type: 'text', required: false },
        { '@id': 'xnet://xnet.fyi/Item#prop3', name: 'Prop3', type: 'text', required: false },
        { '@id': 'xnet://xnet.fyi/Item#prop4', name: 'Prop4', type: 'text', required: false },
        { '@id': 'xnet://xnet.fyi/Item#prop5', name: 'Prop5', type: 'text', required: false }
      ]
    }

    const viewWithManyProps: ViewConfig = {
      id: 'view-1',
      name: 'List',
      type: 'list',
      visibleProperties: ['title', 'prop1', 'prop2', 'prop3', 'prop4', 'prop5'],
      sorts: []
    }

    const { result } = renderHook(() =>
      useListState({
        schema: schemaWithManyProps,
        view: viewWithManyProps,
        data: []
      })
    )

    // Should be limited to 3 display properties
    expect(result.current.displayProperties.length).toBeLessThanOrEqual(3)
  })

  it('should handle empty data', () => {
    const { result } = renderHook(() =>
      useListState({
        schema: mockSchema,
        view: mockView,
        data: []
      })
    )

    expect(result.current.items).toHaveLength(0)
    expect(result.current.titleProperty).not.toBeNull()
    expect(result.current.checkboxProperty).not.toBeNull()
  })
})
