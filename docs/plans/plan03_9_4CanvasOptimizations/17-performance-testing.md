# 17: Performance Testing

> Benchmarks and memory profiling for canvas at scale

**Duration:** 2-3 days
**Dependencies:** All previous steps
**Package:** `@xnet/canvas`

## Overview

This step establishes performance benchmarks and memory profiling to ensure the canvas meets its performance targets at scale. We test with 10k, 50k, and 100k nodes.

## Performance Targets

| Metric             | Current | Target  | Measurement       |
| ------------------ | ------- | ------- | ----------------- |
| Nodes before jank  | ~500    | 10,000+ | Frame time < 16ms |
| Edges before jank  | ~200    | 5,000+  | Frame time < 16ms |
| Pan/zoom latency   | ~5ms    | <2ms    | Performance.now() |
| Initial load (1k)  | ~500ms  | <100ms  | First paint       |
| Memory (1k nodes)  | ~50MB   | <30MB   | DevTools Memory   |
| Memory (10k nodes) | N/A     | <100MB  | DevTools Memory   |

## Implementation

### Performance Test Suite

```typescript
// packages/canvas/src/__benchmarks__/canvas.bench.ts

import { bench, describe } from 'vitest'
import { SpatialIndex } from '../index/spatial-index'
import { EdgeRenderer } from '../layers/edge-renderer'
import { ChunkManager } from '../chunks/chunk-manager'

// Test data generators
function createNodes(count: number): CanvasNode[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `node-${i}`,
    type: 'card',
    position: {
      x: (i % 100) * 150,
      y: Math.floor(i / 100) * 100,
      width: 120,
      height: 60
    },
    properties: { title: `Node ${i}` }
  }))
}

function createEdges(nodes: CanvasNode[], density: number = 0.1): CanvasEdge[] {
  const edges: CanvasEdge[] = []
  for (let i = 0; i < nodes.length - 1; i++) {
    // Connect to next node
    edges.push({
      id: `edge-${i}`,
      sourceId: nodes[i].id,
      targetId: nodes[i + 1].id
    })

    // Random additional connections
    if (Math.random() < density) {
      const target = Math.floor(Math.random() * nodes.length)
      if (target !== i) {
        edges.push({
          id: `edge-${i}-${target}`,
          sourceId: nodes[i].id,
          targetId: nodes[target].id
        })
      }
    }
  }
  return edges
}

describe('Spatial Index Benchmarks', () => {
  bench('bulk load 10k nodes', () => {
    const index = new SpatialIndex()
    const nodes = createNodes(10000)
    index.bulkLoad(nodes.map((n) => ({ id: n.id, bounds: n.position })))
  })

  bench('bulk load 100k nodes', () => {
    const index = new SpatialIndex()
    const nodes = createNodes(100000)
    index.bulkLoad(nodes.map((n) => ({ id: n.id, bounds: n.position })))
  })

  bench('viewport query 10k nodes', () => {
    const index = new SpatialIndex()
    const nodes = createNodes(10000)
    index.bulkLoad(nodes.map((n) => ({ id: n.id, bounds: n.position })))

    // Typical viewport
    index.search({
      minX: 2000,
      minY: 1000,
      maxX: 2800,
      maxY: 1600
    })
  })

  bench('viewport query 100k nodes', () => {
    const index = new SpatialIndex()
    const nodes = createNodes(100000)
    index.bulkLoad(nodes.map((n) => ({ id: n.id, bounds: n.position })))

    index.search({
      minX: 5000,
      minY: 2500,
      maxX: 5800,
      maxY: 3100
    })
  })

  bench('single update 10k nodes', () => {
    const index = new SpatialIndex()
    const nodes = createNodes(10000)
    index.bulkLoad(nodes.map((n) => ({ id: n.id, bounds: n.position })))

    index.update('node-5000', { x: 500, y: 500, width: 120, height: 60 })
    index.flush()
  })
})

describe('Edge Renderer Benchmarks', () => {
  let renderer: EdgeRenderer
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    container.style.width = '1920px'
    container.style.height = '1080px'
    document.body.appendChild(container)
    renderer = new EdgeRenderer(container)
    renderer.resize()
  })

  afterEach(() => {
    renderer.destroy()
    container.remove()
  })

  bench('render 1k edges', () => {
    const nodes = createNodes(500)
    const edges = createEdges(nodes, 0.5)
    const positions = new Map(nodes.map((n) => [n.id, n.position]))
    const viewport = {
      x: 0,
      y: 0,
      zoom: 1,
      getVisibleRect: () => ({ x: -1000, y: -600, width: 2000, height: 1200 })
    }

    renderer.render(edges, positions, viewport)
  })

  bench('render 5k edges', () => {
    const nodes = createNodes(2000)
    const edges = createEdges(nodes, 0.5)
    const positions = new Map(nodes.map((n) => [n.id, n.position]))
    const viewport = {
      x: 2500,
      y: 1000,
      zoom: 0.5,
      getVisibleRect: () => ({ x: 500, y: -100, width: 4000, height: 2200 })
    }

    renderer.render(edges, positions, viewport)
  })

  bench('render 10k edges', () => {
    const nodes = createNodes(4000)
    const edges = createEdges(nodes, 0.5)
    const positions = new Map(nodes.map((n) => [n.id, n.position]))
    const viewport = {
      x: 5000,
      y: 2000,
      zoom: 0.25,
      getVisibleRect: () => ({ x: 1400, y: -280, width: 7200, height: 4560 })
    }

    renderer.render(edges, positions, viewport)
  })
})

describe('Chunk Manager Benchmarks', () => {
  bench('load 10 chunks', async () => {
    const store = createMockStore(1000) // 1000 nodes per chunk
    const manager = new ChunkManager(
      store,
      () => {},
      () => {}
    )

    await manager.updateViewport({
      x: 0,
      y: 0,
      zoom: 0.5,
      width: 1920,
      height: 1080,
      getVisibleRect: () => ({ x: -1920, y: -1080, width: 3840, height: 2160 })
    })
  })
})
```

