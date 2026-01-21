/**
 * Canvas View - Infinite canvas for spatial visualization
 *
 * Uses @xnet/canvas for the canvas component.
 */

import React, { useEffect, useState } from 'react'
import { Canvas, createNode, createEdge } from '@xnet/canvas'
import { Plus, LayoutGrid, ZoomIn, ZoomOut, Maximize } from 'lucide-react'
import type * as Y from 'yjs'

interface CanvasViewProps {
  docId: string
  ydoc: Y.Doc | null
  isLoading?: boolean
}

export function CanvasView({ docId, ydoc, isLoading }: CanvasViewProps) {
  const [canvasReady, setCanvasReady] = useState(false)

  // Initialize canvas data structure if needed
  useEffect(() => {
    if (!ydoc) return

    const nodesMap = ydoc.getMap('nodes')
    const edgesMap = ydoc.getMap('edges')

    // Initialize with sample nodes if empty
    if (nodesMap.size === 0) {
      const node1 = createNode(
        'card',
        { x: 100, y: 100, width: 200, height: 100 },
        { title: 'Start Here' }
      )
      const node2 = createNode(
        'card',
        { x: 400, y: 100, width: 200, height: 100 },
        { title: 'Next Step' }
      )
      const node3 = createNode(
        'card',
        { x: 250, y: 300, width: 200, height: 100 },
        { title: 'Final Goal' }
      )

      const edge1 = createEdge(node1.id, node2.id, { style: { markerEnd: 'arrow' } })
      const edge2 = createEdge(node2.id, node3.id, { style: { markerEnd: 'arrow' } })
      const edge3 = createEdge(node1.id, node3.id, {
        style: { markerEnd: 'arrow', strokeDasharray: '5,5' }
      })

      ydoc.transact(() => {
        nodesMap.set(node1.id, node1)
        nodesMap.set(node2.id, node2)
        nodesMap.set(node3.id, node3)
        edgesMap.set(edge1.id, edge1)
        edgesMap.set(edge2.id, edge2)
        edgesMap.set(edge3.id, edge3)
      })
    }

    setCanvasReady(true)
  }, [ydoc])

  if (isLoading || !ydoc) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-text-secondary">Loading canvas...</p>
      </div>
    )
  }

  if (!canvasReady) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-text-secondary">Preparing canvas...</p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Canvas toolbar */}
      <div className="flex items-center gap-2 p-3 border-b border-border bg-bg-secondary">
        <button
          onClick={() => {
            const nodesMap = ydoc.getMap('nodes')
            const newNode = createNode(
              'card',
              {
                x: 100 + Math.random() * 400,
                y: 100 + Math.random() * 300,
                width: 200,
                height: 100
              },
              { title: 'New Node' }
            )
            nodesMap.set(newNode.id, newNode)
          }}
          className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white rounded-md text-sm hover:bg-primary-hover transition-colors"
        >
          <Plus size={14} />
          <span>Add Node</span>
        </button>

        <div className="flex-1" />

        <div className="flex items-center gap-1 text-xs text-text-secondary">
          <LayoutGrid size={14} />
          <span>Pan: Drag background</span>
          <span className="mx-2">|</span>
          <ZoomIn size={14} />
          <span>Zoom: Scroll</span>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative">
        <Canvas
          doc={ydoc}
          config={{
            showGrid: true,
            gridSize: 20,
            minZoom: 0.1,
            maxZoom: 4
          }}
          onNodeDoubleClick={(id) => {
            console.log('Double-clicked node:', id)
          }}
          onBackgroundClick={() => {
            console.log('Background clicked')
          }}
        />
      </div>
    </div>
  )
}
