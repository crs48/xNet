# 18: Accessibility

> Keyboard navigation and screen reader support for canvas

**Duration:** 3-4 days
**Dependencies:** [03-virtualized-node-layer.md](./03-virtualized-node-layer.md)
**Package:** `@xnet/canvas`

## Overview

The canvas must be accessible to users who rely on keyboard navigation and screen readers. This requires:

1. **Keyboard navigation** - Arrow keys to move between nodes, Enter to select
2. **Focus management** - Visible focus indicators, logical focus order
3. **Screen reader announcements** - Node descriptions, state changes
4. **High contrast mode** - Respects system preferences

## Implementation

### Keyboard Navigation

```typescript
// packages/canvas/src/accessibility/keyboard-navigation.ts

interface KeyboardNavigationOptions {
  nodes: CanvasNode[]
  selectedIds: Set<string>
  focusedId: string | null
  spatialIndex: SpatialIndex
  onFocusChange: (nodeId: string | null) => void
  onSelectionChange: (nodeIds: string[]) => void
  onNodeActivate: (nodeId: string) => void
}

export class KeyboardNavigator {
  private options: KeyboardNavigationOptions

  constructor(options: KeyboardNavigationOptions) {
    this.options = options
  }

  handleKeyDown(e: KeyboardEvent): boolean {
    const { focusedId, nodes, spatialIndex } = this.options

    switch (e.key) {
      case 'ArrowUp':
      case 'ArrowDown':
      case 'ArrowLeft':
      case 'ArrowRight':
        e.preventDefault()
        this.moveFocus(e.key)
        return true

      case 'Enter':
      case ' ':
        e.preventDefault()
        if (focusedId) {
          this.options.onNodeActivate(focusedId)
        }
        return true

      case 'Escape':
        e.preventDefault()
        this.options.onFocusChange(null)
        this.options.onSelectionChange([])
        return true

      case 'Tab':
        // Allow Tab to exit canvas
        if (!e.shiftKey && focusedId) {
          // Move to next node or exit
          const next = this.getNextNode(focusedId, 1)
          if (next) {
            e.preventDefault()
            this.options.onFocusChange(next.id)
            return true
          }
        }
        return false

      case 'a':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault()
          this.options.onSelectionChange(nodes.map((n) => n.id))
          return true
        }
        return false

      default:
        return false
    }
  }

  private moveFocus(direction: string): void {
    const { focusedId, nodes, spatialIndex } = this.options

    if (!focusedId) {
      // Focus first node
      if (nodes.length > 0) {
        this.options.onFocusChange(nodes[0].id)
      }
      return
    }

    const current = nodes.find((n) => n.id === focusedId)
    if (!current) return

    const center = {
      x: current.position.x + current.position.width / 2,
      y: current.position.y + current.position.height / 2
    }

    // Search in direction
    const searchRect = this.getSearchRect(center, direction, 2000)
    const candidates = spatialIndex
      .search(searchRect)
      .filter((id) => id !== focusedId)
      .map((id) => nodes.find((n) => n.id === id))
      .filter(Boolean) as CanvasNode[]

    if (candidates.length === 0) return

    // Find closest in direction
    const closest = this.findClosestInDirection(current, candidates, direction)
    if (closest) {
      this.options.onFocusChange(closest.id)
      this.options.onSelectionChange([closest.id])
    }
  }

  private getSearchRect(
    center: Point,
    direction: string,
    distance: number
  ): { minX: number; minY: number; maxX: number; maxY: number } {
    switch (direction) {
      case 'ArrowUp':
        return {
          minX: center.x - distance,
          minY: center.y - distance,
          maxX: center.x + distance,
          maxY: center.y
        }
      case 'ArrowDown':
        return {
          minX: center.x - distance,
          minY: center.y,
          maxX: center.x + distance,
          maxY: center.y + distance
        }
      case 'ArrowLeft':
        return {
          minX: center.x - distance,
          minY: center.y - distance,
          maxX: center.x,
          maxY: center.y + distance
        }
      case 'ArrowRight':
        return {
          minX: center.x,
          minY: center.y - distance,
          maxX: center.x + distance,
          maxY: center.y + distance
        }
      default:
        return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
    }
  }

  private findClosestInDirection(
    current: CanvasNode,
    candidates: CanvasNode[],
    direction: string
  ): CanvasNode | null {
    const currentCenter = {
      x: current.position.x + current.position.width / 2,
      y: current.position.y + current.position.height / 2
    }

    let closest: CanvasNode | null = null
    let closestDist = Infinity

    for (const candidate of candidates) {
      const candidateCenter = {
        x: candidate.position.x + candidate.position.width / 2,
        y: candidate.position.y + candidate.position.height / 2
      }

      // Check if candidate is in the right direction
      const isInDirection = this.isInDirection(currentCenter, candidateCenter, direction)
      if (!isInDirection) continue

      const dist = this.distance(currentCenter, candidateCenter)
      if (dist < closestDist) {
        closestDist = dist
        closest = candidate
      }
    }

    return closest
  }

  private isInDirection(from: Point, to: Point, direction: string): boolean {
    const dx = to.x - from.x
    const dy = to.y - from.y

    switch (direction) {
      case 'ArrowUp':
        return dy < 0 && Math.abs(dy) > Math.abs(dx) * 0.5
      case 'ArrowDown':
        return dy > 0 && Math.abs(dy) > Math.abs(dx) * 0.5
      case 'ArrowLeft':
        return dx < 0 && Math.abs(dx) > Math.abs(dy) * 0.5
      case 'ArrowRight':
        return dx > 0 && Math.abs(dx) > Math.abs(dy) * 0.5
      default:
        return false
    }
  }

  private distance(a: Point, b: Point): number {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
  }

  private getNextNode(currentId: string, direction: 1 | -1): CanvasNode | null {
    const { nodes } = this.options
    const currentIndex = nodes.findIndex((n) => n.id === currentId)
    if (currentIndex < 0) return null

    const nextIndex = currentIndex + direction
    if (nextIndex < 0 || nextIndex >= nodes.length) return null

    return nodes[nextIndex]
  }
}
```

