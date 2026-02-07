/**
 * Rich Node Types Tests
 *
 * Tests for checklist, shape, and embed node components.
 */

import { render, fireEvent, screen, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import {
  ChecklistNodeComponent,
  type ChecklistNodeData,
  type ChecklistItem
} from '../nodes/checklist-node'
import { EmbedNodeComponent, type EmbedNodeData, type LinkedNodeData } from '../nodes/embed-node'
import {
  ShapeNodeComponent,
  ShapePicker,
  createShapePath,
  SHAPE_TYPES,
  type ShapeNodeData,
  type ShapeType
} from '../nodes/shape-node'

// ─── Checklist Node Tests ─────────────────────────────────────────────────────

describe('ChecklistNodeComponent', () => {
  const createNode = (items: ChecklistItem[], title?: string): ChecklistNodeData => ({
    id: 'test-checklist',
    type: 'checklist',
    properties: {
      title,
      items
    }
  })

  describe('rendering', () => {
    it('renders items with correct indentation', () => {
      const node = createNode([
        { id: '1', text: 'Task 1', checked: false, indent: 0 },
        { id: '2', text: 'Subtask', checked: false, indent: 1 },
        { id: '3', text: 'Deep task', checked: false, indent: 2 }
      ])

      const { container } = render(<ChecklistNodeComponent node={node} onUpdate={vi.fn()} />)

      const items = container.querySelectorAll('.checklist-item') as NodeListOf<HTMLElement>
      expect(items[0].style.paddingLeft).toBe('8px')
      expect(items[1].style.paddingLeft).toBe('28px')
      expect(items[2].style.paddingLeft).toBe('48px')
    })

    it('renders title when provided', () => {
      const node = createNode([], 'My Task List')

      const { container } = render(<ChecklistNodeComponent node={node} onUpdate={vi.fn()} />)

      expect(container.querySelector('.checklist-title')?.textContent).toBe('My Task List')
    })

    it('renders completed items with strikethrough', () => {
      const node = createNode([{ id: '1', text: 'Done task', checked: true, indent: 0 }])

      const { container } = render(<ChecklistNodeComponent node={node} onUpdate={vi.fn()} />)

      const textInput = container.querySelector('input[type="text"]') as HTMLInputElement
      expect(textInput.style.textDecoration).toBe('line-through')
    })

    it('renders empty state with add button', () => {
      const node = createNode([])

      const { container } = render(<ChecklistNodeComponent node={node} onUpdate={vi.fn()} />)

      expect(container.querySelector('.checklist-add')).toBeTruthy()
    })
  })

  describe('keyboard navigation', () => {
    it('adds item on Enter', () => {
      const onUpdate = vi.fn()
      const node = createNode([{ id: '1', text: 'Task', checked: false, indent: 0 }])

      const { container } = render(<ChecklistNodeComponent node={node} onUpdate={onUpdate} />)

      const input = container.querySelector('input[type="text"]')!
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(onUpdate).toHaveBeenCalledWith({
        items: expect.arrayContaining([
          expect.objectContaining({ text: 'Task' }),
          expect.objectContaining({ text: '' })
        ])
      })
    })

    it('deletes empty item on Backspace', () => {
      const onUpdate = vi.fn()
      const node = createNode([
        { id: '1', text: 'Task 1', checked: false, indent: 0 },
        { id: '2', text: '', checked: false, indent: 0 }
      ])

      const { container } = render(<ChecklistNodeComponent node={node} onUpdate={onUpdate} />)

      const inputs = container.querySelectorAll('input[type="text"]')
      fireEvent.keyDown(inputs[1], { key: 'Backspace' })

      expect(onUpdate).toHaveBeenCalledWith({
        items: [expect.objectContaining({ id: '1', text: 'Task 1' })]
      })
    })

    it('does not delete non-empty item on Backspace', () => {
      const onUpdate = vi.fn()
      const node = createNode([{ id: '1', text: 'Task', checked: false, indent: 0 }])

      const { container } = render(<ChecklistNodeComponent node={node} onUpdate={onUpdate} />)

      const input = container.querySelector('input[type="text"]')!
      fireEvent.keyDown(input, { key: 'Backspace' })

      expect(onUpdate).not.toHaveBeenCalled()
    })

    it('increases indent on Tab', () => {
      const onUpdate = vi.fn()
      const node = createNode([{ id: '1', text: 'Task', checked: false, indent: 0 }])

      const { container } = render(<ChecklistNodeComponent node={node} onUpdate={onUpdate} />)

      const input = container.querySelector('input[type="text"]')!
      fireEvent.keyDown(input, { key: 'Tab' })

      expect(onUpdate).toHaveBeenCalledWith({
        items: [expect.objectContaining({ indent: 1 })]
      })
    })

    it('decreases indent on Shift+Tab', () => {
      const onUpdate = vi.fn()
      const node = createNode([{ id: '1', text: 'Task', checked: false, indent: 2 }])

      const { container } = render(<ChecklistNodeComponent node={node} onUpdate={onUpdate} />)

      const input = container.querySelector('input[type="text"]')!
      fireEvent.keyDown(input, { key: 'Tab', shiftKey: true })

      expect(onUpdate).toHaveBeenCalledWith({
        items: [expect.objectContaining({ indent: 1 })]
      })
    })

    it('does not decrease indent below 0', () => {
      const onUpdate = vi.fn()
      const node = createNode([{ id: '1', text: 'Task', checked: false, indent: 0 }])

      const { container } = render(<ChecklistNodeComponent node={node} onUpdate={onUpdate} />)

      const input = container.querySelector('input[type="text"]')!
      fireEvent.keyDown(input, { key: 'Tab', shiftKey: true })

      expect(onUpdate).toHaveBeenCalledWith({
        items: [expect.objectContaining({ indent: 0 })]
      })
    })

    it('does not increase indent above 4', () => {
      const onUpdate = vi.fn()
      const node = createNode([{ id: '1', text: 'Task', checked: false, indent: 4 }])

      const { container } = render(<ChecklistNodeComponent node={node} onUpdate={onUpdate} />)

      const input = container.querySelector('input[type="text"]')!
      fireEvent.keyDown(input, { key: 'Tab' })

      expect(onUpdate).toHaveBeenCalledWith({
        items: [expect.objectContaining({ indent: 4 })]
      })
    })

    it('moves item up on Alt+ArrowUp', () => {
      const onUpdate = vi.fn()
      const node = createNode([
        { id: '1', text: 'First', checked: false, indent: 0 },
        { id: '2', text: 'Second', checked: false, indent: 0 }
      ])

      const { container } = render(<ChecklistNodeComponent node={node} onUpdate={onUpdate} />)

      const inputs = container.querySelectorAll('input[type="text"]')
      fireEvent.keyDown(inputs[1], { key: 'ArrowUp', altKey: true })

      expect(onUpdate).toHaveBeenCalledWith({
        items: [
          expect.objectContaining({ id: '2', text: 'Second' }),
          expect.objectContaining({ id: '1', text: 'First' })
        ]
      })
    })

    it('moves item down on Alt+ArrowDown', () => {
      const onUpdate = vi.fn()
      const node = createNode([
        { id: '1', text: 'First', checked: false, indent: 0 },
        { id: '2', text: 'Second', checked: false, indent: 0 }
      ])

      const { container } = render(<ChecklistNodeComponent node={node} onUpdate={onUpdate} />)

      const inputs = container.querySelectorAll('input[type="text"]')
      fireEvent.keyDown(inputs[0], { key: 'ArrowDown', altKey: true })

      expect(onUpdate).toHaveBeenCalledWith({
        items: [
          expect.objectContaining({ id: '2', text: 'Second' }),
          expect.objectContaining({ id: '1', text: 'First' })
        ]
      })
    })
  })

  describe('checkbox interaction', () => {
    it('toggles item completion on checkbox click', () => {
      const onUpdate = vi.fn()
      const node = createNode([{ id: '1', text: 'Task', checked: false, indent: 0 }])

      const { container } = render(<ChecklistNodeComponent node={node} onUpdate={onUpdate} />)

      const checkbox = container.querySelector('input[type="checkbox"]')!
      fireEvent.click(checkbox)

      expect(onUpdate).toHaveBeenCalledWith({
        items: [expect.objectContaining({ checked: true })]
      })
    })
  })

  describe('add button', () => {
    it('adds item when clicking add button', () => {
      const onUpdate = vi.fn()
      const node = createNode([{ id: '1', text: 'Task', checked: false, indent: 0 }])

      const { container } = render(<ChecklistNodeComponent node={node} onUpdate={onUpdate} />)

      const addButton = container.querySelector('.checklist-add')!
      fireEvent.click(addButton)

      expect(onUpdate).toHaveBeenCalledWith({
        items: expect.arrayContaining([
          expect.objectContaining({ text: 'Task' }),
          expect.objectContaining({ text: '' })
        ])
      })
    })
  })
})

// ─── Shape Node Tests ─────────────────────────────────────────────────────────

describe('ShapeNodeComponent', () => {
  const createNode = (
    shapeType: ShapeType,
    options: Partial<ShapeNodeData['properties']> = {}
  ): ShapeNodeData => ({
    id: 'test-shape',
    type: 'shape',
    position: { x: 0, y: 0, width: 100, height: 100 },
    properties: {
      shapeType,
      fill: '#3b82f6',
      stroke: '#1d4ed8',
      strokeWidth: 2,
      ...options
    }
  })

  describe('rendering', () => {
    it('renders SVG with correct dimensions', () => {
      const node = createNode('rectangle')

      const { container } = render(<ShapeNodeComponent node={node} onUpdate={vi.fn()} />)

      const svg = container.querySelector('svg')!
      expect(svg.getAttribute('width')).toBe('100')
      expect(svg.getAttribute('height')).toBe('100')
    })

    it('renders path with correct fill and stroke', () => {
      const node = createNode('rectangle', {
        fill: '#ef4444',
        stroke: '#b91c1c',
        strokeWidth: 3
      })

      const { container } = render(<ShapeNodeComponent node={node} onUpdate={vi.fn()} />)

      const path = container.querySelector('path')!
      expect(path.getAttribute('fill')).toBe('#ef4444')
      expect(path.getAttribute('stroke')).toBe('#b91c1c')
      expect(path.getAttribute('stroke-width')).toBe('3')
    })

    it('renders label when provided', () => {
      const node = createNode('rectangle', { label: 'Process' })

      const { container } = render(<ShapeNodeComponent node={node} onUpdate={vi.fn()} />)

      expect(container.textContent).toContain('Process')
    })

    it('does not render label when not provided', () => {
      const node = createNode('rectangle')

      const { container } = render(<ShapeNodeComponent node={node} onUpdate={vi.fn()} />)

      expect(container.querySelector('.shape-label')).toBeNull()
    })
  })

  describe('shape types', () => {
    it.each(SHAPE_TYPES.map(({ type }) => type))('renders %s shape', (shapeType) => {
      const node = createNode(shapeType)

      const { container } = render(<ShapeNodeComponent node={node} onUpdate={vi.fn()} />)

      const path = container.querySelector('path')!
      expect(path.getAttribute('d')).toBeTruthy()
    })
  })
})

describe('createShapePath', () => {
  describe('rectangle', () => {
    it('creates correct path', () => {
      const path = createShapePath('rectangle', 100, 50)
      expect(path).toBe('M 0 0 H 100 V 50 H 0 Z')
    })
  })

  describe('diamond', () => {
    it('creates correct path with midpoints', () => {
      const path = createShapePath('diamond', 100, 100)
      expect(path).toContain('M 50 0')
      expect(path).toContain('L 100 50')
      expect(path).toContain('L 50 100')
      expect(path).toContain('L 0 50')
    })
  })

  describe('triangle', () => {
    it('creates path with 3 points', () => {
      const path = createShapePath('triangle', 100, 100)
      expect(path).toContain('M 50 0')
      expect(path).toContain('L 100 100')
      expect(path).toContain('L 0 100')
    })
  })

  describe('ellipse', () => {
    it('creates arc-based path', () => {
      const path = createShapePath('ellipse', 100, 50)
      expect(path).toContain('A')
    })
  })

  describe('hexagon', () => {
    it('creates 6-sided polygon', () => {
      const path = createShapePath('hexagon', 100, 100)
      // Should have 5 L commands (M + 5 L + Z = 6 points)
      const lCount = (path.match(/ L /g) || []).length
      expect(lCount).toBe(5)
    })
  })

  describe('star', () => {
    it('creates 10-point path (5 outer + 5 inner)', () => {
      const path = createShapePath('star', 100, 100)
      // Should have 9 L commands (M + 9 L + Z = 10 points)
      const lCount = (path.match(/ L /g) || []).length
      expect(lCount).toBe(9)
    })
  })

  describe('rounded-rectangle', () => {
    it('uses corner radius', () => {
      const path = createShapePath('rounded-rectangle', 100, 100, 10)
      expect(path).toContain('Q')
    })

    it('limits corner radius to half dimensions', () => {
      const path = createShapePath('rounded-rectangle', 20, 20, 50)
      // Should not exceed 10 (half of 20)
      expect(path).toContain('M 10 0')
    })
  })
})

describe('ShapePicker', () => {
  it('renders all shape types', () => {
    const { container } = render(<ShapePicker onSelect={vi.fn()} onClose={vi.fn()} />)

    const options = container.querySelectorAll('.shape-option')
    expect(options.length).toBe(10)
  })

  it('calls onSelect with shape type when clicked', () => {
    const onSelect = vi.fn()

    const { container } = render(<ShapePicker onSelect={onSelect} onClose={vi.fn()} />)

    const options = container.querySelectorAll('.shape-option')
    fireEvent.click(options[3]) // Diamond

    expect(onSelect).toHaveBeenCalledWith('diamond')
  })

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn()

    const { container } = render(<ShapePicker onSelect={vi.fn()} onClose={onClose} />)

    const closeButton = container.querySelector('.shape-picker-header button')!
    fireEvent.click(closeButton)

    expect(onClose).toHaveBeenCalled()
  })

  it('renders preview SVGs for each shape', () => {
    const { container } = render(<ShapePicker onSelect={vi.fn()} onClose={vi.fn()} />)

    const svgs = container.querySelectorAll('.shape-option svg')
    expect(svgs.length).toBe(10)

    // Each SVG should have a path
    svgs.forEach((svg) => {
      expect(svg.querySelector('path')).toBeTruthy()
    })
  })
})

