/**
 * Sample ERP canvas prototype built from the ERP canvas plugin fixture.
 */

import type { XNetExtension } from '../manifest'
import type { CanvasPluginFixtureCardSample } from './canvas'
import { ERP_CANVAS_PLUGIN_FIXTURE } from './canvas'

export type CanvasErpPrototypeEntityKind = 'purchase-order' | 'inventory-item'

export type CanvasErpPrototypeRisk = 'low' | 'medium' | 'high'

export type CanvasErpPrototypeStatus =
  | 'awaiting-shipment'
  | 'in-transit'
  | 'qa-hold'
  | 'stockout-risk'
  | 'healthy'
  | 'receiving'

export type CanvasErpPrototypeLayoutKind =
  | 'supply-chain'
  | 'procurement-kanban'
  | 'inventory-risk-grid'
  | 'receiving-timeline'

export type CanvasErpPrototypeAuditOperation =
  | 'created'
  | 'moved'
  | 'resized'
  | 'field-updated'
  | 'bulk-updated'
  | 'synced'

export type CanvasErpPrototypeAuditSource = 'user' | 'plugin' | 'external-system'

export type CanvasErpPrototypeRect = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export type CanvasErpPrototypeCard = Omit<CanvasPluginFixtureCardSample, 'properties'> & {
  readonly sourceNodeId: `xnet://fixtures.erp/${string}`
  readonly entityKind: CanvasErpPrototypeEntityKind
  readonly status: CanvasErpPrototypeStatus
  readonly risk: CanvasErpPrototypeRisk
  readonly position: CanvasErpPrototypeRect
  readonly tags: readonly string[]
  readonly properties: Record<string, unknown>
}

export type CanvasErpPrototypeEdge = {
  readonly id: string
  readonly contributionId: 'erp.supplies' | 'erp.delayed-by'
  readonly sourceCardId: string
  readonly targetCardId: string
  readonly label: string
  readonly directed: true
  readonly style: 'solid' | 'dotted'
  readonly properties: Record<string, unknown>
}

export type CanvasErpPrototypeQueryPredicate = {
  readonly field: string
  readonly operator: 'equals' | 'not-equals' | 'less-than' | 'greater-than' | 'contains'
  readonly value: unknown
}

export type CanvasErpPrototypeQueryFrame = {
  readonly id: string
  readonly title: string
  readonly layoutKind: CanvasErpPrototypeLayoutKind
  readonly bounds: CanvasErpPrototypeRect
  readonly schemaIds: readonly `xnet://${string}/${string}`[]
  readonly predicates: readonly CanvasErpPrototypeQueryPredicate[]
  readonly cardIds: readonly string[]
}

export type CanvasErpPrototypeCommand = {
  readonly id: string
  readonly label: string
  readonly scope: 'single-card' | 'multi-card' | 'frame'
  readonly requiredPermissions: readonly ('canvas.read' | 'canvas.write' | 'canvas.layout')[]
  readonly supportedEntityKinds: readonly CanvasErpPrototypeEntityKind[]
}

export type CanvasErpPrototypeAuditEntry = {
  readonly id: string
  readonly cardId: string
  readonly operation: CanvasErpPrototypeAuditOperation
  readonly source: CanvasErpPrototypeAuditSource
  readonly actor: string
  readonly at: string
  readonly summary: string
  readonly batchId?: string
}

export type CanvasErpPrototypeRiskSummary = {
  readonly total: number
  readonly low: number
  readonly medium: number
  readonly high: number
}

export type CanvasErpPrototypeScenario = {
  readonly id: string
  readonly title: string
  readonly pluginManifest: XNetExtension
  readonly templateId: 'erp.procurement-war-room'
  readonly cards: readonly CanvasErpPrototypeCard[]
  readonly edges: readonly CanvasErpPrototypeEdge[]
  readonly queryFrames: readonly CanvasErpPrototypeQueryFrame[]
  readonly commands: readonly CanvasErpPrototypeCommand[]
  readonly auditEntries: readonly CanvasErpPrototypeAuditEntry[]
  readonly riskSummary: CanvasErpPrototypeRiskSummary
}

