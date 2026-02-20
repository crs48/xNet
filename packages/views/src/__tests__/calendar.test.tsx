/**
 * Tests for calendar view components
 */

import type { ViewConfig } from '../types'
import type { Schema } from '@xnet/data'
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import {
  useCalendarState,
  isSameDay,
  getWeekStart,
  getMonthWeeks,
  getDayNames,
  formatCurrentDate,
  getHours,
  formatHour
} from '../calendar/useCalendarState'

// Mock schema with date properties
const mockSchema: Schema = {
  '@id': 'xnet://xnet.fyi/Event',
  '@type': 'xnet://xnet.fyi/Schema',
  name: 'Event',
  namespace: 'xnet.fyi',
  properties: [
    {
      '@id': 'xnet://xnet.fyi/Event#title',
      name: 'Title',
      type: 'text',
      required: true
    },
    {
      '@id': 'xnet://xnet.fyi/Event#date',
      name: 'Date',
      type: 'date',
      required: true
    },
    {
      '@id': 'xnet://xnet.fyi/Event#endDate',
      name: 'End Date',
      type: 'date',
      required: false
    },
    {
      '@id': 'xnet://xnet.fyi/Event#category',
      name: 'Category',
      type: 'select',
      required: false,
      config: {
        options: [
          { id: 'meeting', name: 'Meeting', color: '#3b82f6' },
          { id: 'deadline', name: 'Deadline', color: '#ef4444' },
          { id: 'personal', name: 'Personal', color: '#22c55e' }
        ]
      }
    }
  ]
}

const now = Date.now()
const day = 86400000

const mockView: ViewConfig = {
  id: 'view-1',
  name: 'Calendar',
  type: 'calendar',
  visibleProperties: ['title', 'date', 'endDate', 'category'],
  sorts: [],
  dateProperty: 'date',
  endDateProperty: 'endDate'
}

const mockData = [
  { id: '1', title: 'Team Meeting', date: now, endDate: now + 2 * 3600000, category: 'meeting' },
  { id: '2', title: 'Project Deadline', date: now + 2 * day, category: 'deadline' },
  { id: '3', title: 'Birthday Party', date: now + 7 * day, category: 'personal' }
]

