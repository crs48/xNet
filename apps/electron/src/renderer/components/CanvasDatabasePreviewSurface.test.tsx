/**
 * @vitest-environment jsdom
 */

import type { CanvasNode } from '@xnetjs/canvas'
import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { CanvasDatabasePreviewSurface } from './CanvasDatabasePreviewSurface'

const mockUseNode = vi.fn()
const mockUseDatabaseDoc = vi.fn()
const mockUseDatabase = vi.fn()
const mockUseIdentity = vi.fn()

vi.mock('@xnetjs/data', () => ({
  DatabaseSchema: {
    _schemaId: 'xnet://xnet.fyi/Database'
  }
}))

vi.mock('@xnetjs/react', () => ({
  useNode: (...args: unknown[]) => mockUseNode(...args),
  useDatabaseDoc: (...args: unknown[]) => mockUseDatabaseDoc(...args),
  useDatabase: (...args: unknown[]) => mockUseDatabase(...args),
  useIdentity: (...args: unknown[]) => mockUseIdentity(...args)
}))

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
})

function createRows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `row-${index + 1}`,
    sortKey: String(index + 1).padStart(4, '0'),
    cells: {
      title: `Task ${index + 1}`,
      status: index % 2 === 0 ? 'todo' : 'done',
      owner: `Owner ${index + 1}`
    },
    createdAt: 0,
    createdBy: 'did:key:test'
  }))
}

function createNode(overrides: Partial<CanvasNode> = {}): CanvasNode {
  return {
    id: 'canvas-db',
    type: 'database',
    position: { x: 0, y: 0, width: 420, height: 320 },
    properties: { title: 'Roadmap DB' },
    ...overrides
  } as CanvasNode
}

describe('CanvasDatabasePreviewSurface', () => {
  beforeEach(() => {
    mockUseIdentity.mockReturnValue({ did: 'did:key:test' })
    mockUseNode.mockReturnValue({
      data: {
        id: 'db-1',
        title: 'Roadmap DB',
        rowCount: 40,
        defaultView: 'table'
      },
      loading: false,
      update: vi.fn()
    })
    mockUseDatabaseDoc.mockReturnValue({
      columns: [
        { id: 'title', name: 'Title', type: 'text', isTitle: true, width: 240, config: {} },
        {
          id: 'status',
          name: 'Status',
          type: 'select',
          width: 140,
          config: {
            options: [
              { id: 'todo', name: 'Todo' },
              { id: 'done', name: 'Done' }
            ]
          }
        },
        { id: 'owner', name: 'Owner', type: 'text', width: 180, config: {} }
      ],
      views: [{ id: 'table-view', name: 'Table', type: 'table' }],
      loading: false,
      createColumn: vi.fn(),
      createView: vi.fn()
    })
  })

  it('renders a bounded virtual preview window and exposes split/open actions', () => {
    mockUseDatabase.mockReturnValue({
      rows: createRows(24),
      loading: false,
      loadingMore: false,
      hasMore: false,
      loadMore: vi.fn(),
      activeView: { id: 'table-view', name: 'Table', type: 'table' }
    })

    const onOpenDocument = vi.fn()
    const onSplitDocument = vi.fn()

    const { container } = render(
      <CanvasDatabasePreviewSurface
        node={createNode()}
        docId="db-1"
        onOpenDocument={onOpenDocument}
        onSplitDocument={onSplitDocument}
      />
    )

    expect(screen.getByRole('button', { name: 'Split' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open' })).toBeTruthy()
    expect(container.querySelectorAll('[data-canvas-database-row="true"]').length).toBeLessThan(24)
    expect(
      container
        .querySelector('[data-canvas-database-rows="true"]')
        ?.getAttribute('data-canvas-database-preview-total')
    ).toBe('24')
    expect(screen.getByText('Showing 24 of 40')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Split' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))

    expect(onSplitDocument).toHaveBeenCalledWith('db-1')
    expect(onOpenDocument).toHaveBeenCalledWith('db-1')
  })

  it('loads more preview rows when scrolling near the bottom of the bounded window', () => {
    const loadMore = vi.fn()
    mockUseDatabase.mockReturnValue({
      rows: createRows(12),
      loading: false,
      loadingMore: false,
      hasMore: true,
      loadMore,
      activeView: { id: 'table-view', name: 'Table', type: 'table' }
    })

    const { container } = render(
      <CanvasDatabasePreviewSurface node={createNode()} docId="db-1" onSplitDocument={vi.fn()} />
    )

    const rowsContainer = container.querySelector<HTMLElement>('[data-canvas-database-rows="true"]')
    expect(rowsContainer).toBeTruthy()

    Object.defineProperty(rowsContainer as HTMLElement, 'clientHeight', {
      configurable: true,
      value: 220
    })
    Object.defineProperty(rowsContainer as HTMLElement, 'scrollHeight', {
      configurable: true,
      value: 620
    })

    fireEvent.scroll(rowsContainer as HTMLElement, { target: { scrollTop: 420 } })

    expect(loadMore).toHaveBeenCalledOnce()
  })
})