const ERP_PLUGIN_ID = ERP_CANVAS_PLUGIN_FIXTURE.manifest.id
const PURCHASE_ORDER_CONTRIBUTION_ID = 'erp.purchase-order-card'
const INVENTORY_ITEM_CONTRIBUTION_ID = 'erp.inventory-item-card'
const PROCUREMENT_TEMPLATE_ID = 'erp.procurement-war-room'

const PURCHASE_ORDER_SCHEMA: `xnet://${string}/${string}` =
  ERP_CANVAS_PLUGIN_FIXTURE.sampleCards.find(
    (card) => card.contributionId === PURCHASE_ORDER_CONTRIBUTION_ID
  )?.schemaId ?? 'xnet://fixtures.erp/purchase-order'

const INVENTORY_ITEM_SCHEMA: `xnet://${string}/${string}` =
  ERP_CANVAS_PLUGIN_FIXTURE.sampleCards.find(
    (card) => card.contributionId === INVENTORY_ITEM_CONTRIBUTION_ID
  )?.schemaId ?? 'xnet://fixtures.erp/inventory-item'

const createPurchaseOrderCard = (
  card: Omit<
    CanvasErpPrototypeCard,
    'pluginId' | 'contributionId' | 'schemaId' | 'provider' | 'canvasKind' | 'previewTier'
  >
): CanvasErpPrototypeCard => ({
  ...card,
  pluginId: ERP_PLUGIN_ID,
  contributionId: PURCHASE_ORDER_CONTRIBUTION_ID,
  schemaId: PURCHASE_ORDER_SCHEMA,
  provider: 'erp',
  canvasKind: 'workflow-item',
  previewTier: 'shell'
})

const createInventoryItemCard = (
  card: Omit<
    CanvasErpPrototypeCard,
    'pluginId' | 'contributionId' | 'schemaId' | 'provider' | 'canvasKind' | 'previewTier'
  >
): CanvasErpPrototypeCard => ({
  ...card,
  pluginId: ERP_PLUGIN_ID,
  contributionId: INVENTORY_ITEM_CONTRIBUTION_ID,
  schemaId: INVENTORY_ITEM_SCHEMA,
  provider: 'erp',
  canvasKind: 'record',
  previewTier: 'thumbnail'
})