describe('useCalendarState', () => {
  it('should process items into events', () => {
    const { result } = renderHook(() =>
      useCalendarState({
        schema: mockSchema,
        view: mockView,
        data: mockData
      })
    )

    expect(result.current.events).toHaveLength(3)
    expect(result.current.events[0].title).toBe('Team Meeting')
    expect(result.current.events[0].date).toEqual(new Date(now))
  })

  it('should filter items without dates', () => {
    const dataWithMissing = [...mockData, { id: '4', title: 'No Date Event', date: null }]

    const { result } = renderHook(() =>
      useCalendarState({
        schema: mockSchema,
        view: mockView,
        data: dataWithMissing
      })
    )

    expect(result.current.events).toHaveLength(3)
  })

  it('should assign colors from select property', () => {
    const { result } = renderHook(() =>
      useCalendarState({
        schema: mockSchema,
        view: mockView,
        data: mockData
      })
    )

    // Team Meeting has category 'meeting' with color '#3b82f6'
    const meeting = result.current.events.find((e) => e.id === '1')
    expect(meeting?.color).toBe('#3b82f6')

    // Deadline has category 'deadline' with color '#ef4444'
    const deadline = result.current.events.find((e) => e.id === '2')
    expect(deadline?.color).toBe('#ef4444')
  })

  it('should default to month view mode', () => {
    const { result } = renderHook(() =>
      useCalendarState({
        schema: mockSchema,
        view: mockView,
        data: mockData
      })
    )

    expect(result.current.viewMode).toBe('month')
  })

  it('should change view mode', () => {
    const { result } = renderHook(() =>
      useCalendarState({
        schema: mockSchema,
        view: mockView,
        data: mockData
      })
    )

    act(() => {
      result.current.setViewMode('week')
    })

    expect(result.current.viewMode).toBe('week')

    act(() => {
      result.current.setViewMode('day')
    })

    expect(result.current.viewMode).toBe('day')
  })

  it('should navigate to previous period (month)', () => {
    const { result } = renderHook(() =>
      useCalendarState({
        schema: mockSchema,
        view: mockView,
        data: mockData
      })
    )

    const initialMonth = result.current.currentDate.getMonth()

    act(() => {
      result.current.navigatePrev()
    })

    // Should go back one month
    const expectedMonth = (initialMonth - 1 + 12) % 12
    expect(result.current.currentDate.getMonth()).toBe(expectedMonth)
  })

  it('should navigate to next period (month)', () => {
    const { result } = renderHook(() =>
      useCalendarState({
        schema: mockSchema,
        view: mockView,
        data: mockData
      })
    )

    const initialMonth = result.current.currentDate.getMonth()

    act(() => {
      result.current.navigateNext()
    })

    // Should go forward one month
    const expectedMonth = (initialMonth + 1) % 12
    expect(result.current.currentDate.getMonth()).toBe(expectedMonth)
  })

  it('should navigate by week when in week mode', () => {
    const { result } = renderHook(() =>
      useCalendarState({
        schema: mockSchema,
        view: mockView,
        data: mockData
      })
    )

    act(() => {
      result.current.setViewMode('week')
    })

    const initialDate = result.current.currentDate.getDate()

    act(() => {
      result.current.navigateNext()
    })

    // Should go forward 7 days
    expect(result.current.currentDate.getDate()).toBe(initialDate + 7)
  })

  it('should navigate by day when in day mode', () => {
    const { result } = renderHook(() =>
      useCalendarState({
        schema: mockSchema,
        view: mockView,
        data: mockData
      })
    )

    act(() => {
      result.current.setViewMode('day')
    })

    const initialDate = result.current.currentDate.getDate()

    act(() => {
      result.current.navigateNext()
    })

    // Should go forward 1 day
    expect(result.current.currentDate.getDate()).toBe(initialDate + 1)
  })

  it('should navigate to today', () => {
    const { result } = renderHook(() =>
      useCalendarState({
        schema: mockSchema,
        view: mockView,
        data: mockData
      })
    )

    // Move away from today
    act(() => {
      result.current.navigateNext()
      result.current.navigateNext()
    })

    // Navigate away, then back to today
    act(() => {
      result.current.navigateToday()
    })

    const today = new Date()
    expect(isSameDay(result.current.currentDate, today)).toBe(true)
  })

  it('should move event to new date', () => {
    const onUpdateRow = vi.fn()

    const { result } = renderHook(() =>
      useCalendarState({
        schema: mockSchema,
        view: mockView,
        data: mockData,
        onUpdateRow
      })
    )

    const newDate = new Date(now + 5 * day)

    act(() => {
      result.current.moveEvent('1', newDate)
    })

    expect(onUpdateRow).toHaveBeenCalledWith('1', 'date', newDate.getTime())
  })

  it('should handle empty data', () => {
    const { result } = renderHook(() =>
      useCalendarState({
        schema: mockSchema,
        view: mockView,
        data: []
      })
    )

    expect(result.current.events).toHaveLength(0)
    expect(result.current.currentDate).toBeDefined()
  })

  it('should return empty events when no date property configured', () => {
    const viewWithoutDate: ViewConfig = {
      ...mockView,
      dateProperty: undefined
    }

    const { result } = renderHook(() =>
      useCalendarState({
        schema: mockSchema,
        view: viewWithoutDate,
        data: mockData
      })
    )

    expect(result.current.events).toHaveLength(0)
    expect(result.current.datePropertyKey).toBeUndefined()
  })
})

describe('isSameDay', () => {
  it('should return true for same day', () => {
    const a = new Date('2024-06-15T10:00:00')
    const b = new Date('2024-06-15T23:59:59')
    expect(isSameDay(a, b)).toBe(true)
  })

  it('should return false for different days', () => {
    const a = new Date('2024-06-15T10:00:00')
    const b = new Date('2024-06-16T10:00:00')
    expect(isSameDay(a, b)).toBe(false)
  })

  it('should return false for different months', () => {
    const a = new Date('2024-06-15')
    const b = new Date('2024-07-15')
    expect(isSameDay(a, b)).toBe(false)
  })

  it('should return false for different years', () => {
    const a = new Date('2024-06-15')
    const b = new Date('2025-06-15')
    expect(isSameDay(a, b)).toBe(false)
  })
})

