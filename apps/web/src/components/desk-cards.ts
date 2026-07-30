/**
 * Desk card helpers (0273) — the pure logic behind the Desk's list
 * projection and radial menu, extracted so it unit-tests without a DOM
 * and the components stay presentation-only.
 */
import type { TabNodeType } from '../workbench/state'
import type { CanvasNode } from '@xnetjs/canvas'
import { SCHEMA_IDS } from '../workbench/views/explorer-items'

/** schemaId → explorer node type (the route family for a pinned card). */
export const NODE_TYPE_BY_SCHEMA: Record<string, TabNodeType> = Object.fromEntries(
  Object.entries(SCHEMA_IDS).map(([nodeType, schemaId]) => [schemaId, nodeType as TabNodeType])
)

export interface DeskCardMeta {
  /** Route family of the source node, when the card is source-backed. */
  nodeType: TabNodeType | null
  /** Source node id, when openable. */
  sourceNodeId: string | null
  /** Display label (alias → title → Untitled). */
  label: string
  /** Whether the card can open its source's full surface. */
  openable: boolean
}

function cardTitle(card: CanvasNode): string {
  const alias = card.alias?.trim()
  if (alias) return alias
  const title = card.properties?.title
  return typeof title === 'string' && title ? title : 'Untitled'
}

/** Resolve a Desk card's navigation metadata. */
export function deskCardMeta(card: CanvasNode): DeskCardMeta {
  const nodeType = card.sourceSchemaId ? (NODE_TYPE_BY_SCHEMA[card.sourceSchemaId] ?? null) : null
  const sourceNodeId = card.sourceNodeId ?? null
  return {
    nodeType,
    sourceNodeId,
    label: cardTitle(card),
    openable: nodeType != null && sourceNodeId != null
  }
}

function positionOf(card: CanvasNode): { x: number; y: number } {
  return { x: card.position?.x ?? 0, y: card.position?.y ?? 0 }
}

/**
 * Board reading order for the list projection: top-to-bottom, then
 * left-to-right — also the screen-reader traversal order. Shapes and
 * groups are arrangement, not content, and drop out.
 */
export function orderDeskCards(cards: readonly CanvasNode[]): CanvasNode[] {
  return cards
    .filter((card) => card.type !== 'shape' && card.type !== 'group')
    .sort((a, b) => {
      const pa = positionOf(a)
      const pb = positionOf(b)
      return pa.y - pb.y || pa.x - pb.x
    })
}

export interface DeskRadialActionDef {
  id: 'open' | 'peek' | 'remove'
  label: string
}

/**
 * The radial ring for a card, ≤8 items on one level (marking-menu
 * ceiling): source-backed cards get Open + Peek; everything can Remove.
 */
export function radialActionsFor(meta: DeskCardMeta): DeskRadialActionDef[] {
  const actions: DeskRadialActionDef[] = []
  if (meta.openable) {
    actions.push({ id: 'open', label: 'Open' })
    actions.push({ id: 'peek', label: 'Peek' })
  }
  actions.push({ id: 'remove', label: 'Remove from Desk' })
  return actions
}

/**
 * Placement of ring item `index` of `count` across the top arc, so items
 * never sit under the pressing finger.
 */
export function radialOffset(
  index: number,
  count: number,
  radius: number
): { dx: number; dy: number } {
  // 135° → 45°: upper-left across to upper-right.
  const angle = Math.PI * (0.75 - (index / Math.max(count - 1, 1)) * 0.5)
  return { dx: Math.cos(angle) * radius, dy: -Math.sin(angle) * radius }
}

/**
 * Auto-hiding bottom nav (quiet posture, 0273): reading (scrolling down,
 * past the fold) hides it; any flick up reveals it. Pure decision so the
 * scroll listener stays a one-liner.
 */
export function resolveNavHidden(prevHidden: boolean, delta: number, scrollTop: number): boolean {
  if (delta > 8 && scrollTop > 48) return true
  if (delta < -8) return false
  return prevHidden
}