const ERP_PROTOTYPE_CARDS: readonly CanvasErpPrototypeCard[] = [
  createPurchaseOrderCard({
    id: 'erp-prototype-po-1042',
    sourceNodeId: 'xnet://fixtures.erp/purchase-orders/po-1042',
    title: 'PO-1042',
    subtitle: 'Northwind Components',
    entityKind: 'purchase-order',
    status: 'awaiting-shipment',
    risk: 'medium',
    position: { x: -900, y: -280, width: 320, height: 188 },
    tags: ['procurement', 'northwind', 'late-watch'],
    properties: {
      supplier: 'Northwind Components',
      dueDate: '2026-06-12',
      totalUsd: 18750,
      receivingRisk: 'medium',
      owner: 'Riley Chen',
      lineItems: ['A17-SERVO', 'A17-BRACKET']
    }
  }),
  createInventoryItemCard({
    id: 'erp-prototype-inventory-servo',
    sourceNodeId: 'xnet://fixtures.erp/inventory/a17-servo',
    title: 'Servo Motor A17',
    subtitle: 'Warehouse 4',
    entityKind: 'inventory-item',
    status: 'stockout-risk',
    risk: 'high',
    position: { x: -420, y: -250, width: 300, height: 176 },
    tags: ['inventory', 'assembly-line-2', 'below-reorder'],
    properties: {
      sku: 'A17-SERVO',
      onHand: 42,
      reorderPoint: 60,
      leadTimeDays: 18,
      warehouse: 'SJC-4',
      reservedFor: ['WO-7781', 'WO-7784']
    }
  }),
  createPurchaseOrderCard({
    id: 'erp-prototype-po-1050',
    sourceNodeId: 'xnet://fixtures.erp/purchase-orders/po-1050',
    title: 'PO-1050',
    subtitle: 'Initech Fabrication',
    entityKind: 'purchase-order',
    status: 'receiving',
    risk: 'high',
    position: { x: -910, y: 40, width: 320, height: 188 },
    tags: ['procurement', 'receiving', 'expedite'],
    properties: {
      supplier: 'Initech Fabrication',
      dueDate: '2026-05-29',
      totalUsd: 44200,
      receivingRisk: 'high',
      owner: 'Morgan Patel',
      lineItems: ['B8-BEARING', 'A17-SERVO']
    }
  }),
  createInventoryItemCard({
    id: 'erp-prototype-inventory-bearing',
    sourceNodeId: 'xnet://fixtures.erp/inventory/b8-bearing',
    title: 'Bearing B8',
    subtitle: 'Warehouse 2',
    entityKind: 'inventory-item',
    status: 'healthy',
    risk: 'low',
    position: { x: -420, y: 65, width: 300, height: 176 },
    tags: ['inventory', 'stable'],
    properties: {
      sku: 'B8-BEARING',
      onHand: 310,
      reorderPoint: 120,
      leadTimeDays: 9,
      warehouse: 'SJC-2',
      reservedFor: ['WO-7781']
    }
  }),
  createPurchaseOrderCard({
    id: 'erp-prototype-po-1057',
    sourceNodeId: 'xnet://fixtures.erp/purchase-orders/po-1057',
    title: 'PO-1057',
    subtitle: 'Contoso Steel',
    entityKind: 'purchase-order',
    status: 'qa-hold',
    risk: 'high',
    position: { x: -895, y: 360, width: 320, height: 188 },
    tags: ['procurement', 'qa-hold', 'line-stop-risk'],
    properties: {
      supplier: 'Contoso Steel',
      dueDate: '2026-05-31',
      totalUsd: 73500,
      receivingRisk: 'high',
      owner: 'Dana Smith',
      lineItems: ['STL-4MM-SHEET']
    }
  }),
  createInventoryItemCard({
    id: 'erp-prototype-inventory-steel',
    sourceNodeId: 'xnet://fixtures.erp/inventory/stl-4mm-sheet',
    title: 'Steel Sheet 4mm',
    subtitle: 'Warehouse 1',
    entityKind: 'inventory-item',
    status: 'stockout-risk',
    risk: 'medium',
    position: { x: -415, y: 390, width: 300, height: 176 },
    tags: ['inventory', 'fabrication', 'watch'],
    properties: {
      sku: 'STL-4MM-SHEET',
      onHand: 88,
      reorderPoint: 90,
      leadTimeDays: 21,
      warehouse: 'SJC-1',
      reservedFor: ['WO-7790', 'WO-7792']
    }
  })
]