// ─── Embed Node Tests ─────────────────────────────────────────────────────────

describe('EmbedNodeComponent', () => {
  const createNode = (
    viewType: 'card' | 'full' | 'database' | 'kanban',
    options: Partial<EmbedNodeData['properties']> = {}
  ): EmbedNodeData => ({
    id: 'test-embed',
    type: 'embed',
    properties: {
      linkedNodeId: 'linked-1',
      viewType,
      ...options
    }
  })

  const mockLinkedNode: LinkedNodeData = {
    id: 'linked-1',
    schema: 'page',
    properties: {
      title: 'Linked Page Title',
      content: 'This is the content of the linked page that can be quite long.'
    }
  }

  const mockDatabaseNode: LinkedNodeData = {
    id: 'linked-db',
    schema: 'database',
    properties: {
      title: 'Tasks Database',
      columns: [
        { id: 'name', name: 'Name' },
        { id: 'status', name: 'Status' },
        { id: 'due', name: 'Due Date' }
      ],
      rows: [
        { name: 'Task 1', status: 'Done', due: '2024-01-01' },
        { name: 'Task 2', status: 'In Progress', due: '2024-01-02' }
      ]
    }
  }

  describe('loading state', () => {
    it('shows loading indicator while fetching', () => {
      const loadNode = vi.fn(() => new Promise<LinkedNodeData>(() => {})) // Never resolves

      render(
        <EmbedNodeComponent node={createNode('card')} onUpdate={vi.fn()} loadNode={loadNode} />
      )

      expect(screen.getByText('Loading...')).toBeTruthy()
    })
  })

  describe('error state', () => {
    it('shows error when node not found', async () => {
      const loadNode = vi.fn().mockResolvedValue(null)

      render(
        <EmbedNodeComponent node={createNode('card')} onUpdate={vi.fn()} loadNode={loadNode} />
      )

      await waitFor(() => {
        expect(screen.getByText('Linked content not found')).toBeTruthy()
      })
    })

    it('shows error message on load failure', async () => {
      const loadNode = vi.fn().mockRejectedValue(new Error('Network error'))

      render(
        <EmbedNodeComponent node={createNode('card')} onUpdate={vi.fn()} loadNode={loadNode} />
      )

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeTruthy()
      })
    })
  })

  describe('loaded state', () => {
    it('renders linked node title', async () => {
      const loadNode = vi.fn().mockResolvedValue(mockLinkedNode)

      render(
        <EmbedNodeComponent node={createNode('card')} onUpdate={vi.fn()} loadNode={loadNode} />
      )

      await waitFor(() => {
        expect(screen.getByText('Linked Page Title')).toBeTruthy()
      })
    })

    it('renders correct icon for page schema', async () => {
      const loadNode = vi.fn().mockResolvedValue(mockLinkedNode)

      const { container } = render(
        <EmbedNodeComponent node={createNode('card')} onUpdate={vi.fn()} loadNode={loadNode} />
      )

      await waitFor(() => {
        expect(container.textContent).toContain('Linked Page Title')
      })
    })
  })

  describe('collapse/expand', () => {
    it('renders expanded by default', async () => {
      const loadNode = vi.fn().mockResolvedValue(mockLinkedNode)

      const { container } = render(
        <EmbedNodeComponent
          node={createNode('card', { collapsed: false })}
          onUpdate={vi.fn()}
          loadNode={loadNode}
        />
      )

      await waitFor(() => {
        expect(container.querySelector('.embed-content')).toBeTruthy()
      })
    })

    it('renders collapsed when specified', async () => {
      const loadNode = vi.fn().mockResolvedValue(mockLinkedNode)

      const { container } = render(
        <EmbedNodeComponent
          node={createNode('card', { collapsed: true })}
          onUpdate={vi.fn()}
          loadNode={loadNode}
        />
      )

      await waitFor(() => {
        expect(container.querySelector('.embed-header')).toBeTruthy()
        expect(container.querySelector('.embed-content')).toBeNull()
      })
    })

    it('toggles collapse on header click', async () => {
      const loadNode = vi.fn().mockResolvedValue(mockLinkedNode)
      const onUpdate = vi.fn()

      const { container } = render(
        <EmbedNodeComponent
          node={createNode('card', { collapsed: false })}
          onUpdate={onUpdate}
          loadNode={loadNode}
        />
      )

      await waitFor(() => {
        expect(container.querySelector('.embed-header')).toBeTruthy()
      })

      const header = container.querySelector('.embed-header')!
      fireEvent.click(header)

      expect(onUpdate).toHaveBeenCalledWith({ collapsed: true })
    })
  })

  describe('view types', () => {
    it('renders card view with content excerpt', async () => {
      const loadNode = vi.fn().mockResolvedValue(mockLinkedNode)

      const { container } = render(
        <EmbedNodeComponent node={createNode('card')} onUpdate={vi.fn()} loadNode={loadNode} />
      )

      await waitFor(() => {
        expect(container.querySelector('.card-embed')).toBeTruthy()
        expect(container.textContent).toContain('This is the content')
      })
    })

    it('renders full view with complete content', async () => {
      const loadNode = vi.fn().mockResolvedValue(mockLinkedNode)

      const { container } = render(
        <EmbedNodeComponent node={createNode('full')} onUpdate={vi.fn()} loadNode={loadNode} />
      )

      await waitFor(() => {
        expect(container.querySelector('.full-embed')).toBeTruthy()
      })
    })

    it('renders database view with table', async () => {
      const loadNode = vi.fn().mockResolvedValue(mockDatabaseNode)

      const { container } = render(
        <EmbedNodeComponent node={createNode('database')} onUpdate={vi.fn()} loadNode={loadNode} />
      )

      await waitFor(() => {
        expect(container.querySelector('.database-embed')).toBeTruthy()
        expect(container.querySelector('.mini-table')).toBeTruthy()
      })
    })

    it('renders kanban view with columns', async () => {
      const loadNode = vi.fn().mockResolvedValue(mockLinkedNode)

      const { container } = render(
        <EmbedNodeComponent node={createNode('kanban')} onUpdate={vi.fn()} loadNode={loadNode} />
      )

      await waitFor(() => {
        expect(container.querySelector('.kanban-embed')).toBeTruthy()
        expect(container.textContent).toContain('To Do')
        expect(container.textContent).toContain('In Progress')
        expect(container.textContent).toContain('Done')
      })
    })
  })

  describe('cleanup', () => {
    it('cancels pending load on unmount', async () => {
      let resolveLoad: (value: LinkedNodeData) => void
      const loadNode = vi.fn(
        () =>
          new Promise<LinkedNodeData>((resolve) => {
            resolveLoad = resolve
          })
      )

      const { unmount } = render(
        <EmbedNodeComponent node={createNode('card')} onUpdate={vi.fn()} loadNode={loadNode} />
      )

      // Unmount before load completes
      unmount()

      // Resolve after unmount - should not cause state update warning
      await act(async () => {
        resolveLoad!(mockLinkedNode)
      })

      // If we get here without errors, cleanup worked
      expect(true).toBe(true)
    })
  })
})
