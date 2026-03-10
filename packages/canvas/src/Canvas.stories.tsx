import type { CanvasNode } from './types'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Badge, Button } from '@xnetjs/ui'
import { useRef, useState, type ReactElement } from 'react'
import { createCanvasPerformanceSceneDoc } from './fixtures/performance-scene'
import { Canvas, type CanvasHandle } from './renderer/Canvas'
import { getCanvasConnectorsMap, getCanvasObjectsMap } from './scene/doc-layout'
import { getCanvasResolvedNodeKind } from './scene/node-kind'
import { createCanvasDoc, createEdge, createNode } from './store'

const meta = {
  title: 'Core/Canvas/Workbench'
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

const WORKBENCH_OBJECT_SEQUENCE = [
  'page',
  'database',
  'note',
  'external-reference',
  'media',
  'shape'
] as const

function createCanvasStoryDoc(): ReturnType<typeof createCanvasDoc> {
  const doc = createCanvasDoc('storybook-canvas', 'Canvas V2 Workbench')
  const nodes = getCanvasObjectsMap<CanvasNode>(doc)
  const edges = getCanvasConnectorsMap(doc)

  const pageNode = createNode(
    'page',
    { x: 180, y: 180 },
    {
      title: 'Project brief',
      subtitle: 'Inline-editable page surface'
    }
  )
  const databaseNode = createNode(
    'database',
    { x: 620, y: 220 },
    {
      title: 'Launch tracker',
      subtitle: 'Live preview database card'
    }
  )
  const referenceNode = createNode(
    'external-reference',
    { x: 1100, y: 210 },
    {
      title: 'AFFiNE canvas notes',
      subtitle: 'Source-backed URL preview',
      url: 'https://affine.pro'
    }
  )
  const mediaNode = createNode(
    'media',
    { x: 1040, y: 620, width: 360, height: 240 },
    {
      title: 'Cover exploration',
      subtitle: 'Blob-backed media asset',
      alt: 'Mock media asset'
    }
  )
  const noteNode = createNode(
    'note',
    { x: 260, y: 620 },
    {
      title: 'Design note',
      subtitle: 'Fast canvas-native scratch space'
    }
  )
  const shapeNode = createNode(
    'shape',
    { x: 760, y: 700, width: 220, height: 140 },
    {
      title: 'Decision frame',
      subtitle: 'Canvas-native primitive',
      shapeType: 'diamond'
    }
  )
  const frameNode = createNode(
    'group',
    { x: 120, y: 120, width: 1380, height: 820, zIndex: -5 },
    {
      title: 'Canvas V2 object model',
      subtitle: 'Real page, database, link, media, note, and shape objects',
      containerRole: 'frame',
      memberIds: [
        pageNode.id,
        databaseNode.id,
        referenceNode.id,
        noteNode.id,
        mediaNode.id,
        shapeNode.id
      ]
    }
  )

  const sceneNodes = [
    frameNode,
    pageNode,
    databaseNode,
    referenceNode,
    noteNode,
    mediaNode,
    shapeNode
  ]

  const sceneEdges = [
    createEdge(pageNode.id, databaseNode.id, {
      label: 'syncs to',
      style: { markerEnd: 'arrow' }
    }),
    createEdge(databaseNode.id, referenceNode.id, {
      label: 'references',
      style: { markerEnd: 'arrow', strokeDasharray: '6,6' }
    }),
    createEdge(noteNode.id, shapeNode.id, {
      label: 'drives',
      style: { markerEnd: 'arrow' }
    }),
    createEdge(shapeNode.id, mediaNode.id, {
      label: 'exports',
      style: { markerEnd: 'arrow' }
    })
  ]

  for (const node of sceneNodes) {
    nodes.set(node.id, node)
  }

  for (const edge of sceneEdges) {
    edges.set(edge.id, edge)
  }

  return doc
}

function renderWorkbenchNode(node: CanvasNode): React.ReactNode {
  const resolvedKind = getCanvasResolvedNodeKind(node)

  if (resolvedKind === 'shape' || resolvedKind === 'frame' || resolvedKind === 'group') {
    return undefined
  }

  const badgeLabel =
    resolvedKind === 'external-reference'
      ? 'Link'
      : resolvedKind === 'media'
        ? 'Media'
        : resolvedKind === 'note'
          ? 'Note'
          : resolvedKind === 'database'
            ? 'Database'
            : 'Page'

  return (
    <div className="flex h-full flex-col justify-between rounded-[22px] border border-border/70 bg-background/95 p-4 shadow-lg shadow-black/5">
      <span className="inline-flex w-fit items-center gap-2 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {badgeLabel}
      </span>

      <div className="space-y-2">
        <div className="text-lg font-semibold text-foreground">
          {String(node.properties.title ?? 'Untitled')}
        </div>
        <p className="text-sm text-foreground-muted">
          {String(node.properties.subtitle ?? 'Canvas V2 workbench object')}
        </p>
      </div>
    </div>
  )
}

function CanvasWorkbench(): ReactElement {
  const [doc] = useState(() => createCanvasStoryDoc())
  const [doubleClickedNodeId, setDoubleClickedNodeId] = useState<string | null>(null)
  const canvasRef = useRef<CanvasHandle>(null)

  const addNode = (): void => {
    const nodes = getCanvasObjectsMap<CanvasNode>(doc)
    const contentCount = Array.from(nodes.values()).filter(
      (node) => node.position.zIndex !== -5
    ).length
    const kind = WORKBENCH_OBJECT_SEQUENCE[contentCount % WORKBENCH_OBJECT_SEQUENCE.length]
    const node = createNode(
      kind,
      {
        x: 220 + (contentCount % 4) * 260,
        y: 980 + Math.floor(contentCount / 4) * 220
      },
      {
        title: `${kind.replace('-', ' ')} ${contentCount + 1}`,
        subtitle: 'Created from Storybook'
      }
    )

    if (kind === 'external-reference') {
      node.properties.url = `https://example.com/storybook/${contentCount + 1}`
    }

    if (kind === 'shape') {
      node.properties.shapeType = 'rounded-rectangle'
    }

    nodes.set(node.id, node)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-border bg-background-subtle px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-foreground">Canvas V2 mixed-object workbench</p>
          <p className="text-sm text-foreground-muted">
            Real page, database, link, media, note, shape, and frame objects with minimal chrome.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="secondary">Content-first scene</Badge>
          <Button variant="outline" size="sm" onClick={addNode}>
            Add object
          </Button>
          <Button variant="outline" size="sm" onClick={() => canvasRef.current?.fitToContent(160)}>
            Fit content
          </Button>
          <Button variant="outline" size="sm" onClick={() => canvasRef.current?.resetView()}>
            Reset view
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="h-[820px] overflow-hidden rounded-[28px] border border-border bg-background shadow-sm">
          <Canvas
            ref={canvasRef}
            doc={doc}
            config={{
              showGrid: true,
              gridSize: 24,
              minZoom: 0.08,
              maxZoom: 4
            }}
            showMinimap
            showNavigationTools
            navigationToolsPosition="bottom-right"
            navigationToolsShowZoomLabel={false}
            renderNode={renderWorkbenchNode}
            onNodeDoubleClick={(nodeId) => setDoubleClickedNodeId(nodeId)}
          />
        </div>

        <aside className="space-y-4 rounded-[28px] border border-border bg-background-subtle p-5">
          <div>
            <p className="text-sm font-semibold text-foreground">Suggested checks</p>
            <p className="mt-1 text-sm text-foreground-muted">
              Pan across the frame, drag the mixed objects, toggle the minimap, and profile the grid
              plus far-field renderer while switching Storybook themes.
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-background p-4 text-sm text-foreground-muted">
            Last double-clicked object:{' '}
            <span className="font-medium text-foreground">{doubleClickedNodeId ?? 'none yet'}</span>
          </div>

          <div className="rounded-2xl border border-border bg-background p-4 text-sm text-foreground-muted">
            The active scene keeps the frame, grid, and minimap on the canvas path while the rich
            object shells stay bounded to the visible DOM subset.
          </div>
        </aside>
      </div>
    </div>
  )
}

export const Playground: Story = {
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        story:
          'Mixed-object Canvas V2 workbench for validating the real page/database/link/media/note/shape object model under Storybook themes.'
      }
    }
  },
  render: () => <CanvasWorkbench />
}

