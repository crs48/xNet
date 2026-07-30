import { describe, expect, it } from 'vitest'
import { frameFromCanvasNode, frameFromDatabaseEmbed, frameFromPageEmbed } from './adapters.js'
import { FrameSourceRegistry } from './registry.js'
import { FRAME_MAX_DEPTH } from './types.js'

const noopComponent = (() => null) as never

describe('FrameSourceRegistry', () => {
  it('matches schema-specific renderers by base IRI (version-agnostic)', () => {
    const registry = new FrameSourceRegistry()
    registry.register({
      id: 'database',
      supportedSchemas: ['xnet://xnet.fyi/Database@2.0.0'],
      component: noopComponent
    })
    expect(registry.getForSchema('xnet://xnet.fyi/Database@2.1.0')?.id).toBe('database')
    expect(registry.getForSchema('xnet://xnet.fyi/Page@1.0.0')).toBeUndefined()
  })

  it('prefers specific renderers over wildcard, falls back to wildcard', () => {
    const registry = new FrameSourceRegistry()
    registry.register({ id: 'any', supportedSchemas: '*', component: noopComponent })
    registry.register({
      id: 'page',
      supportedSchemas: ['xnet://xnet.fyi/Page@1.0.0'],
      component: noopComponent
    })
    expect(registry.getForSchema('xnet://xnet.fyi/Page@1.0.0')?.id).toBe('page')
    expect(registry.getForSchema('xnet://xnet.fyi/Task@1.0.0')?.id).toBe('any')
  })

  it('register returns a working disposable and notifies onChange', () => {
    const registry = new FrameSourceRegistry()
    let changes = 0
    registry.onChange(() => changes++)
    const disposable = registry.register({
      id: 'x',
      supportedSchemas: '*',
      component: noopComponent
    })
    expect(registry.has('x')).toBe(true)
    disposable.dispose()
    expect(registry.has('x')).toBe(false)
    expect(changes).toBe(2)
  })
})

describe('frame adapters', () => {
  it('maps databaseEmbed block props onto a live node frame', () => {
    const frame = frameFromDatabaseEmbed({
      blockId: 'b1',
      databaseId: 'db1',
      viewType: 'map',
      viewConfig: { latField: 'f1' }
    })
    expect(frame).toMatchObject({
      id: 'block:b1',
      source: { kind: 'node', nodeId: 'db1' },
      viewType: 'map',
      tier: 'live',
      config: { latField: 'f1' }
    })
  })

  it('defaults empty view types to table', () => {
    expect(
      frameFromDatabaseEmbed({ blockId: 'b', databaseId: 'db', viewType: '', viewConfig: {} })
        .viewType
    ).toBe('table')
  })

  it('maps pageEmbed onto a summary transclusion frame', () => {
    expect(frameFromPageEmbed({ blockId: 'b2', nodeId: 'p1' })).toMatchObject({
      id: 'block:b2',
      source: { kind: 'node', nodeId: 'p1' },
      tier: 'summary'
    })
  })

  it('maps canvas placement onto frame layout (space geometry)', () => {
    const frame = frameFromCanvasNode({
      objectId: 'o1',
      sourceNodeId: 'db1',
      x: 10,
      y: 20,
      width: 400,
      height: 300
    })
    expect(frame.layout).toEqual({ x: 10, y: 20, w: 400, h: 300 })
    expect(frame.id).toBe('canvas:o1')
  })
})

describe('depth clamp constant', () => {
  it('clamps at two levels of transclusion', () => {
    expect(FRAME_MAX_DEPTH).toBe(2)
  })
})
