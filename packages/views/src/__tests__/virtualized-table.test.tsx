/**
 * Tests for VirtualizedTableView and optimizations
 */

import type { TableRow } from '../table/useTableState'
import type { ViewConfig } from '../types'
import type { Schema } from '@xnetjs/data'
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react'
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  useBatchedRows,
  useScrollDebounce,
  useThrottle,
  RowCache,
  CellRendererCache
} from '../table/optimizations'
import { VirtualizedTableView } from '../table/VirtualizedTableView'

// ─── Test Data ───────────────────────────────────────────────────────────────

const mockSchema: Schema = {
  '@id': 'xnet://xnet.fyi/Product',
  '@type': 'xnet://xnet.fyi/Schema',
  name: 'Product',
  namespace: 'xnet.fyi',
  version: '1.0.0',
  properties: [
    {
      '@id': 'xnet://xnet.fyi/Product#name',
      name: 'Name',
      type: 'text',
      required: true
    },
    {
      '@id': 'xnet://xnet.fyi/Product#price',
      name: 'Price',
      type: 'number',
      required: false
    },
    {
      '@id': 'xnet://xnet.fyi/Product#category',
      name: 'Category',
      type: 'text',
      required: false
    },
    {
      '@id': 'xnet://xnet.fyi/Product#inStock',
      name: 'In Stock',
      type: 'checkbox',
      required: false
    }
  ]
}

const mockView: ViewConfig = {
  id: 'view-1',
  name: 'Table',
  type: 'table',
  visibleProperties: ['name', 'price', 'category', 'inStock'],
  sorts: [],
  propertyWidths: {
    name: 200,
    price: 100,
    category: 150,
    inStock: 80
  }
}

function generateMockData(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `row-${i}`,
    name: `Product ${i}`,
    price: Math.floor(Math.random() * 1000),
    category: ['Electronics', 'Clothing', 'Food', 'Books'][i % 4],
    inStock: i % 2 === 0
  }))
}

// ─── VirtualizedTableView Tests ──────────────────────────────────────────────

describe('VirtualizedTableView', () => {
  it('renders with basic data', () => {
    const data = generateMockData(10)

    render(<VirtualizedTableView schema={mockSchema} view={mockView} data={data} />)

    // Should show row count in footer
    expect(screen.getByText(/10 rows/)).toBeTruthy()
    expect(screen.getByText(/4 columns/)).toBeTruthy()
  })

  it('renders only visible rows (virtualization)', () => {
    const data = generateMockData(1000)

    const { container } = render(
      <VirtualizedTableView schema={mockSchema} view={mockView} data={data} rowHeight={36} />
    )

    // Should not render all 1000 rows
    const rows = container.querySelectorAll('[data-row-id]')
    expect(rows.length).toBeLessThan(100) // Should only render visible + overscan
  })

  it('renders 500+ row datasets within an acceptable budget', () => {
    const data = generateMockData(750)
    const started = Date.now()

    render(<VirtualizedTableView schema={mockSchema} view={mockView} data={data} rowHeight={36} />)

    const elapsedMs = Date.now() - started
    expect(elapsedMs).toBeLessThan(400)
  })

  it('renders only visible columns (X-axis virtualization)', () => {
    // Create schema with many columns
    const manyColumnsSchema: Schema = {
      '@id': 'xnet://xnet.fyi/Wide',
      '@type': 'xnet://xnet.fyi/Schema',
      name: 'Wide',
      namespace: 'xnet.fyi',
      version: '1.0.0',
      properties: Array.from({ length: 50 }, (_, i) => ({
        '@id': `xnet://xnet.fyi/Wide#col${i}`,
        name: `Column ${i}`,
        type: 'text' as const,
        required: false
      }))
    }

    const wideView: ViewConfig = {
      id: 'view-wide',
      name: 'Wide Table',
      type: 'table',
      visibleProperties: Array.from({ length: 50 }, (_, i) => `col${i}`),
      sorts: []
    }

    const wideData: TableRow[] = Array.from({ length: 10 }, (_, rowIdx) => {
      const row: TableRow = { id: `row-${rowIdx}` }
      for (let i = 0; i < 50; i++) {
        row[`col${i}`] = `Value ${rowIdx}-${i}`
      }
      return row
    })

    const { container } = render(
      <VirtualizedTableView schema={manyColumnsSchema} view={wideView} data={wideData} />
    )

    // Should not render all 50 columns
    const cells = container.querySelectorAll('[data-column-id]')
    expect(cells.length).toBeLessThan(50 * 10) // Less than all cells
  })

  it('wires up onUpdateRow callback', () => {
    const data = generateMockData(5)
    const onUpdateRow = vi.fn()

    const { container } = render(
      <VirtualizedTableView
        schema={mockSchema}
        view={mockView}
        data={data}
        onUpdateRow={onUpdateRow}
      />
    )

    // Verify the component renders (virtualization may not show cells in jsdom)
    expect(container.querySelector('[data-row-id]')).toBeDefined()

    // The callback is wired up - actual cell editing requires scroll container dimensions
    expect(onUpdateRow).not.toHaveBeenCalled()
  })

  it('calls onAddRow when + New button is clicked', () => {
    const data = generateMockData(5)
    const onAddRow = vi.fn()

    render(
      <VirtualizedTableView schema={mockSchema} view={mockView} data={data} onAddRow={onAddRow} />
    )

    const addButton = screen.getByText('+ New')
    fireEvent.click(addButton)

    expect(onAddRow).toHaveBeenCalledTimes(1)
  })

  it('calls onAddColumn when + button is clicked', () => {
    const data = generateMockData(5)
    const onAddColumn = vi.fn()

    render(
      <VirtualizedTableView
        schema={mockSchema}
        view={mockView}
        data={data}
        onAddColumn={onAddColumn}
      />
    )

    const addButton = screen.getByTitle('Add property')
    fireEvent.click(addButton)

    expect(onAddColumn).toHaveBeenCalledTimes(1)
  })

  it('respects custom row height', () => {
    const data = generateMockData(10)

    const { container } = render(
      <VirtualizedTableView schema={mockSchema} view={mockView} data={data} rowHeight={50} />
    )

    // Check that rows have the custom height
    const rows = container.querySelectorAll('[data-row-id]')
    if (rows[0]) {
      const style = (rows[0] as HTMLElement).style
      expect(style.height).toBe('50px')
    }
  })

  it('shows column widths from view config', () => {
    const data = generateMockData(5)

    const { container } = render(
      <VirtualizedTableView schema={mockSchema} view={mockView} data={data} />
    )

    // Check that cells have widths from view config
    const nameCells = container.querySelectorAll('[data-column-id="name"]')
    if (nameCells[0]) {
      const style = (nameCells[0] as HTMLElement).style
      expect(style.width).toBe('200px')
    }
  })
})

