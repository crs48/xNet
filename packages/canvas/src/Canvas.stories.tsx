import type { CanvasNode } from './types'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Badge, Button } from '@xnetjs/ui'
import { useRef, useState, type ReactElement } from 'react'
import { Canvas, type CanvasHandle } from './renderer/Canvas'
import { createCanvasDoc, createEdge, createNode } from './store'

const meta = {
  title: 'Core/Canvas/Workbench'
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

function createCanvasStoryDoc(): ReturnType<typeof createCanvasDoc> {
  const doc = createCanvasDoc('storybook-canvas', 'Storybook Canvas Workbench')
  const nodes = doc.getMap<CanvasNode>('nodes')
  const edges = doc.getMap('edges')

  const editorNode = createNode(
    'card',
    { x: 120, y: 120, width: 260, height: 160 },
    { title: 'Editor story', subtitle: 'Rich text workbench' }
  )
  const databaseNode = createNode(
    'card',
    { x: 520, y: 160, width: 280, height: 160 },
    { title: 'Database story', subtitle: 'Table and board views' }
  )
  const canvasNode = createNode(
    'card',
    { x: 320, y: 420, width: 280, height: 160 },
    { title: 'Canvas story', subtitle: 'Spatial interaction surface' }
  )
  const noteNode = createNode(
    'card',
    { x: 860, y: 110, width: 240, height: 150 },
    { title: 'Note', subtitle: 'Double-click cards to inspect interactions.' }
  )

  const firstEdge = createEdge(editorNode.id, databaseNode.id, {
    style: { markerEnd: 'arrow' }
  })
  const secondEdge = createEdge(databaseNode.id, canvasNode.id, {
    style: { markerEnd: 'arrow' }
  })
  const thirdEdge = createEdge(editorNode.id, noteNode.id, {
    style: { markerEnd: 'arrow', strokeDasharray: '6,6' }
  })

  nodes.set(editorNode.id, editorNode)
  nodes.set(databaseNode.id, databaseNode)
  nodes.set(canvasNode.id, canvasNode)
  nodes.set(noteNode.id, noteNode)
  edges.set(firstEdge.id, firstEdge)
  edges.set(secondEdge.id, secondEdge)
  edges.set(thirdEdge.id, thirdEdge)

  return doc
}

function CanvasWorkbench(): ReactElement {
  const [doc] = useState(() => createCanvasStoryDoc())
  const [doubleClickedNodeId, setDoubleClickedNodeId] = useState<string | null>(null)
  const canvasRef = useRef<CanvasHandle>(null)

  const addNode = (): void => {
    const nodes = doc.getMap<CanvasNode>('nodes')
    const count = nodes.size + 1
    const node = createNode(
      'card',
      {
        x: 180 + count * 70,
        y: 180 + (count % 4) * 110,
        width: 240,
        height: 140
      },
      {
        title: `Story node ${count}`,
        subtitle: 'Created from Storybook'
      }
    )

    nodes.set(node.id, node)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-border bg-background-subtle px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-foreground">Canvas workbench</p>
          <p className="text-sm text-foreground-muted">
            Test panning, zooming, dragging, node creation, and navigation controls.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="secondary">Spatial playground</Badge>
          <Button variant="outline" size="sm" onClick={addNode}>
            Add node
          </Button>
          <Button variant="outline" size="sm" onClick={() => canvasRef.current?.fitToContent(120)}>
            Fit content
          </Button>
          <Button variant="outline" size="sm" onClick={() => canvasRef.current?.resetView()}>
            Reset view
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="h-[760px] overflow-hidden rounded-[28px] border border-border bg-background shadow-sm">
          <Canvas
            ref={canvasRef}
            doc={doc}
            config={{
              showGrid: true,
              gridSize: 24,
              minZoom: 0.1,
              maxZoom: 4
            }}
            showNavigationTools
            navigationToolsPosition="bottom-right"
            navigationToolsShowZoomLabel={false}
            renderNode={(node) => (
              <div className="flex h-full flex-col justify-between rounded-[24px] border border-border/70 bg-background/95 p-4 shadow-lg shadow-black/5">
                <span className="inline-flex w-fit items-center gap-2 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Canvas node
                </span>
                <div className="space-y-2">
                  <div className="text-lg font-semibold text-foreground">
                    {String(node.properties.title ?? 'Untitled')}
                  </div>
                  <p className="text-sm text-foreground-muted">
                    {String(node.properties.subtitle ?? 'Drag me around the workbench.')}
                  </p>
                </div>
              </div>
            )}
            onNodeDoubleClick={(nodeId) => setDoubleClickedNodeId(nodeId)}
          />
        </div>

        <aside className="space-y-4 rounded-[28px] border border-border bg-background-subtle p-5">
          <div>
            <p className="text-sm font-semibold text-foreground">What to test here</p>
            <p className="mt-1 text-sm text-foreground-muted">
              Pan, zoom, drag nodes, double-click a card, and add extra nodes to stress the
              renderer.
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-background p-4 text-sm text-foreground-muted">
            Last double-clicked node:{' '}
            <span className="font-medium text-foreground">{doubleClickedNodeId ?? 'none yet'}</span>
          </div>

          <div className="rounded-2xl border border-border bg-background p-4 text-sm text-foreground-muted">
            Use the Performance tab while dragging or zooming to profile the main canvas
            interactions.
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
          'Interactive canvas workbench for panning, zooming, dragging, navigation tools, and seeded node/edge layouts.'
      }
    }
  },
  render: () => <CanvasWorkbench />
}