describe('getWeekStart', () => {
  it('should get week start for Sunday (weekStartsOn=0)', () => {
    // Create a specific Wednesday in local time
    const date = new Date(2024, 5, 19) // June 19, 2024 (Wednesday)
    const start = getWeekStart(date, 0)
    expect(start.getDay()).toBe(0) // Sunday
    // The week containing June 19 (Wed) starts on June 16 (Sun)
    expect(start.getDate()).toBe(16)
    expect(start.getMonth()).toBe(5) // June
  })

  it('should get week start for Monday (weekStartsOn=1)', () => {
    const date = new Date(2024, 5, 19) // June 19, 2024 (Wednesday)
    const start = getWeekStart(date, 1)
    expect(start.getDay()).toBe(1) // Monday
    // The week containing June 19 (Wed) starts on June 17 (Mon)
    expect(start.getDate()).toBe(17)
    expect(start.getMonth()).toBe(5) // June
  })

  it('should get week start for Saturday (weekStartsOn=6)', () => {
    const date = new Date(2024, 5, 19) // June 19, 2024 (Wednesday)
    const start = getWeekStart(date, 6)
    expect(start.getDay()).toBe(6) // Saturday
    // The week containing June 19 (Wed) starts on June 15 (Sat)
    expect(start.getDate()).toBe(15)
    expect(start.getMonth()).toBe(5) // June
  })

  it('should return same day if already at week start', () => {
    const date = new Date(2024, 5, 16) // June 16, 2024 (Sunday)
    const start = getWeekStart(date, 0)
    expect(start.getDay()).toBe(0)
    expect(start.getDate()).toBe(16)
    expect(start.getMonth()).toBe(5) // June
  })
})

describe('getMonthWeeks', () => {
  it('should return 6 weeks for a month', () => {
    const date = new Date('2024-06-15')
    const weeks = getMonthWeeks(date, 0)
    expect(weeks).toHaveLength(6)
  })

  it('should have 7 days in each week', () => {
    const date = new Date('2024-06-15')
    const weeks = getMonthWeeks(date, 0)
    weeks.forEach((week) => {
      expect(week).toHaveLength(7)
    })
  })

  it('should start from correct day based on weekStartsOn', () => {
    const date = new Date('2024-06-15')
    const weeks = getMonthWeeks(date, 0)
    expect(weeks[0][0].getDay()).toBe(0) // Sunday
  })

  it('should include days from previous/next month for complete weeks', () => {
    const date = new Date('2024-06-15') // June 2024 starts on Saturday
    const weeks = getMonthWeeks(date, 0)

    // First week should include May days (May 26-31)
    const firstDay = weeks[0][0]
    expect(firstDay.getMonth()).toBe(4) // May (0-indexed)
  })
})

describe('getDayNames', () => {
  it('should return short day names starting from Sunday', () => {
    const names = getDayNames(0, 'short')
    expect(names).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])
  })

  it('should return short day names starting from Monday', () => {
    const names = getDayNames(1, 'short')
    expect(names).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
  })

  it('should return long day names', () => {
    const names = getDayNames(0, 'long')
    expect(names).toEqual([
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday'
    ])
  })

  it('should return long day names starting from Saturday', () => {
    const names = getDayNames(6, 'long')
    expect(names).toEqual([
      'Saturday',
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday'
    ])
  })
})

describe('formatCurrentDate', () => {
  it('should format month view date', () => {
    const date = new Date(2024, 5, 15)
    const formatted = formatCurrentDate(date, 'month')
    expect(formatted).toBe('June 2024')
  })

  it('should format week view date range', () => {
    const date = new Date(2024, 5, 19) // Wednesday
    const formatted = formatCurrentDate(date, 'week')
    // Should show week range like "Jun 16 - Jun 22, 2024"
    expect(formatted).toContain('Jun')
    expect(formatted).toContain('2024')
    expect(formatted).toContain('-')
  })

  it('should format day view date', () => {
    const date = new Date(2024, 5, 15)
    const formatted = formatCurrentDate(date, 'day')
    // Should show full date like "Saturday, June 15, 2024"
    expect(formatted).toContain('Saturday')
    expect(formatted).toContain('June')
    expect(formatted).toContain('15')
    expect(formatted).toContain('2024')
  })
})

describe('getHours', () => {
  it('should return 24 hours (0-23)', () => {
    const hours = getHours()
    expect(hours).toHaveLength(24)
    expect(hours[0]).toBe(0)
    expect(hours[23]).toBe(23)
  })
})

describe('formatHour', () => {
  it('should format midnight as 12 AM', () => {
    expect(formatHour(0)).toBe('12 AM')
  })

  it('should format noon as 12 PM', () => {
    expect(formatHour(12)).toBe('12 PM')
  })

  it('should format morning hours with AM', () => {
    expect(formatHour(9)).toBe('9 AM')
    expect(formatHour(11)).toBe('11 AM')
  })

  it('should format afternoon hours with PM', () => {
    expect(formatHour(13)).toBe('1 PM')
    expect(formatHour(18)).toBe('6 PM')
    expect(formatHour(23)).toBe('11 PM')
  })
})