### Focus Management Hook

```typescript
// packages/canvas/src/hooks/use-canvas-focus.ts

import { useState, useCallback, useEffect, useRef } from 'react'

interface UseCanvasFocusOptions {
  nodes: CanvasNode[]
  spatialIndex: SpatialIndex
  containerRef: React.RefObject<HTMLElement>
}

export function useCanvasFocus({ nodes, spatialIndex, containerRef }: UseCanvasFocusOptions) {
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const navigatorRef = useRef<KeyboardNavigator | null>(null)

  // Update navigator
  useEffect(() => {
    navigatorRef.current = new KeyboardNavigator({
      nodes,
      selectedIds: new Set(selectedIds),
      focusedId,
      spatialIndex,
      onFocusChange: setFocusedId,
      onSelectionChange: setSelectedIds,
      onNodeActivate: (id) => {
        // Double-click equivalent
        console.log('Activate node:', id)
      }
    })
  }, [nodes, selectedIds, focusedId, spatialIndex])

  // Handle keyboard events
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleKeyDown = (e: KeyboardEvent) => {
      navigatorRef.current?.handleKeyDown(e)
    }

    container.addEventListener('keydown', handleKeyDown)
    return () => container.removeEventListener('keydown', handleKeyDown)
  }, [containerRef])

  // Scroll focused node into view
  useEffect(() => {
    if (!focusedId) return

    const node = nodes.find((n) => n.id === focusedId)
    if (node) {
      // Dispatch event to scroll viewport
      window.dispatchEvent(new CustomEvent('canvas-focus-node', { detail: { nodeId: focusedId } }))
    }
  }, [focusedId, nodes])

  return {
    focusedId,
    selectedIds,
    setFocusedId,
    setSelectedIds
  }
}
```

### Screen Reader Announcements

