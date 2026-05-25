/**
 * Cross-tile connector storage and far-field edge summaries.
 */

import type { CanvasConnectorRecord } from './provider'
import type { Point, Rect, TileAddress } from './types'
import { createTileId, parseTileId } from './tiles'

const DEFAULT_MAX_ANCESTOR_ZOOM = 30
const DEFAULT_MAX_SAMPLE_CONNECTORS = 8

export type ConnectorStorageKind = 'local-tile' | 'ancestor-tile' | 'tile-pair'

export type ConnectorStoragePlan = {
  connectorId: string
  storageKey: string
  storageKind: ConnectorStorageKind
  sourceTileId: string
  targetTileId: string
  crossTile: boolean
}

export type FarFieldEdgeSummary = {
  storageKey: string
  sourceTileId: string
  targetTileId: string
  connectorCount: number
  bounds: Rect
  sampleConnectorIds: readonly string[]
}

export type CreateConnectorStoragePlanOptions = {
  maxAncestorZoom?: number
}

export type CreateFarFieldEdgeSummariesOptions = CreateConnectorStoragePlanOptions & {
  maxSampleConnectors?: number
}

function getParentTileAddress(address: TileAddress): TileAddress {
  return {
    z: address.z + 1,
    x: Math.floor(address.x / 2),
    y: Math.floor(address.y / 2)
  }
}

function getAncestorAtZoom(address: TileAddress, z: number): TileAddress {
  let current = address

  while (current.z < z) {
    current = getParentTileAddress(current)
  }

  return current
}

function compareTileAddress(left: TileAddress, right: TileAddress): number {
  return left.z - right.z || left.x - right.x || left.y - right.y
}

function getLowestCommonAncestorTileAddress(input: {
  source: TileAddress
  target: TileAddress
  maxAncestorZoom: number
}): TileAddress | undefined {
  let source = getAncestorAtZoom(input.source, Math.max(input.source.z, input.target.z))
  let target = getAncestorAtZoom(input.target, Math.max(input.source.z, input.target.z))

  while (source.z <= input.maxAncestorZoom) {
    if (compareTileAddress(source, target) === 0) {
      return source
    }

    source = getParentTileAddress(source)
    target = getParentTileAddress(target)
  }

  return undefined
}

function createTilePairStorageKey(sourceTileId: string, targetTileId: string): string {
  return `tile-pair:${[sourceTileId, targetTileId].sort().join('|')}`
}

function createBoundsFromPoints(points: readonly Point[]): Rect {
  const minX = Math.min(...points.map((point) => point.x))
  const minY = Math.min(...points.map((point) => point.y))
  const maxX = Math.max(...points.map((point) => point.x))
  const maxY = Math.max(...points.map((point) => point.y))

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  }
}

function combineBounds(bounds: readonly Rect[]): Rect {
  const minX = Math.min(...bounds.map((rect) => rect.x))
  const minY = Math.min(...bounds.map((rect) => rect.y))
  const maxX = Math.max(...bounds.map((rect) => rect.x + rect.width))
  const maxY = Math.max(...bounds.map((rect) => rect.y + rect.height))

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  }
}

export function createConnectorStoragePlan(
  connector: CanvasConnectorRecord,
  { maxAncestorZoom = DEFAULT_MAX_ANCESTOR_ZOOM }: CreateConnectorStoragePlanOptions = {}
): ConnectorStoragePlan {
  const sourceTileId = connector.source.tileId
  const targetTileId = connector.target.tileId

  if (sourceTileId === targetTileId) {
    return {
      connectorId: connector.id,
      storageKey: sourceTileId,
      storageKind: 'local-tile',
      sourceTileId,
      targetTileId,
      crossTile: false
    }
  }

  const sourceAddress = parseTileId(sourceTileId)
  const targetAddress = parseTileId(targetTileId)
  const ancestor =
    sourceAddress && targetAddress
      ? getLowestCommonAncestorTileAddress({
          source: sourceAddress,
          target: targetAddress,
          maxAncestorZoom
        })
      : undefined

  return {
    connectorId: connector.id,
    storageKey: ancestor
      ? createTileId(ancestor)
      : createTilePairStorageKey(sourceTileId, targetTileId),
    storageKind: ancestor ? 'ancestor-tile' : 'tile-pair',
    sourceTileId,
    targetTileId,
    crossTile: true
  }
}

export function createFarFieldEdgeSummaries(
  connectors: readonly CanvasConnectorRecord[],
  {
    maxAncestorZoom = DEFAULT_MAX_ANCESTOR_ZOOM,
    maxSampleConnectors = DEFAULT_MAX_SAMPLE_CONNECTORS
  }: CreateFarFieldEdgeSummariesOptions = {}
): FarFieldEdgeSummary[] {
  const crossTileRows = connectors
    .map((connector) => ({
      connector,
      storage: createConnectorStoragePlan(connector, { maxAncestorZoom }),
      bounds: createBoundsFromPoints([connector.source.anchor, connector.target.anchor])
    }))
    .filter((row) => row.storage.crossTile)
  const groupedRows = crossTileRows.reduce<Map<string, typeof crossTileRows>>((groups, row) => {
    const key = [row.storage.storageKey, row.storage.sourceTileId, row.storage.targetTileId].join(
      '|'
    )
    const existing = groups.get(key) ?? []

    groups.set(key, [...existing, row])
    return groups
  }, new Map())

  return Array.from(groupedRows.values())
    .map((rows) => {
      const [first] = rows

      return {
        storageKey: first.storage.storageKey,
        sourceTileId: first.storage.sourceTileId,
        targetTileId: first.storage.targetTileId,
        connectorCount: rows.length,
        bounds: combineBounds(rows.map((row) => row.bounds)),
        sampleConnectorIds: rows
          .map((row) => row.connector.id)
          .sort()
          .slice(0, Math.max(0, Math.floor(maxSampleConnectors)))
      }
    })
    .sort(
      (left, right) =>
        left.storageKey.localeCompare(right.storageKey) ||
        left.sourceTileId.localeCompare(right.sourceTileId) ||
        left.targetTileId.localeCompare(right.targetTileId)
    )
}
