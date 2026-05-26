/**
 * Canvas v3 performance validation tests for universal media boards.
 */

import type { CanvasNode } from '../types'
import type { CanvasObjectKind, CanvasObjectRecord } from '@xnetjs/canvas-core'
import { describe, expect, it } from 'vitest'
import { buildCanvasPerformanceScene } from '../fixtures/performance-scene'
import {
  createCanvasPreviewGenerationBenchmarkSources,
  measureCanvasPreviewGenerationBenchmark
} from '../preview/benchmarks'
import { createCanvasDisplayList } from '../renderer/display-list'
import {
  type DomIslandCandidate,
  type DomIslandPoolBudgets,
  planDomIslandPool
} from '../renderer/dom-island-pool'
import { createMinimapSummaryFromCanvasScene } from '../scene/minimap-summary'
import { isCanvasObjectKind } from '../scene/node-kind'
import { createCanvasSmartSnap } from '../selection/snap-guides'
import { createViewport } from '../spatial'
import { createNode } from '../store'

const LARGE_SCENE_COLUMNS = 100
const LARGE_SCENE_ROWS = 100
const LARGE_SCENE_NODE_COUNT = LARGE_SCENE_COLUMNS * LARGE_SCENE_ROWS
const PERFORMANCE_BUDGETS = {
  largeSceneBuildMs: { local: 2_000, ci: 5_000 },
  minimapSummaryMs: { local: 2_000, ci: 5_000 }
}

function getPerformanceBudget(localBudgetMs: number, ciBudgetMs: number): number {
  return process.env.CI ? ciBudgetMs : localBudgetMs
}

function createIncrementingClock(stepMs: number): () => number {
  let now = 0

  return () => {
    now += stepMs
    return now
  }
}

function createLargeMixedScene() {
  return buildCanvasPerformanceScene({
    columns: LARGE_SCENE_COLUMNS,
    rows: LARGE_SCENE_ROWS,
    includeEdges: false,
    includeGroups: false
  })
}

function getObjectKind(node: CanvasNode): CanvasObjectKind {
  return isCanvasObjectKind(node.type) ? node.type : 'shape'
}

function getNodeTitle(node: CanvasNode): string {
  return String(node.properties.title ?? node.id)
}

function createObjectRecord(node: CanvasNode): CanvasObjectRecord {
  return {
    id: node.id,
    kind: getObjectKind(node),
    sourceNodeId: node.sourceNodeId,
    sourceSchemaId: node.sourceSchemaId,
    position: {
      x: node.position.x,
      y: node.position.y,
      width: node.position.width,
      height: node.position.height,
      rotation: node.position.rotation,
      zIndex: node.position.zIndex
    },
    display: {},
    preview: {
      title: getNodeTitle(node),
      subtitle: String(node.properties.subtitle ?? node.type)
    }
  }
}

function createCandidate(node: CanvasNode, index: number): DomIslandCandidate {
  const kind = getObjectKind(node)
  const isIframeCandidate = kind === 'external-reference'

  return {
    object: createObjectRecord(node),
    screenRect: {
      x: (index % 120) * 18,
      y: Math.floor(index / 120) * 14,
      width: kind === 'media' ? 420 : 260,
      height: kind === 'media' ? 260 : 180
    },
    selected: kind === 'external-reference' || index % 997 === 0,
    focused: index === 42,
    editing: index === 84,
    liveIframe: isIframeCandidate,
    distanceToViewportCenterPx: index
  }
}

function countSourceKinds(nodes: readonly CanvasNode[]): Record<CanvasObjectKind, number> {
  return nodes.reduce<Record<CanvasObjectKind, number>>(
    (counts, node) => ({
      ...counts,
      [getObjectKind(node)]: counts[getObjectKind(node)] + 1
    }),
    {
      page: 0,
      database: 0,
      'external-reference': 0,
      media: 0,
      shape: 0,
      note: 0,
      group: 0
    }
  )
}

function createPlanForLargeScene(budgets: DomIslandPoolBudgets) {
  const scene = createLargeMixedScene()

  return planDomIslandPool({
    candidates: scene.nodes.map(createCandidate),
    budgets,
    nowMs: 10_000
  })
}