### Memory Profiling Utilities

```typescript
// packages/canvas/src/__benchmarks__/memory-profile.ts

interface MemorySnapshot {
  jsHeapSizeLimit: number
  totalJSHeapSize: number
  usedJSHeapSize: number
}

export function getMemoryUsage(): MemorySnapshot | null {
  if ('memory' in performance) {
    const mem = (performance as any).memory
    return {
      jsHeapSizeLimit: mem.jsHeapSizeLimit,
      totalJSHeapSize: mem.totalJSHeapSize,
      usedJSHeapSize: mem.usedJSHeapSize
    }
  }
  return null
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export async function profileMemory(label: string, fn: () => void | Promise<void>): Promise<void> {
  // Force GC if available
  if (typeof gc === 'function') {
    gc()
  }

  const before = getMemoryUsage()

  await fn()

  if (typeof gc === 'function') {
    gc()
  }

  const after = getMemoryUsage()

  if (before && after) {
    const delta = after.usedJSHeapSize - before.usedJSHeapSize
    console.log(
      `[Memory] ${label}: ${formatBytes(delta)} (${formatBytes(after.usedJSHeapSize)} total)`
    )
  }
}
```

### Frame Time Monitor

```typescript
// packages/canvas/src/utils/frame-monitor.ts

interface FrameStats {
  frameCount: number
  averageFrameTime: number
  maxFrameTime: number
  minFrameTime: number
  droppedFrames: number // frames > 16ms
}

export class FrameMonitor {
  private frameTimes: number[] = []
  private lastFrameTime = 0
  private isRunning = false
  private animationId = 0

  start(): void {
    if (this.isRunning) return
    this.isRunning = true
    this.frameTimes = []
    this.lastFrameTime = performance.now()
    this.tick()
  }

  stop(): FrameStats {
    this.isRunning = false
    cancelAnimationFrame(this.animationId)
    return this.getStats()
  }

  private tick(): void {
    if (!this.isRunning) return

    const now = performance.now()
    const frameTime = now - this.lastFrameTime
    this.frameTimes.push(frameTime)
    this.lastFrameTime = now

    this.animationId = requestAnimationFrame(() => this.tick())
  }

  getStats(): FrameStats {
    if (this.frameTimes.length === 0) {
      return {
        frameCount: 0,
        averageFrameTime: 0,
        maxFrameTime: 0,
        minFrameTime: 0,
        droppedFrames: 0
      }
    }

    const sum = this.frameTimes.reduce((a, b) => a + b, 0)
    const dropped = this.frameTimes.filter((t) => t > 16.67).length

    return {
      frameCount: this.frameTimes.length,
      averageFrameTime: sum / this.frameTimes.length,
      maxFrameTime: Math.max(...this.frameTimes),
      minFrameTime: Math.min(...this.frameTimes),
      droppedFrames: dropped
    }
  }
}
```

### Performance Test Component

