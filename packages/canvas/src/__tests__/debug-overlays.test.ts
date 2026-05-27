/**
 * Canvas v3 debug overlay tests.
 */

import { describe, expect, it, vi } from 'vitest'
import {
  createCanvasDebugOverlayCommands,
  renderCanvasDebugOverlay,
  type CanvasDebugOverlayCommand
} from '../renderer/debug-overlays'

function createContextMock(): CanvasRenderingContext2D {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn()
  } as unknown as CanvasRenderingContext2D
}

describe('Canvas debug overlays', () => {
  it('creates tile boundary, LOD, cache, and sync room commands', () => {
    const commands = createCanvasDebugOverlayCommands({
      tiles: [
        {
          tileId: '0/1/2',
          bounds: { x: 4096, y: 8192, width: 4096, height: 4096 },
          lodTier: 'vector-tile',
          cacheStatus: 'stale',
          syncRoomId: 'tile-0-1-2',
          subscribed: true,
          peerCount: 7
        }
      ]
    })

    expect(commands).toEqual([
      {
        kind: 'rect',
        rect: { x: 4096, y: 8192, width: 4096, height: 4096 },
        stroke: 'rgba(249, 115, 22, 0.82)',
        fill: 'rgba(14, 165, 233, 0.08)',
        lineWidth: 2
      },
      { kind: 'label', x: 4104, y: 8208, text: '0/1/2', color: 'rgba(15, 23, 42, 0.92)' },
      { kind: 'label', x: 4104, y: 8222, text: 'L3', color: 'rgba(71, 85, 105, 0.92)' },
      { kind: 'label', x: 4104, y: 8236, text: 'stale', color: 'rgba(71, 85, 105, 0.92)' },
      {
        kind: 'label',
        x: 4104,
        y: 8250,
        text: 'room:tile-0-1-2',
        color: 'rgba(71, 85, 105, 0.92)'
      },
      { kind: 'label', x: 4104, y: 8264, text: 'peers:7', color: 'rgba(71, 85, 105, 0.92)' },
      {
        kind: 'badge',
        x: 8174,
        y: 8210,
        radius: 10,
        text: '7',
        fill: 'rgba(14, 165, 233, 0.9)',
        color: 'white'
      }
    ])
  })

  it('can hide individual debug channels', () => {
    const commands = createCanvasDebugOverlayCommands({
      showTileBoundaries: false,
      showCacheStatus: false,
      showSyncRooms: false,
      tiles: [
        {
          tileId: '0/0/0',
          bounds: { x: 0, y: 0, width: 4096, height: 4096 },
          lodTier: 'raster-tile',
          cacheStatus: 'hot',
          syncRoomId: 'room',
          peerCount: 10
        }
      ]
    })

    expect(commands.map((command) => command.kind)).toEqual(['label', 'label'])
    expect(commands.map((command) => ('text' in command ? command.text : null))).toEqual([
      '0/0/0',
      'L4'
    ])
  })

  it('renders commands through a Canvas 2D context with viewport transforms', () => {
    const context = createContextMock()
    const commands: CanvasDebugOverlayCommand[] = [
      {
        kind: 'rect',
        rect: { x: 100, y: 200, width: 300, height: 400 },
        stroke: 'red',
        fill: 'blue',
        lineWidth: 2
      },
      { kind: 'label', x: 120, y: 220, text: 'L0', color: 'black' },
      { kind: 'badge', x: 380, y: 220, radius: 10, text: '2', fill: 'green', color: 'white' }
    ]

    renderCanvasDebugOverlay(context, commands, { x: 100, y: 200, zoom: 2 })

    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 600, 800)
    expect(context.strokeRect).toHaveBeenCalledWith(0, 0, 600, 800)
    expect(context.fillText).toHaveBeenCalledWith('L0', 40, 40)
    expect(context.arc).toHaveBeenCalledWith(560, 40, 10, 0, Math.PI * 2)
    expect(context.restore).toHaveBeenCalled()
  })
})