describe('canvas v3 performance validation', () => {
  it('benchmarks 10K mixed media reference document and database objects', () => {
    const startedAt = performance.now()
    const scene = createLargeMixedScene()
    const elapsedMs = performance.now() - startedAt
    const kindCounts = countSourceKinds(scene.nodes)

    expect(scene.nodeCount).toBe(LARGE_SCENE_NODE_COUNT)
    expect(scene.edgeCount).toBe(0)
    expect(kindCounts.media).toBeGreaterThan(1_000)
    expect(kindCounts['external-reference']).toBeGreaterThan(1_000)
    expect(kindCounts.page).toBeGreaterThan(1_000)
    expect(kindCounts.database).toBeGreaterThan(1_000)
    expect(elapsedMs).toBeLessThan(
      getPerformanceBudget(
        PERFORMANCE_BUDGETS.largeSceneBuildMs.local,
        PERFORMANCE_BUDGETS.largeSceneBuildMs.ci
      )
    )
  })

  it('keeps thumbnail-heavy boards within live DOM and iframe budgets', () => {
    const budgets = {
      maxLiveDom: 24,
      maxShellDom: 72,
      maxLiveIframes: 6
    }
    const plan = createPlanForLargeScene(budgets)

    expect(plan.budgets.liveUsed).toBeLessThanOrEqual(budgets.maxLiveDom)
    expect(plan.budgets.shellUsed).toBeLessThanOrEqual(budgets.maxShellDom)
    expect(plan.budgets.liveIframeUsed).toBeLessThanOrEqual(budgets.maxLiveIframes)
    expect(plan.assignments.length).toBeLessThanOrEqual(budgets.maxLiveDom + budgets.maxShellDom)
    expect(plan.liveIframeAssignments).toHaveLength(budgets.maxLiveIframes)
    expect(plan.parkedObjectIds.length).toBeGreaterThan(9_800)
  })

  it('benchmarks bursty PDF and thumbnail preview generation at the 10K default scale', () => {
    const sources = createCanvasPreviewGenerationBenchmarkSources({
      objectCount: LARGE_SCENE_NODE_COUNT,
      seed: 4
    })
    const pdfSourceCount = sources.filter((source) => source.thumbnailKind === 'pdf').length
    const measurement = measureCanvasPreviewGenerationBenchmark({
      objectCount: LARGE_SCENE_NODE_COUNT,
      iterations: 1,
      warmupIterations: 0,
      seed: 4,
      clock: createIncrementingClock(0.25)
    })

    expect(pdfSourceCount).toBeGreaterThan(1_000)
    expect(measurement.valid).toBe(true)
    expect(measurement.errors).toEqual([])
    expect(measurement.objectCount).toBe(LARGE_SCENE_NODE_COUNT)
    expect(measurement.generatedThumbnailCount).toBe(LARGE_SCENE_NODE_COUNT)
    expect(measurement.livePreviewCount).toBeGreaterThan(3_000)
    expect(measurement.offlineFallbackCount).toBeGreaterThan(900)
    expect(measurement.tileSummaryJsonBytes).toBeGreaterThan(1_000_000)
    expect(measurement.thumbnailMsAvg).toBe(0.25)
    expect(measurement.modelMsAvg).toBe(0.25)
  })

  it('benchmarks dense media minimap updates without unbounded tile clusters', () => {
    const scene = createLargeMixedScene()
    const startedAt = performance.now()
    const summary = createMinimapSummaryFromCanvasScene({
      nodes: scene.nodes,
      edges: scene.edges
    })
    const elapsedMs = performance.now() - startedAt
    const aggregateTypeCounts = summary.tiles.reduce<Record<string, number>>((counts, tile) => {
      Object.entries(tile.typeCounts).forEach(([kind, count]) => {
        counts[kind] = (counts[kind] ?? 0) + count
      })

      return counts
    }, {})

    expect(summary.totalObjectCount).toBe(LARGE_SCENE_NODE_COUNT)
    expect(summary.totalEdgeCount).toBe(0)
    expect(aggregateTypeCounts.media).toBeGreaterThan(1_000)
    expect(aggregateTypeCounts['external-reference']).toBeGreaterThan(1_000)
    expect(summary.tiles.every((tile) => tile.clusters.length <= 128)).toBe(true)
    expect(elapsedMs).toBeLessThan(
      getPerformanceBudget(
        PERFORMANCE_BUDGETS.minimapSummaryMs.local,
        PERFORMANCE_BUDGETS.minimapSummaryMs.ci
      )
    )
  })

  it('keeps far zoom summaries out of the React card component mount list', () => {
    const scene = createLargeMixedScene()
    const viewport = createViewport({
      x: scene.bounds.x + scene.bounds.width / 2,
      y: scene.bounds.y + scene.bounds.height / 2,
      zoom: 0.05,
      width: 1_920,
      height: 1_080
    })
    const displayList = createCanvasDisplayList({
      viewport,
      nodes: scene.nodes,
      edges: scene.edges,
      store: {
        getVisibleNodes: () => scene.nodes
      },
      selectedNodeIds: new Set(),
      domNodeLimit: 0
    })

    expect(displayList.visibleNodes).toHaveLength(LARGE_SCENE_NODE_COUNT)
    expect(displayList.domNodes).toHaveLength(0)
    expect(displayList.overviewNodes).toHaveLength(LARGE_SCENE_NODE_COUNT)
  })

  it('caps smart guide candidate evaluation to nearby objects', () => {
    const nearestNonAligningNode = createNode('page', { x: 140, y: 20, width: 50, height: 50 })
    const fartherAligningNode = createNode('page', { x: 206, y: 0, width: 100, height: 80 })
    const result = createCanvasSmartSnap({
      movingBounds: { x: 0, y: 0, width: 100, height: 80 },
      stationaryNodes: [nearestNonAligningNode, fartherAligningNode],
      canvasDelta: { x: 104, y: 0 },
      threshold: 4,
      searchRadius: 400,
      maxCandidateNodes: 1
    })

    expect(result.canvasDelta.x).toBe(104)
    expect(result.guides).toEqual([])
  })
})
