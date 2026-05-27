/**
 * Canvas v3 debug overlay command generation and Canvas 2D rendering.
 */

import type { CanvasLodTier, Rect } from '@xnetjs/canvas-core'

export type CanvasDebugCacheStatus = 'hot' | 'loading' | 'stale' | 'missing'

export type CanvasDebugTileOverlay = {
  tileId: string
  bounds: Rect
  lodTier: CanvasLodTier
  cacheStatus: CanvasDebugCacheStatus
  syncRoomId?: string
  subscribed?: boolean
  peerCount?: number
}

export type CanvasDebugOverlayViewport = {
  x: number
  y: number
  zoom: number
}

export type CanvasDebugOverlayCommand =
  | {
      kind: 'rect'
      rect: Rect
      stroke: string
      fill: string
      lineWidth: number
    }
  | {
      kind: 'label'
      x: number
      y: number
      text: string
      color: string
    }
  | {
      kind: 'badge'
      x: number
      y: number
      radius: number
      text: string
      fill: string
      color: string
    }

export type CanvasDebugOverlayInput = {
  tiles: readonly CanvasDebugTileOverlay[]
  showTileBoundaries?: boolean
  showLodTier?: boolean
  showCacheStatus?: boolean
  showSyncRooms?: boolean
}

const CACHE_STATUS_COLORS: Record<CanvasDebugCacheStatus, string> = {
  hot: 'rgba(20, 184, 166, 0.82)',
  loading: 'rgba(234, 179, 8, 0.82)',
  stale: 'rgba(249, 115, 22, 0.82)',
  missing: 'rgba(239, 68, 68, 0.82)'
}

const LOD_LABELS: Record<CanvasLodTier, string> = {
  'live-dom': 'L0',
  'shell-dom': 'L1',
  thumbnail: 'L2',
  'vector-tile': 'L3',
  'raster-tile': 'L4'
}

function getTileFill(tile: CanvasDebugTileOverlay): string {
  return tile.subscribed ? 'rgba(14, 165, 233, 0.08)' : 'rgba(148, 163, 184, 0.05)'
}

function createTileLabels(tile: CanvasDebugTileOverlay, input: CanvasDebugOverlayInput): string[] {
  return [
    tile.tileId,
    input.showLodTier === false ? null : LOD_LABELS[tile.lodTier],
    input.showCacheStatus === false ? null : tile.cacheStatus,
    input.showSyncRooms === false || !tile.syncRoomId
      ? null
      : `${tile.subscribed ? 'room' : 'room?'}:${tile.syncRoomId}`,
    input.showSyncRooms === false || tile.peerCount === undefined ? null : `peers:${tile.peerCount}`
  ].filter((label): label is string => label !== null)
}

export function createCanvasDebugOverlayCommands(
  input: CanvasDebugOverlayInput
): CanvasDebugOverlayCommand[] {
  return input.tiles.flatMap((tile) => {
    const commands: CanvasDebugOverlayCommand[] = []

    if (input.showTileBoundaries !== false) {
      commands.push({
        kind: 'rect',
        rect: tile.bounds,
        stroke: CACHE_STATUS_COLORS[tile.cacheStatus],
        fill: getTileFill(tile),
        lineWidth: tile.subscribed ? 2 : 1
      })
    }

    createTileLabels(tile, input).forEach((text, index) => {
      commands.push({
        kind: 'label',
        x: tile.bounds.x + 8,
        y: tile.bounds.y + 16 + index * 14,
        text,
        color: index === 0 ? 'rgba(15, 23, 42, 0.92)' : 'rgba(71, 85, 105, 0.92)'
      })
    })

    if (input.showSyncRooms !== false && tile.syncRoomId) {
      commands.push({
        kind: 'badge',
        x: tile.bounds.x + tile.bounds.width - 18,
        y: tile.bounds.y + 18,
        radius: 10,
        text: String(tile.peerCount ?? 0),
        fill: tile.subscribed ? 'rgba(14, 165, 233, 0.9)' : 'rgba(100, 116, 139, 0.72)',
        color: 'white'
      })
    }

    return commands
  })
}

function worldToScreen(value: number, viewportOrigin: number, zoom: number): number {
  return (value - viewportOrigin) * zoom
}

function toScreenRect(rect: Rect, viewport: CanvasDebugOverlayViewport): Rect {
  return {
    x: worldToScreen(rect.x, viewport.x, viewport.zoom),
    y: worldToScreen(rect.y, viewport.y, viewport.zoom),
    width: rect.width * viewport.zoom,
    height: rect.height * viewport.zoom
  }
}

export function renderCanvasDebugOverlay(
  context: CanvasRenderingContext2D,
  commands: readonly CanvasDebugOverlayCommand[],
  viewport: CanvasDebugOverlayViewport
): void {
  context.save()
  context.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace'
  context.textBaseline = 'top'

  commands.forEach((command) => {
    switch (command.kind) {
      case 'rect': {
        const rect = toScreenRect(command.rect, viewport)
        context.fillStyle = command.fill
        context.strokeStyle = command.stroke
        context.lineWidth = command.lineWidth
        context.fillRect(rect.x, rect.y, rect.width, rect.height)
        context.strokeRect(rect.x, rect.y, rect.width, rect.height)
        break
      }
      case 'label':
        context.fillStyle = command.color
        context.fillText(
          command.text,
          worldToScreen(command.x, viewport.x, viewport.zoom),
          worldToScreen(command.y, viewport.y, viewport.zoom)
        )
        break
      case 'badge':
        context.beginPath()
        context.arc(
          worldToScreen(command.x, viewport.x, viewport.zoom),
          worldToScreen(command.y, viewport.y, viewport.zoom),
          command.radius,
          0,
          Math.PI * 2
        )
        context.fillStyle = command.fill
        context.fill()
        context.fillStyle = command.color
        context.textAlign = 'center'
        context.textBaseline = 'middle'
        context.fillText(
          command.text,
          worldToScreen(command.x, viewport.x, viewport.zoom),
          worldToScreen(command.y, viewport.y, viewport.zoom)
        )
        context.textAlign = 'start'
        context.textBaseline = 'top'
        break
    }
  })

  context.restore()
}
