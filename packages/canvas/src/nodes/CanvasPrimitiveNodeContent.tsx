/**
 * Built-in canvas-native primitive rendering.
 */

import type { CanvasNode, ShapeType } from '../types'
import React from 'react'
import {
  getCanvasFrameVariant,
  getCanvasFrameVariantDefinition,
  type CanvasFrameVariant
} from '../frames/frame-variants'
import {
  getCanvasQueryFrameDefinition,
  getCanvasQueryFrameResultSummary
} from '../frames/query-frames'
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
      label:
        typeof node.properties.label === 'string'
          ? node.properties.label
          : typeof node.properties.title === 'string'
            ? node.properties.title
            : undefined,
      labelColor
    }
  }
}

function getFrameLanes(node: CanvasNode): readonly string[] {
  const lanes = node.properties.lanes

  return Array.isArray(lanes) && lanes.every((lane) => typeof lane === 'string')
    ? lanes
    : ['Now', 'Next', 'Later']
}

function CanvasFrameVariantPreview({
  node,
  variant,
  theme
}: {
  node: CanvasNode
  variant: CanvasFrameVariant
  theme: ReturnType<typeof useCanvasThemeTokens>
}): React.ReactElement {
  const lanes = getFrameLanes(node)
  const mutedLine =
    theme.mode === 'dark' ? 'rgba(148, 163, 184, 0.32)' : 'rgba(100, 116, 139, 0.24)'
  const accentFill = theme.mode === 'dark' ? 'rgba(56, 189, 248, 0.16)' : 'rgba(14, 165, 233, 0.12)'
  const accentLine = theme.mode === 'dark' ? 'rgba(125, 211, 252, 0.72)' : 'rgba(2, 132, 199, 0.52)'

  if (variant === 'kanban') {
    return (
      <div
        data-canvas-frame-variant-preview="kanban"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${lanes.length}, minmax(0, 1fr))`,
          gap: 8,
          height: '100%'
        }}
      >
        {lanes.map((lane) => (
          <div
            key={lane}
            style={{
              minWidth: 0,
              borderRadius: 12,
              border: `1px solid ${mutedLine}`,
              background:
                theme.mode === 'dark' ? 'rgba(15, 23, 42, 0.26)' : 'rgba(255, 255, 255, 0.48)',
              padding: 8
            }}
          >
            <div
              style={{
                height: 6,
                width: '58%',
                borderRadius: 999,
                background: accentLine,
                marginBottom: 8
              }}
            />
            {[0, 1].map((index) => (
              <div
                key={index}
                style={{
                  height: 18,
                  borderRadius: 6,
                  background: accentFill,
                  marginTop: index === 0 ? 0 : 6
                }}
              />
            ))}
          </div>
        ))}
      </div>
    )
  }

  if (variant === 'swimlane') {
    return (
      <div
        data-canvas-frame-variant-preview="swimlane"
        style={{
          display: 'grid',
          gridTemplateRows: `repeat(${lanes.length}, minmax(0, 1fr))`,
          gap: 8,
          height: '100%'
        }}
      >
        {lanes.map((lane) => (
          <div
            key={lane}
            style={{
              display: 'grid',
              gridTemplateColumns: '72px 1fr',
              gap: 8,
              minHeight: 0
            }}
          >
            <div style={{ borderRadius: 8, background: accentFill }} />
            <div style={{ borderRadius: 8, border: `1px dashed ${mutedLine}` }} />
          </div>
        ))}
      </div>
    )
  }

  if (variant === 'timeline') {
    return (
      <div
        data-canvas-frame-variant-preview="timeline"
        style={{ position: 'relative', height: '100%', minHeight: 80 }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: '50%',
            height: 2,
            borderRadius: 999,
            background: accentLine
          }}
        />
        {lanes.map((lane, index) => (
          <div
            key={lane}
            style={{
              position: 'absolute',
              left: `${(index / Math.max(1, lanes.length - 1)) * 92}%`,
              top: index % 2 === 0 ? '24%' : '56%',
              width: '26%',
              minWidth: 44,
              height: 28,
              borderRadius: 8,
              background: accentFill,
              border: `1px solid ${mutedLine}`
            }}
          />
        ))}
      </div>
    )
  }

  if (variant === 'query') {
    const queryDefinition = getCanvasQueryFrameDefinition(node)
    const querySummary = getCanvasQueryFrameResultSummary(node)
    const countLabel =
      querySummary.totalCount > 0
        ? `${querySummary.visibleCount}/${querySummary.totalCount} results`
        : 'No results'

    return (
      <div
        data-canvas-frame-variant-preview="query"
        data-canvas-query-frame-preview="true"
        data-canvas-query-frame-id={queryDefinition?.id}
        data-canvas-query-frame-stale={querySummary.stale ? 'true' : 'false'}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          height: '100%'
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            minHeight: 20,
            borderRadius: 999,
            background: accentFill,
            padding: '0 8px',
            color: theme.panelMutedText,
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase'
          }}
        >
          <span
            data-canvas-query-frame-label="true"
            style={{
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {queryDefinition?.label ?? 'Saved query'}
          </span>
          <span
            data-canvas-query-frame-count="true"
            style={{ flexShrink: 0, color: querySummary.stale ? accentLine : theme.panelMutedText }}
          >
            {countLabel}
          </span>
        </div>
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1fr 1fr',
              gap: 6
            }}
          >
            {[0, 1, 2].map((cell) => (
              <div key={cell} style={{ height: 14, borderRadius: 5, background: mutedLine }} />
            ))}
          </div>
        ))}
      </div>
    )
  }

  if (variant === 'presentation') {
    return (
      <div
        data-canvas-frame-variant-preview="presentation"
        style={{
          height: '100%',
          display: 'grid',
          placeItems: 'center'
        }}
      >
        <div
          style={{
            width: '76%',
            aspectRatio: '16 / 9',
            borderRadius: 12,
            border: `1px solid ${accentLine}`,
            background: accentFill,
            boxShadow: `0 0 0 8px ${theme.mode === 'dark' ? 'rgba(15, 23, 42, 0.16)' : 'rgba(255, 255, 255, 0.38)'}`
          }}
        />
      </div>
    )
  }

  return (
    <div
      data-canvas-frame-variant-preview="standard"
      style={{
        height: '100%',
        borderRadius: 16,
        border: `1px solid ${theme.panelDivider}`
      }}
    />
  )
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
  const frameVariant = containerRole === 'frame' ? getCanvasFrameVariant(node) : null
  const frameDefinition = frameVariant ? getCanvasFrameVariantDefinition(frameVariant) : null
  const title =
    node.alias ?? (node.properties.title as string) ?? frameDefinition?.defaultTitle ?? 'Frame'
  const roleLabel =
    containerRole === 'frame' && frameDefinition ? `${frameDefinition.label} frame` : 'Group'

  return (
    <div
      data-canvas-primitive-node="true"
      data-canvas-primitive-kind="group"
      data-canvas-container-role={containerRole}
      data-canvas-frame-variant={frameVariant ?? undefined}
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
          marginTop: 12,
          minHeight: 0,
          padding: containerRole === 'frame' ? 10 : 0,
          boxSizing: 'border-box'
        }}
      >
        {containerRole === 'frame' && frameVariant ? (
          <CanvasFrameVariantPreview node={node} variant={frameVariant} theme={theme} />
        ) : null}
      </div>
    </div>
  )
}
