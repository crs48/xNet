/** Desk card helpers (0273): reading order, metadata, radial ring, nav hiding. */
import type { CanvasNode } from '@xnetjs/canvas'
import { PageSchema } from '@xnetjs/data'
import { describe, expect, it } from 'vitest'
import {
  deskCardMeta,
  orderDeskCards,
  radialActionsFor,
  radialOffset,
  resolveNavHidden
} from './desk-cards'

function card(input: Partial<CanvasNode> & { id: string }): CanvasNode {
  return {
    type: 'note',
    position: { x: 0, y: 0, width: 100, height: 80 },
    properties: {},
    ...input
  } as CanvasNode
}

describe('orderDeskCards', () => {
  it('sorts by reading order (top-to-bottom, then left-to-right)', () => {
    const cards = [
      card({ id: 'c', position: { x: 0, y: 200, width: 1, height: 1 } }),
      card({ id: 'b', position: { x: 300, y: 0, width: 1, height: 1 } }),
      card({ id: 'a', position: { x: 0, y: 0, width: 1, height: 1 } })
    ]
    expect(orderDeskCards(cards).map((c) => c.id)).toEqual(['a', 'b', 'c'])
  })

  it('drops shapes and groups (arrangement, not content)', () => {
    const cards = [
      card({ id: 'shape', type: 'shape' }),
      card({ id: 'group', type: 'group' }),
      card({ id: 'note' })
    ]
    expect(orderDeskCards(cards).map((c) => c.id)).toEqual(['note'])
  })

  it('tolerates cards with missing positions', () => {
    const cards = [
      card({ id: 'a', position: undefined as unknown as CanvasNode['position'] }),
      card({ id: 'b', position: { x: -5, y: -5, width: 1, height: 1 } })
    ]
    expect(orderDeskCards(cards).map((c) => c.id)).toEqual(['b', 'a'])
  })
})

describe('deskCardMeta', () => {
  it('resolves source-backed cards as openable with their route family', () => {
    const meta = deskCardMeta(
      card({
        id: 'a',
        type: 'page',
        sourceNodeId: 'n1',
        sourceSchemaId: PageSchema._schemaId,
        properties: { title: 'My page' }
      })
    )
    expect(meta).toEqual({
      nodeType: 'page',
      sourceNodeId: 'n1',
      label: 'My page',
      openable: true
    })
  })

  it('prefers the alias, falls back to title, then Untitled', () => {
    expect(
      deskCardMeta(card({ id: 'a', alias: ' Alias ', properties: { title: 'T' } })).label
    ).toBe('Alias')
    expect(deskCardMeta(card({ id: 'a', properties: { title: 'T' } })).label).toBe('T')
    expect(deskCardMeta(card({ id: 'a' })).label).toBe('Untitled')
  })

  it('marks unknown-schema and sourceless cards unopenable', () => {
    expect(
      deskCardMeta(card({ id: 'a', sourceSchemaId: 'nope', sourceNodeId: 'n' })).openable
    ).toBe(false)
    expect(deskCardMeta(card({ id: 'a' })).openable).toBe(false)
  })
})

describe('radialActionsFor', () => {
  it('gives openable cards the full ring, others just Remove', () => {
    expect(
      radialActionsFor({ nodeType: 'page', sourceNodeId: 'n', label: 'x', openable: true }).map(
        (a) => a.id
      )
    ).toEqual(['open', 'peek', 'remove'])
    expect(
      radialActionsFor({ nodeType: null, sourceNodeId: null, label: 'x', openable: false }).map(
        (a) => a.id
      )
    ).toEqual(['remove'])
  })

  it('stays within the marking-menu ceiling (≤8, one level)', () => {
    expect(
      radialActionsFor({ nodeType: 'page', sourceNodeId: 'n', label: 'x', openable: true }).length
    ).toBeLessThanOrEqual(8)
  })
})

describe('radialOffset', () => {
  it('spreads items across the top arc (never under the finger)', () => {
    const first = radialOffset(0, 3, 64)
    const last = radialOffset(2, 3, 64)
    expect(first.dy).toBeLessThan(0)
    expect(last.dy).toBeLessThan(0)
    expect(first.dx).toBeLessThan(last.dx)
  })

  it('handles a single-item ring without dividing by zero', () => {
    const only = radialOffset(0, 1, 64)
    expect(Number.isFinite(only.dx)).toBe(true)
    expect(Number.isFinite(only.dy)).toBe(true)
  })
})

describe('resolveNavHidden', () => {
  it('hides on a real scroll down past the fold', () => {
    expect(resolveNavHidden(false, 20, 100)).toBe(true)
  })

  it('never hides near the top', () => {
    expect(resolveNavHidden(false, 20, 20)).toBe(false)
  })

  it('reveals on any flick up', () => {
    expect(resolveNavHidden(true, -20, 500)).toBe(false)
  })

  it('holds state for small jitters', () => {
    expect(resolveNavHidden(true, 2, 500)).toBe(true)
    expect(resolveNavHidden(false, -2, 500)).toBe(false)
  })
})