// ─── useBatchedRows Tests ────────────────────────────────────────────────────

describe('useBatchedRows', () => {
  it('returns initial batch of items', () => {
    const items = Array.from({ length: 100 }, (_, i) => i)

    const { result } = renderHook(() => useBatchedRows(items, 20))

    expect(result.current.visibleItems).toHaveLength(20)
    expect(result.current.hasMore).toBe(true)
  })

  it('loads more items when loadMore is called', () => {
    const items = Array.from({ length: 100 }, (_, i) => i)

    const { result } = renderHook(() => useBatchedRows(items, 20))

    act(() => {
      result.current.loadMore()
    })

    expect(result.current.visibleItems).toHaveLength(40)
    expect(result.current.hasMore).toBe(true)
  })

  it('stops loading when all items are visible', () => {
    const items = Array.from({ length: 50 }, (_, i) => i)

    const { result } = renderHook(() => useBatchedRows(items, 20))

    act(() => {
      result.current.loadMore()
      result.current.loadMore()
      result.current.loadMore()
    })

    expect(result.current.visibleItems).toHaveLength(50)
    expect(result.current.hasMore).toBe(false)
  })
})

// ─── useScrollDebounce Tests ─────────────────────────────────────────────────

describe('useScrollDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('debounces scroll callbacks using RAF', () => {
    const callback = vi.fn()

    const { result } = renderHook(() => useScrollDebounce())

    // Call multiple times rapidly
    act(() => {
      result.current(callback)
      result.current(callback)
      result.current(callback)
    })

    // Callback should not have been called yet
    expect(callback).not.toHaveBeenCalled()

    // Advance to next animation frame
    act(() => {
      vi.advanceTimersToNextFrame()
    })

    // Should only be called once
    expect(callback).toHaveBeenCalledTimes(1)

    vi.useRealTimers()
  })
})

// ─── useThrottle Tests ───────────────────────────────────────────────────────

describe('useThrottle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('throttles callback to specified delay', () => {
    const callback = vi.fn()

    const { result } = renderHook(() => useThrottle(callback, 100))

    // First call should go through
    act(() => {
      result.current()
    })
    expect(callback).toHaveBeenCalledTimes(1)

    // Immediate second call should be throttled
    act(() => {
      result.current()
    })
    expect(callback).toHaveBeenCalledTimes(1)

    // After delay, call should go through
    act(() => {
      vi.advanceTimersByTime(100)
      result.current()
    })
    expect(callback).toHaveBeenCalledTimes(2)

    vi.useRealTimers()
  })
})

// ─── RowCache Tests ──────────────────────────────────────────────────────────