```typescript
// packages/canvas/src/accessibility/announcer.ts

class Announcer {
  private liveRegion: HTMLElement

  constructor() {
    this.liveRegion = document.createElement('div')
    this.liveRegion.setAttribute('role', 'status')
    this.liveRegion.setAttribute('aria-live', 'polite')
    this.liveRegion.setAttribute('aria-atomic', 'true')
    this.liveRegion.className = 'sr-only'
    document.body.appendChild(this.liveRegion)
  }

  announce(message: string): void {
    // Clear and set to trigger announcement
    this.liveRegion.textContent = ''
    requestAnimationFrame(() => {
      this.liveRegion.textContent = message
    })
  }

  announceNodeFocus(node: CanvasNode): void {
    const type = this.getNodeTypeLabel(node.type)
    const title = node.properties?.title ?? 'Untitled'
    this.announce(`${type}: ${title}`)
  }

  announceSelection(count: number): void {
    if (count === 0) {
      this.announce('Selection cleared')
    } else if (count === 1) {
      this.announce('1 node selected')
    } else {
      this.announce(`${count} nodes selected`)
    }
  }

  announceCanvasStats(nodeCount: number, edgeCount: number): void {
    this.announce(`Canvas with ${nodeCount} nodes and ${edgeCount} connections`)
  }

  private getNodeTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      card: 'Card',
      mermaid: 'Diagram',
      embed: 'Embedded content',
      shape: 'Shape',
      checklist: 'Checklist',
      swimlane: 'Swimlane'
    }
    return labels[type] ?? 'Node'
  }

  destroy(): void {
    this.liveRegion.remove()
  }
}

export const announcer = new Announcer()
```

### Accessible Node Component

```typescript
// packages/canvas/src/components/accessible-node.tsx

interface AccessibleNodeProps {
  node: CanvasNode
  isFocused: boolean
  isSelected: boolean
  tabIndex: number
  onFocus: () => void
}

export function AccessibleNode({
  node,
  isFocused,
  isSelected,
  tabIndex,
  onFocus
}: AccessibleNodeProps) {
  const title = node.properties?.title ?? 'Untitled'
  const type = node.type

  return (
    <div
      role="button"
      tabIndex={tabIndex}
      aria-label={`${type}: ${title}`}
      aria-selected={isSelected}
      aria-describedby={`node-desc-${node.id}`}
      onFocus={onFocus}
      className={`
        canvas-node
        ${isFocused ? 'focused' : ''}
        ${isSelected ? 'selected' : ''}
      `}
      style={{
        // Focus ring
        outline: isFocused ? '2px solid #3b82f6' : 'none',
        outlineOffset: '2px'
      }}
    >
      {/* Hidden description for screen readers */}
      <span id={`node-desc-${node.id}`} className="sr-only">
        {getNodeDescription(node)}
      </span>

      {/* Visible content */}
      <NodeContent node={node} />
    </div>
  )
}

function getNodeDescription(node: CanvasNode): string {
  const parts = [
    `Position: ${Math.round(node.position.x)}, ${Math.round(node.position.y)}`,
    `Size: ${node.position.width} by ${node.position.height}`
  ]

  if (node.type === 'checklist') {
    const items = node.properties?.items ?? []
    const checked = items.filter((i: any) => i.checked).length
    parts.push(`${checked} of ${items.length} items completed`)
  }

  return parts.join('. ')
}
```

### High Contrast Mode

```typescript
// packages/canvas/src/hooks/use-high-contrast.ts

import { useState, useEffect } from 'react'

export function useHighContrast(): boolean {
  const [isHighContrast, setIsHighContrast] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-contrast: more)')

    setIsHighContrast(mediaQuery.matches)

    const handler = (e: MediaQueryListEvent) => {
      setIsHighContrast(e.matches)
    }

    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [])

  return isHighContrast
}

// High contrast styles
export const highContrastStyles = {
  node: {
    border: '2px solid black',
    backgroundColor: 'white'
  },
  edge: {
    stroke: 'black',
    strokeWidth: 2
  },
  selection: {
    outline: '3px solid blue',
    outlineOffset: '2px'
  },
  focus: {
    outline: '3px dashed black',
    outlineOffset: '4px'
  }
}
```

### Skip Link

