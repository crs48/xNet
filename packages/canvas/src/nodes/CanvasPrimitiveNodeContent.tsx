/**
 * Built-in canvas-native primitive rendering.
 */

import type { CanvasNode, ShapeType } from '../types'
import React from 'react'
import { getCanvasContainerMemberIds, getCanvasContainerRole } from '../selection/scene-operations'
import { useCanvasThemeTokens } from '../theme/canvas-theme'
import { ShapeNodeComponent, type ShapeNodeData } from './shape-node'

function getShapeType(node: CanvasNode): ShapeType {
  const shapeType = node.properties.shapeType

  if (
    shapeType === 'rectangle' ||
    shapeType === 'rounded-rectangle' ||
    shapeType === 'ellipse' ||
    shapeType === 'diamond' ||
    shapeType === 'triangle' ||
    shapeType === 'hexagon' ||
    shapeType === 'star' ||
    shapeType === 'arrow' ||
    shapeType === 'cylinder' ||
    shapeType === 'cloud'
  ) {
    return shapeType
  }

  return 'rectangle'
}

function toShapeNodeData(node: CanvasNode, themeMode: 'light' | 'dark'): ShapeNodeData {
  const fill =
    typeof node.properties.fill === 'string'
      ? node.properties.fill
      : themeMode === 'dark'
        ? 'rgba(56, 189, 248, 0.18)'
        : 'rgba(14, 165, 233, 0.14)'
  const stroke =
    typeof node.properties.stroke === 'string'
      ? node.properties.stroke
      : themeMode === 'dark'
        ? 'rgba(125, 211, 252, 0.92)'
        : 'rgba(2, 132, 199, 0.82)'
  const labelColor =
    typeof node.properties.labelColor === 'string'
      ? node.properties.labelColor
      : themeMode === 'dark'
        ? 'rgba(241, 245, 249, 0.96)'
        : 'rgba(15, 23, 42, 0.9)'

  return {
    id: node.id,
    type: 'shape',
    position: node.position,
    properties: {
      shapeType: getShapeType(node),
      fill,
      stroke,
      strokeWidth:
        typeof node.properties.strokeWidth === 'number' ? node.properties.strokeWidth : 2,
      cornerRadius:
        typeof node.properties.cornerRadius === 'number' ? node.properties.cornerRadius : 18,
      label: typeof node.properties.label === 'string' ? node.properties.label : undefined,
      labelColor
    }
  }
}

export function CanvasPrimitiveNodeContent({
  node
}: {
  node: CanvasNode
}): React.ReactElement | null {
  const theme = useCanvasThemeTokens()

  if (node.type === 'shape') {
    return (
      <div
        data-canvas-primitive-node="true"
        data-canvas-primitive-kind="shape"
        data-canvas-shape-type={getShapeType(node)}
        data-canvas-theme={theme.mode}
        style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
      >
        <ShapeNodeComponent node={toShapeNodeData(node, theme.mode)} onUpdate={() => undefined} />
      </div>
    )
  }

  const containerRole = getCanvasContainerRole(node)
  if (!containerRole) {
    return null
  }

  const memberIds = getCanvasContainerMemberIds(node)
  const title = node.alias ?? (node.properties.title as string) ?? 'Frame'
  const roleLabel = containerRole === 'frame' ? 'Frame' : 'Group'

  return (
    <div
      data-canvas-primitive-node="true"
      data-canvas-primitive-kind="group"
      data-canvas-container-role={containerRole}
      data-canvas-theme={theme.mode}
      style={{
        display: 'flex',
        height: '100%',
        width: '100%',
        flexDirection: 'column',
        justifyContent: 'space-between',
        borderRadius: 22,
        border: `1px dashed ${theme.panelBorder}`,
        background:
          containerRole === 'frame'
            ? theme.mode === 'dark'
              ? 'rgba(15, 23, 42, 0.1)'
              : 'rgba(248, 250, 252, 0.2)'
            : theme.panelBackground,
        color: theme.panelText,
        padding: 14,
        boxSizing: 'border-box',
        pointerEvents: 'none'
      }}
    >
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
      >
        <div style={{ display: 'flex', minWidth: 0, alignItems: 'center', gap: 8 }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              borderRadius: 999,
              padding: '4px 10px',
              background:
                theme.mode === 'dark' ? 'rgba(148, 163, 184, 0.16)' : 'rgba(148, 163, 184, 0.18)',
              color: theme.panelMutedText,
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.16em',
              textTransform: 'uppercase'
            }}
          >
            {roleLabel}
          </span>
          <span
            style={{
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: 13,
              fontWeight: 600
            }}
          >
            {title}
          </span>
        </div>

        {memberIds.length > 0 ? (
          <span
            style={{
              flexShrink: 0,
              color: theme.panelMutedText,
              fontSize: 11,
              letterSpacing: '0.08em',
              textTransform: 'uppercase'
            }}
          >
            {memberIds.length} items
          </span>
        ) : null}
      </div>

      <div
        style={{
          borderRadius: 16,
          border:
            containerRole === 'frame'
              ? `1px solid ${theme.panelDivider}`
              : `1px dashed ${theme.panelDivider}`,
          flex: 1,
          marginTop: 12
        }}
      />
    </div>
  )
}