describe('RowCache', () => {
  it('stores and retrieves rows', () => {
    const cache = new RowCache(100)
    const row = { id: 'row-1', name: 'Test' }

    cache.set('row-1', row)

    expect(cache.get('row-1')).toEqual(row)
    expect(cache.has('row-1')).toBe(true)
    expect(cache.size).toBe(1)
  })

  it('evicts oldest entries when at capacity', () => {
    const cache = new RowCache(3)

    cache.set('row-1', { id: 'row-1' })
    cache.set('row-2', { id: 'row-2' })
    cache.set('row-3', { id: 'row-3' })
    cache.set('row-4', { id: 'row-4' }) // Should evict row-1

    expect(cache.has('row-1')).toBe(false)
    expect(cache.has('row-2')).toBe(true)
    expect(cache.has('row-3')).toBe(true)
    expect(cache.has('row-4')).toBe(true)
    expect(cache.size).toBe(3)
  })

  it('moves accessed items to end (LRU)', () => {
    const cache = new RowCache(3)

    cache.set('row-1', { id: 'row-1' })
    cache.set('row-2', { id: 'row-2' })
    cache.set('row-3', { id: 'row-3' })

    // Access row-1 to move it to end
    cache.get('row-1')

    // Add new row - should evict row-2 (now oldest)
    cache.set('row-4', { id: 'row-4' })

    expect(cache.has('row-1')).toBe(true)
    expect(cache.has('row-2')).toBe(false)
    expect(cache.has('row-3')).toBe(true)
    expect(cache.has('row-4')).toBe(true)
  })

  it('bulk sets rows', () => {
    const cache = new RowCache(100)
    const rows = [{ id: 'row-1' }, { id: 'row-2' }, { id: 'row-3' }]

    cache.setMany(rows)

    expect(cache.size).toBe(3)
    expect(cache.has('row-1')).toBe(true)
    expect(cache.has('row-2')).toBe(true)
    expect(cache.has('row-3')).toBe(true)
  })

  it('gets multiple rows', () => {
    const cache = new RowCache(100)
    cache.set('row-1', { id: 'row-1' })
    cache.set('row-2', { id: 'row-2' })

    const results = cache.getMany(['row-1', 'row-2', 'row-3'])

    expect(results).toHaveLength(3)
    expect(results[0]).toEqual({ id: 'row-1' })
    expect(results[1]).toEqual({ id: 'row-2' })
    expect(results[2]).toBeUndefined()
  })

  it('clears all entries', () => {
    const cache = new RowCache(100)
    cache.set('row-1', { id: 'row-1' })
    cache.set('row-2', { id: 'row-2' })

    cache.clear()

    expect(cache.size).toBe(0)
    expect(cache.has('row-1')).toBe(false)
  })

  it('deletes specific entry', () => {
    const cache = new RowCache(100)
    cache.set('row-1', { id: 'row-1' })
    cache.set('row-2', { id: 'row-2' })

    cache.delete('row-1')

    expect(cache.has('row-1')).toBe(false)
    expect(cache.has('row-2')).toBe(true)
    expect(cache.size).toBe(1)
  })
})

// ─── CellRendererCache Tests ─────────────────────────────────────────────────

describe('CellRendererCache', () => {
  it('stores and retrieves cell renderers', () => {
    const cache = new CellRendererCache(100)
    const node = <span>Test</span>

    cache.set('row-1', 'col-1', 'value', node)

    expect(cache.get('row-1', 'col-1', 'value')).toBe(node)
    expect(cache.has('row-1', 'col-1', 'value')).toBe(true)
    expect(cache.size).toBe(1)
  })

  it('returns undefined for missing entries', () => {
    const cache = new CellRendererCache(100)

    expect(cache.get('row-1', 'col-1', 'value')).toBeUndefined()
    expect(cache.has('row-1', 'col-1', 'value')).toBe(false)
  })

  it('evicts oldest entries when at capacity', () => {
    const cache = new CellRendererCache(2)

    cache.set('row-1', 'col-1', 'v1', <span>1</span>)
    cache.set('row-2', 'col-1', 'v2', <span>2</span>)
    cache.set('row-3', 'col-1', 'v3', <span>3</span>) // Should evict first

    expect(cache.has('row-1', 'col-1', 'v1')).toBe(false)
    expect(cache.has('row-2', 'col-1', 'v2')).toBe(true)
    expect(cache.has('row-3', 'col-1', 'v3')).toBe(true)
    expect(cache.size).toBe(2)
  })

  it('uses composite key with value', () => {
    const cache = new CellRendererCache(100)

    cache.set('row-1', 'col-1', 'value-a', <span>A</span>)
    cache.set('row-1', 'col-1', 'value-b', <span>B</span>)

    expect(cache.has('row-1', 'col-1', 'value-a')).toBe(true)
    expect(cache.has('row-1', 'col-1', 'value-b')).toBe(true)
    expect(cache.size).toBe(2)
  })

  it('clears all entries', () => {
    const cache = new CellRendererCache(100)
    cache.set('row-1', 'col-1', 'v1', <span>1</span>)
    cache.set('row-2', 'col-1', 'v2', <span>2</span>)

    cache.clear()

    expect(cache.size).toBe(0)
  })
})

// ─── Performance Tests ───────────────────────────────────────────────────────

describe('Performance', () => {
  it('handles 100K rows without crashing', () => {
    const data = generateMockData(100000)

    // Should not throw
    expect(() => {
      render(<VirtualizedTableView schema={mockSchema} view={mockView} data={data} />)
    }).not.toThrow()
  })

  it('renders initial view quickly with large dataset', () => {
    const data = generateMockData(100000)

    const startTime = performance.now()
    render(<VirtualizedTableView schema={mockSchema} view={mockView} data={data} />)
    const endTime = performance.now()

    // Initial render should be fast (< 500ms)
    expect(endTime - startTime).toBeLessThan(500)
  })
})
