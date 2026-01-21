/**
 * Tests for timeline view components
 */

import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  useTimelineState,
  getDatePosition,
  getDateWidth,
  ZOOM_CONFIGS
} from '../timeline/useTimelineState'
import type { Schema } from '@xnet/data'
import type { ViewConfig } from '../types'

// Mock schema with date properties
const mockSchema: Schema = {
  '@id': 'xnet://xnet.dev/Task',
  '@type': 'xnet://xnet.dev/Schema',
  name: 'Task',
  namespace: 'xnet.dev',
  properties: [
    {
      '@id': 'xnet://xnet.dev/Task#title',
      name: 'Title',
      type: 'text',
      required: true
    },
    {
      '@id': 'xnet://xnet.dev/Task#startDate',
      name: 'Start Date',
      type: 'date',
      required: true
    },
    {
      '@id': 'xnet://xnet.dev/Task#endDate',
      name: 'End Date',
      type: 'date',
      required: false
    },
    {
      '@id': 'xnet://xnet.dev/Task#status',
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

const now = Date.now()
const day = 86400000

const mockView: ViewConfig = {
  id: 'view-1',
  name: 'Timeline',
  type: 'timeline',
  visibleProperties: ['title', 'startDate', 'endDate', 'status'],
  sorts: [],
  dateProperty: 'startDate',
  endDateProperty: 'endDate'
}

const mockData = [
  { id: '1', title: 'Task 1', startDate: now, endDate: now + 3 * day, status: 'todo' },
  { id: '2', title: 'Task 2', startDate: now + 2 * day, endDate: now + 5 * day, status: 'doing' },
  { id: '3', title: 'Task 3', startDate: now + 7 * day, endDate: now + 10 * day, status: 'done' }
]

describe('useTimelineState', () => {
  it('should process items with dates', () => {
    const { result } = renderHook(() =>
      useTimelineState({
        schema: mockSchema,
        view: mockView,
        data: mockData
      })
    )

    expect(result.current.items).toHaveLength(3)
    expect(result.current.items[0].title).toBe('Task 1')
    expect(result.current.items[0].startDate).toEqual(new Date(now))
    expect(result.current.items[0].endDate).toEqual(new Date(now + 3 * day))
  })

  it('should sort items by start date', () => {
    const { result } = renderHook(() =>
      useTimelineState({
        schema: mockSchema,
        view: mockView,
        data: mockData
      })
    )

    const startDates = result.current.items.map((i) => i.startDate.getTime())
    expect(startDates).toEqual([...startDates].sort((a, b) => a - b))
  })

  it('should calculate date range with padding', () => {
    const { result } = renderHook(() =>
      useTimelineState({
        schema: mockSchema,
        view: mockView,
        data: mockData
      })
    )

    // Should have 7-day padding on each side
    expect(result.current.range.start.getTime()).toBeLessThan(now)
    expect(result.current.range.end.getTime()).toBeGreaterThan(now + 10 * day)
  })

  it('should default to week zoom level', () => {
    const { result } = renderHook(() =>
      useTimelineState({
        schema: mockSchema,
        view: mockView,
        data: mockData
      })
    )

    expect(result.current.zoom).toBe('week')
    expect(result.current.zoomConfig).toEqual(ZOOM_CONFIGS.week)
  })

  it('should change zoom level', () => {
    const { result } = renderHook(() =>
      useTimelineState({
        schema: mockSchema,
        view: mockView,
        data: mockData
      })
    )

    act(() => {
      result.current.setZoom('day')
    })

    expect(result.current.zoom).toBe('day')
    expect(result.current.zoomConfig).toEqual(ZOOM_CONFIGS.day)
  })

  it('should filter items without dates', () => {
    const dataWithMissing = [
      ...mockData,
      { id: '4', title: 'No Date Task', startDate: null, endDate: null }
    ]

    const { result } = renderHook(() =>
      useTimelineState({
        schema: mockSchema,
        view: mockView,
        data: dataWithMissing
      })
    )

    expect(result.current.items).toHaveLength(3)
  })

  it('should assign colors from select property', () => {
    const { result } = renderHook(() =>
      useTimelineState({
        schema: mockSchema,
        view: mockView,
        data: mockData
      })
    )

    // Task 3 has status 'done' with color '#81c784'
    const doneTask = result.current.items.find((i) => i.id === '3')
    expect(doneTask?.color).toBe('#81c784')
  })

  it('should use default end date if not provided', () => {
    const viewWithoutEndDate: ViewConfig = {
      ...mockView,
      endDateProperty: undefined
    }

    const dataWithoutEndDate = [{ id: '1', title: 'Task 1', startDate: now }]

    const { result } = renderHook(() =>
      useTimelineState({
        schema: mockSchema,
        view: viewWithoutEndDate,
        data: dataWithoutEndDate
      })
    )

    // Should default to 1 day duration
    const item = result.current.items[0]
    expect(item.endDate.getTime() - item.startDate.getTime()).toBe(day)
  })

  it('should update item dates', () => {
    const onUpdateRow = vi.fn()

    const { result } = renderHook(() =>
      useTimelineState({
        schema: mockSchema,
        view: mockView,
        data: mockData,
        onUpdateRow
      })
    )

    const newStart = new Date(now + day)
    const newEnd = new Date(now + 4 * day)

    act(() => {
      result.current.updateItemDates('1', newStart, newEnd)
    })

    expect(onUpdateRow).toHaveBeenCalledTimes(2)
    expect(onUpdateRow).toHaveBeenCalledWith('1', 'startDate', newStart.getTime())
    expect(onUpdateRow).toHaveBeenCalledWith('1', 'endDate', newEnd.getTime())
  })

  it('should handle empty data', () => {
    const { result } = renderHook(() =>
      useTimelineState({
        schema: mockSchema,
        view: mockView,
        data: []
      })
    )

    expect(result.current.items).toHaveLength(0)
    expect(result.current.range.start).toBeDefined()
    expect(result.current.range.end).toBeDefined()
  })
})

describe('getDatePosition', () => {
  const range = {
    start: new Date('2024-01-01'),
    end: new Date('2024-01-31')
  }

  it('should calculate position for date at start', () => {
    const pos = getDatePosition(new Date('2024-01-01'), range, ZOOM_CONFIGS.day)
    expect(pos).toBe(0)
  })

  it('should calculate position for date in middle', () => {
    const pos = getDatePosition(new Date('2024-01-11'), range, ZOOM_CONFIGS.day)
    // 10 days * 40px/day = 400px
    expect(pos).toBe(400)
  })
})

describe('getDateWidth', () => {
  it('should calculate width for 1 day', () => {
    const width = getDateWidth(new Date('2024-01-01'), new Date('2024-01-02'), ZOOM_CONFIGS.day)
    expect(width).toBe(40) // 1 day * 40px/day
  })

  it('should calculate width for 7 days', () => {
    const width = getDateWidth(new Date('2024-01-01'), new Date('2024-01-08'), ZOOM_CONFIGS.day)
    expect(width).toBe(280) // 7 days * 40px/day
  })

  it('should return minimum width of 1 day', () => {
    const width = getDateWidth(new Date('2024-01-01'), new Date('2024-01-01'), ZOOM_CONFIGS.day)
    expect(width).toBe(40) // Minimum 1 day
  })
})

describe('ZOOM_CONFIGS', () => {
  it('should have day configuration', () => {
    expect(ZOOM_CONFIGS.day).toEqual({
      unitWidth: 40,
      gridInterval: 1,
      headerFormat: 'day'
    })
  })

  it('should have week configuration', () => {
    expect(ZOOM_CONFIGS.week).toEqual({
      unitWidth: 120,
      gridInterval: 7,
      headerFormat: 'week'
    })
  })

  it('should have month configuration', () => {
    expect(ZOOM_CONFIGS.month).toEqual({
      unitWidth: 100,
      gridInterval: 30,
      headerFormat: 'month'
    })
  })

  it('should have quarter configuration', () => {
    expect(ZOOM_CONFIGS.quarter).toEqual({
      unitWidth: 150,
      gridInterval: 90,
      headerFormat: 'year'
    })
  })
})