```typescript
// packages/canvas/src/__benchmarks__/PerformanceTest.tsx

import { useState, useCallback } from 'react'
import { Canvas } from '../canvas'
import { FrameMonitor } from '../utils/frame-monitor'
import { getMemoryUsage, formatBytes } from './memory-profile'

export function PerformanceTest() {
  const [nodeCount, setNodeCount] = useState(1000)
  const [stats, setStats] = useState<string>('')
  const [nodes, setNodes] = useState<CanvasNode[]>([])
  const [edges, setEdges] = useState<CanvasEdge[]>([])

  const runTest = useCallback(async (count: number) => {
    const newNodes = createNodes(count)
    const newEdges = createEdges(newNodes, 0.2)
    setNodes(newNodes)
    setEdges(newEdges)

    // Wait for render
    await new Promise((r) => setTimeout(r, 100))

    // Start monitoring
    const monitor = new FrameMonitor()
    monitor.start()

    // Simulate interaction (pan)
    const canvas = document.querySelector('.canvas-container')
    if (canvas) {
      for (let i = 0; i < 60; i++) {
        // Trigger pan
        canvas.dispatchEvent(new WheelEvent('wheel', { deltaX: 10, deltaY: 5 }))
        await new Promise((r) => requestAnimationFrame(r))
      }
    }

    const frameStats = monitor.stop()
    const mem = getMemoryUsage()

    setStats(`
      Nodes: ${count}
      Edges: ${newEdges.length}
      Avg Frame: ${frameStats.averageFrameTime.toFixed(2)}ms
      Max Frame: ${frameStats.maxFrameTime.toFixed(2)}ms
      Dropped: ${frameStats.droppedFrames}
      Memory: ${mem ? formatBytes(mem.usedJSHeapSize) : 'N/A'}
    `)
  }, [])

  return (
    <div>
      <div className="controls">
        <button onClick={() => runTest(1000)}>Test 1k</button>
        <button onClick={() => runTest(5000)}>Test 5k</button>
        <button onClick={() => runTest(10000)}>Test 10k</button>
        <button onClick={() => runTest(50000)}>Test 50k</button>
      </div>

      <pre className="stats">{stats}</pre>

      <div style={{ width: '100%', height: '600px' }}>
        <Canvas nodes={nodes} edges={edges} />
      </div>
    </div>
  )
}
```

### CI Performance Tests

```typescript
// packages/canvas/src/__benchmarks__/ci-perf.test.ts

import { describe, it, expect } from 'vitest'
import { SpatialIndex } from '../index/spatial-index'

describe('CI Performance Tests', () => {
  it('spatial index query completes within budget (10k nodes)', () => {
    const index = new SpatialIndex()
    const nodes = createNodes(10000)
    index.bulkLoad(nodes.map((n) => ({ id: n.id, bounds: n.position })))

    const start = performance.now()
    index.search({ minX: 2000, minY: 1000, maxX: 2800, maxY: 1600 })
    const elapsed = performance.now() - start

    expect(elapsed).toBeLessThan(5) // < 5ms
  })

  it('bulk load completes within budget (10k nodes)', () => {
    const nodes = createNodes(10000)

    const start = performance.now()
    const index = new SpatialIndex()
    index.bulkLoad(nodes.map((n) => ({ id: n.id, bounds: n.position })))
    const elapsed = performance.now() - start

    expect(elapsed).toBeLessThan(100) // < 100ms
  })

  it('chunk eviction maintains memory limit', async () => {
    const store = createMockStore(1000)
    const manager = new ChunkManager(
      store,
      () => {},
      () => {}
    )

    // Pan across many chunks
    for (let i = 0; i < 100; i++) {
      await manager.updateViewport({
        x: i * 2048,
        y: 0,
        zoom: 1,
        width: 1920,
        height: 1080,
        getVisibleRect: () => ({ x: i * 2048 - 960, y: -540, width: 1920, height: 1080 })
      })
    }

    // Should have evicted old chunks
    expect(manager.loadedChunkCount).toBeLessThan(60)
  })
})
```

## Testing

```typescript
describe('Performance Monitoring', () => {
  it('FrameMonitor captures frame times', async () => {
    const monitor = new FrameMonitor()
    monitor.start()

    // Wait for some frames
    await new Promise((r) => setTimeout(r, 200))

    const stats = monitor.stop()

    expect(stats.frameCount).toBeGreaterThan(5)
    expect(stats.averageFrameTime).toBeGreaterThan(0)
  })

  it('memory profiling works in supported browsers', async () => {
    const mem = getMemoryUsage()

    // May be null in non-Chrome browsers
    if (mem) {
      expect(mem.usedJSHeapSize).toBeGreaterThan(0)
    }
  })
})
```

## Validation Gate

- [ ] 10k nodes renders at 60fps (avg frame < 16ms)
- [ ] 5k edges renders at 60fps
- [ ] Viewport query < 5ms for 100k nodes
- [ ] Bulk load < 500ms for 100k nodes
- [ ] Memory < 100MB for 10k nodes
- [ ] Chunk eviction keeps memory bounded
- [ ] Frame drops < 5% during pan/zoom
- [ ] CI perf tests pass consistently

---

[Back to README](./README.md) | [Previous: Worker Layout](./16-worker-layout.md) | [Next: Accessibility ->](./18-accessibility.md)