```typescript
// packages/canvas/src/components/skip-link.tsx

interface SkipLinkProps {
  targetId: string
  children: React.ReactNode
}

export function SkipLink({ targetId, children }: SkipLinkProps) {
  return (
    <a
      href={`#${targetId}`}
      className="skip-link"
      style={{
        position: 'absolute',
        left: '-9999px',
        top: 'auto',
        width: '1px',
        height: '1px',
        overflow: 'hidden',
        // Show on focus
        ':focus': {
          position: 'fixed',
          top: '8px',
          left: '8px',
          width: 'auto',
          height: 'auto',
          padding: '8px 16px',
          backgroundColor: 'white',
          border: '2px solid black',
          zIndex: 9999
        }
      }}
    >
      {children}
    </a>
  )
}
```

## Testing

```typescript
describe('Keyboard Navigation', () => {
  it('moves focus with arrow keys', () => {
    const nodes = [
      { id: 'a', position: { x: 0, y: 0, width: 100, height: 50 } },
      { id: 'b', position: { x: 200, y: 0, width: 100, height: 50 } },
      { id: 'c', position: { x: 0, y: 100, width: 100, height: 50 } }
    ]

    const onFocusChange = vi.fn()

    const navigator = new KeyboardNavigator({
      nodes,
      selectedIds: new Set(),
      focusedId: 'a',
      spatialIndex: createSpatialIndex(nodes),
      onFocusChange,
      onSelectionChange: vi.fn(),
      onNodeActivate: vi.fn()
    })

    navigator.handleKeyDown(new KeyboardEvent('keydown', { key: 'ArrowRight' }))

    expect(onFocusChange).toHaveBeenCalledWith('b')
  })

  it('selects node on Enter', () => {
    const onNodeActivate = vi.fn()

    const navigator = new KeyboardNavigator({
      nodes: [{ id: 'a', position: { x: 0, y: 0, width: 100, height: 50 } }],
      selectedIds: new Set(),
      focusedId: 'a',
      spatialIndex: createSpatialIndex([]),
      onFocusChange: vi.fn(),
      onSelectionChange: vi.fn(),
      onNodeActivate
    })

    navigator.handleKeyDown(new KeyboardEvent('keydown', { key: 'Enter' }))

    expect(onNodeActivate).toHaveBeenCalledWith('a')
  })

  it('clears selection on Escape', () => {
    const onSelectionChange = vi.fn()
    const onFocusChange = vi.fn()

    const navigator = new KeyboardNavigator({
      nodes: [],
      selectedIds: new Set(['a', 'b']),
      focusedId: 'a',
      spatialIndex: createSpatialIndex([]),
      onFocusChange,
      onSelectionChange,
      onNodeActivate: vi.fn()
    })

    navigator.handleKeyDown(new KeyboardEvent('keydown', { key: 'Escape' }))

    expect(onSelectionChange).toHaveBeenCalledWith([])
    expect(onFocusChange).toHaveBeenCalledWith(null)
  })
})

describe('Screen Reader', () => {
  it('announces node focus', () => {
    const node = {
      id: 'a',
      type: 'card',
      properties: { title: 'My Card' }
    }

    announcer.announceNodeFocus(node as any)

    const liveRegion = document.querySelector('[role="status"]')
    expect(liveRegion?.textContent).toBe('Card: My Card')
  })

  it('announces selection count', () => {
    announcer.announceSelection(3)

    const liveRegion = document.querySelector('[role="status"]')
    expect(liveRegion?.textContent).toBe('3 nodes selected')
  })
})

describe('High Contrast', () => {
  it('detects high contrast preference', () => {
    // Mock matchMedia
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: query === '(prefers-contrast: more)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }))

    const { result } = renderHook(() => useHighContrast())

    expect(result.current).toBe(true)
  })
})
```

## Validation Gate

- [ ] Arrow keys navigate between nodes
- [ ] Enter/Space activates focused node
- [ ] Tab exits canvas to next focusable
- [ ] Ctrl+A selects all nodes
- [ ] Escape clears selection
- [ ] Focus indicator visible on keyboard focus
- [ ] Screen reader announces node focus
- [ ] Screen reader announces selection changes
- [ ] High contrast mode applies correct styles
- [ ] Skip link available to bypass canvas
- [ ] All interactive elements have accessible names

---

[Back to README](./README.md) | [Previous: Performance Testing](./17-performance-testing.md)