const ERP_PROTOTYPE_EDGES: readonly CanvasErpPrototypeEdge[] = [
  {
    id: 'erp-prototype-edge-po-1042-servo',
    contributionId: 'erp.supplies',
    sourceCardId: 'erp-prototype-po-1042',
    targetCardId: 'erp-prototype-inventory-servo',
    label: 'supplies',
    directed: true,
    style: 'solid',
    properties: {
      sku: 'A17-SERVO',
      quantity: 80,
      expectedDate: '2026-06-12'
    }
  },
  {
    id: 'erp-prototype-edge-po-1050-servo',
    contributionId: 'erp.supplies',
    sourceCardId: 'erp-prototype-po-1050',
    targetCardId: 'erp-prototype-inventory-servo',
    label: 'supplies',
    directed: true,
    style: 'solid',
    properties: {
      sku: 'A17-SERVO',
      quantity: 30,
      expectedDate: '2026-05-29'
    }
  },
  {
    id: 'erp-prototype-edge-bearing-delay',
    contributionId: 'erp.delayed-by',
    sourceCardId: 'erp-prototype-inventory-bearing',
    targetCardId: 'erp-prototype-po-1050',
    label: 'delayed by',
    directed: true,
    style: 'dotted',
    properties: {
      reason: 'receiving backlog',
      etaDays: 2
    }
  },
  {
    id: 'erp-prototype-edge-po-1057-steel',
    contributionId: 'erp.supplies',
    sourceCardId: 'erp-prototype-po-1057',
    targetCardId: 'erp-prototype-inventory-steel',
    label: 'supplies',
    directed: true,
    style: 'solid',
    properties: {
      sku: 'STL-4MM-SHEET',
      quantity: 240,
      expectedDate: '2026-05-31'
    }
  }
]

const ERP_PROTOTYPE_QUERY_FRAMES: readonly CanvasErpPrototypeQueryFrame[] = [
  {
    id: 'erp-prototype-frame-supply-chain',
    title: 'Supplier to Inventory Flow',
    layoutKind: 'supply-chain',
    bounds: { x: -1010, y: -360, width: 1040, height: 1040 },
    schemaIds: [PURCHASE_ORDER_SCHEMA, INVENTORY_ITEM_SCHEMA],
    predicates: [{ field: 'risk', operator: 'not-equals', value: 'low' }],
    cardIds: [
      'erp-prototype-po-1042',
      'erp-prototype-inventory-servo',
      'erp-prototype-po-1050',
      'erp-prototype-po-1057',
      'erp-prototype-inventory-steel'
    ]
  },
  {
    id: 'erp-prototype-frame-procurement-kanban',
    title: 'Procurement Kanban',
    layoutKind: 'procurement-kanban',
    bounds: { x: 120, y: -320, width: 880, height: 420 },
    schemaIds: [PURCHASE_ORDER_SCHEMA],
    predicates: [{ field: 'entityKind', operator: 'equals', value: 'purchase-order' }],
    cardIds: ['erp-prototype-po-1042', 'erp-prototype-po-1050', 'erp-prototype-po-1057']
  },
  {
    id: 'erp-prototype-frame-inventory-risk',
    title: 'Inventory Risk Grid',
    layoutKind: 'inventory-risk-grid',
    bounds: { x: 120, y: 190, width: 880, height: 420 },
    schemaIds: [INVENTORY_ITEM_SCHEMA],
    predicates: [{ field: 'entityKind', operator: 'equals', value: 'inventory-item' }],
    cardIds: [
      'erp-prototype-inventory-servo',
      'erp-prototype-inventory-bearing',
      'erp-prototype-inventory-steel'
    ]
  }
]

const ERP_PROTOTYPE_COMMANDS: readonly CanvasErpPrototypeCommand[] = [
  {
    id: 'erp.command.expedite-selected',
    label: 'Expedite selected',
    scope: 'multi-card',
    requiredPermissions: ['canvas.read', 'canvas.write'],
    supportedEntityKinds: ['purchase-order']
  },
  {
    id: 'erp.command.rebalance-inventory',
    label: 'Rebalance inventory',
    scope: 'frame',
    requiredPermissions: ['canvas.read', 'canvas.write', 'canvas.layout'],
    supportedEntityKinds: ['inventory-item']
  },
  {
    id: 'erp.command.open-source-record',
    label: 'Open ERP record',
    scope: 'single-card',
    requiredPermissions: ['canvas.read'],
    supportedEntityKinds: ['purchase-order', 'inventory-item']
  }
]