function LargeSceneWorkbench(): ReactElement {
  const [doc] = useState(() =>
    createCanvasPerformanceSceneDoc(
      'storybook-canvas-performance',
      'Canvas Performance Workbench',
      {
        columns: 54,
        rows: 30,
        clusterColumns: 6,
        clusterRows: 5
      }
    )
  )
  const canvasRef = useRef<CanvasHandle>(null)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-border bg-background-subtle px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-foreground">Large-scene workbench</p>
          <p className="text-sm text-foreground-muted">
            Dense seeded canvas for minimap, culling, grid, and frame-budget tuning.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="secondary">1,640+ objects</Badge>
          <Button variant="outline" size="sm" onClick={() => canvasRef.current?.fitToContent(180)}>
            Fit content
          </Button>
          <Button variant="outline" size="sm" onClick={() => canvasRef.current?.resetView()}>
            Reset view
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="h-[820px] overflow-hidden rounded-[28px] border border-border bg-background shadow-sm">
          <Canvas
            ref={canvasRef}
            doc={doc}
            config={{
              showGrid: true,
              gridSize: 24,
              minZoom: 0.08,
              maxZoom: 4
            }}
            showMinimap
            showNavigationTools
            navigationToolsPosition="bottom-right"
            navigationToolsShowZoomLabel={false}
          />
        </div>

        <aside className="space-y-4 rounded-[28px] border border-border bg-background-subtle p-5">
          <div>
            <p className="text-sm font-semibold text-foreground">Suggested checks</p>
            <p className="mt-1 text-sm text-foreground-muted">
              Pan across clusters, hide and reopen the minimap, then profile frame timing with the
              Storybook performance tools in both light and dark mode.
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-background p-4 text-sm text-foreground-muted">
            This scene intentionally mixes page, database, note, external-reference, media, shape,
            and group objects so the overview and minimap layers stay honest under load.
          </div>

          <div className="rounded-2xl border border-border bg-background p-4 text-sm text-foreground-muted">
            The workbench should keep the DOM bounded even though the scene is much larger than the
            current viewport.
          </div>
        </aside>
      </div>
    </div>
  )
}

export const LargeScene: Story = {
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        story:
          'Dense performance workbench for validating large-scene culling, minimap interaction, and grid rendering from the shared seeded-scene fixture.'
      }
    }
  },
  render: () => <LargeSceneWorkbench />
}
