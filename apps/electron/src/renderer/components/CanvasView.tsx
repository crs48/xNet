/**
 * Canvas View - Infinite canvas for spatial visualization
 *
 * Uses @xnet/react hooks and @xnet/canvas for the canvas component.
 */

import React, { useEffect, useState, useCallback } from 'react'
import { useNode } from '@xnet/react'
import { CanvasSchema } from '@xnet/data'
import { Canvas, createNode, createEdge } from '@xnet/canvas'
import { Plus, LayoutGrid, ZoomIn } from 'lucide-react'
import { ShareButton } from './ShareButton'

interface CanvasViewProps {
  docId: string
}

export function CanvasView({ docId }: CanvasViewProps) {
  const {
    data: canvas,
    doc,
    loading,
    update
  } = useNode(CanvasSchema, docId, {
    createIfMissing: { title: 'Untitled Canvas' }
    // Sync enabled - signaling server runs via `pnpm dev`
  })

  const [canvasReady, setCanvasReady] = useState(false)

  // Initialize canvas data structure if needed
  useEffect(() => {
    if (!doc) return

    const nodesMap = doc.getMap('nodes')
    const edgesMap = doc.getMap('edges')

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

      doc.transact(() => {
        nodesMap.set(node1.id, node1)
        nodesMap.set(node2.id, node2)
        nodesMap.set(node3.id, node3)
        edgesMap.set(edge1.id, edge1)
        edgesMap.set(edge2.id, edge2)
        edgesMap.set(edge3.id, edge3)
      })
    }

    setCanvasReady(true)
  }, [doc])

  // Add a new node to the canvas
  const handleAddNode = useCallback(() => {
    if (!doc) return

    const nodesMap = doc.getMap('nodes')
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
  }, [doc])

  if (loading || !doc) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading canvas...</p>
      </div>
    )
  }

  if (!canvasReady) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Preparing canvas...</p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Canvas toolbar */}
      <div className="flex items-center gap-2 p-3 border-b border-border bg-secondary">
        {/* Title */}
        <input
          type="text"
          className="text-lg font-semibold border-none bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
          value={canvas?.title || ''}
          onChange={(e) => update({ title: e.target.value })}
          placeholder="Untitled"
        />

        <div className="flex-1" />

        <button
          onClick={handleAddNode}
          className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white rounded-md text-sm hover:bg-primary-hover transition-colors"
        >
          <Plus size={14} />
          <span>Add Node</span>
        </button>

        <div className="flex items-center gap-1 text-xs text-muted-foreground ml-4">
          <LayoutGrid size={14} />
          <span>Pan: Drag background</span>
          <span className="mx-2">|</span>
          <ZoomIn size={14} />
          <span>Zoom: Scroll</span>
        </div>

        <ShareButton docId={docId} docType="canvas" />
      </div>

      {/* Canvas */}
      <div className="flex-1 relative">
        <Canvas
          doc={doc}
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