const ERP_PROTOTYPE_AUDIT_ENTRIES: readonly CanvasErpPrototypeAuditEntry[] = [
  {
    id: 'erp-prototype-audit-create-po-1057',
    cardId: 'erp-prototype-po-1057',
    operation: 'created',
    source: 'plugin',
    actor: 'ERP sync',
    at: '2026-05-25T09:15:00.000Z',
    summary: 'Created from Contoso Steel purchase order update.'
  },
  {
    id: 'erp-prototype-audit-move-servo',
    cardId: 'erp-prototype-inventory-servo',
    operation: 'moved',
    source: 'user',
    actor: 'Riley Chen',
    at: '2026-05-25T09:22:00.000Z',
    summary: 'Moved next to related purchase orders in supply-chain view.',
    batchId: 'erp-prototype-batch-layout-1'
  },
  {
    id: 'erp-prototype-audit-resize-kanban',
    cardId: 'erp-prototype-po-1050',
    operation: 'resized',
    source: 'user',
    actor: 'Morgan Patel',
    at: '2026-05-25T09:24:00.000Z',
    summary: 'Resized to expose receiving risk and line-item details.',
    batchId: 'erp-prototype-batch-layout-1'
  },
  {
    id: 'erp-prototype-audit-bulk-expedite',
    cardId: 'erp-prototype-po-1050',
    operation: 'bulk-updated',
    source: 'user',
    actor: 'Morgan Patel',
    at: '2026-05-25T09:29:00.000Z',
    summary: 'Marked high-risk purchase orders for expedite workflow.',
    batchId: 'erp-prototype-batch-expedite-1'
  },
  {
    id: 'erp-prototype-audit-sync-steel',
    cardId: 'erp-prototype-inventory-steel',
    operation: 'synced',
    source: 'external-system',
    actor: 'ERP connector',
    at: '2026-05-25T09:33:00.000Z',
    summary: 'Refreshed on-hand quantity and lead-time projection.'
  }
]

const countCardsByRisk = (
  cards: readonly CanvasErpPrototypeCard[],
  risk: CanvasErpPrototypeRisk
): number => cards.filter((card) => card.risk === risk).length

const isDefined = <T>(value: T | undefined): value is T => value !== undefined

export function createCanvasErpPrototypeRiskSummary(
  cards: readonly CanvasErpPrototypeCard[]
): CanvasErpPrototypeRiskSummary {
  return {
    total: cards.length,
    low: countCardsByRisk(cards, 'low'),
    medium: countCardsByRisk(cards, 'medium'),
    high: countCardsByRisk(cards, 'high')
  }
}

export function createCanvasErpPrototypeScenario(): CanvasErpPrototypeScenario {
  const cards = ERP_PROTOTYPE_CARDS

  return {
    id: 'erp-prototype-procurement-war-room',
    title: 'ERP Procurement War Room',
    pluginManifest: ERP_CANVAS_PLUGIN_FIXTURE.manifest,
    templateId: PROCUREMENT_TEMPLATE_ID,
    cards,
    edges: ERP_PROTOTYPE_EDGES,
    queryFrames: ERP_PROTOTYPE_QUERY_FRAMES,
    commands: ERP_PROTOTYPE_COMMANDS,
    auditEntries: ERP_PROTOTYPE_AUDIT_ENTRIES,
    riskSummary: createCanvasErpPrototypeRiskSummary(cards)
  }
}

export function getCanvasErpPrototypeCardsForFrame(
  scenario: CanvasErpPrototypeScenario,
  frameId: string
): CanvasErpPrototypeCard[] {
  const byId = new Map(scenario.cards.map((card) => [card.id, card]))
  const frame = scenario.queryFrames.find((candidate) => candidate.id === frameId)

  return (frame?.cardIds ?? []).map((cardId) => byId.get(cardId)).filter(isDefined)
}

export function getCanvasErpPrototypeAuditEntriesForCard(
  scenario: CanvasErpPrototypeScenario,
  cardId: string
): CanvasErpPrototypeAuditEntry[] {
  return scenario.auditEntries.filter((entry) => entry.cardId === cardId)
}
