/**
 * Worker payload helpers for Canvas v3 tile summary generation.
 */

import type { CanvasObjectKind, CanvasTileSummary } from './types'
import {
  createCanvasTileSummaries,
  type CanvasTileSummaryEdge,
  type CanvasTileSummaryObject
} from './summary'

const PAYLOAD_MAGIC = 0x58434f31
const PAYLOAD_VERSION = 1
const HEADER_BYTES = 16
const RECORD_BYTES = 40

const CANVAS_OBJECT_KINDS: readonly CanvasObjectKind[] = [
  'page',
  'database',
  'external-reference',
  'media',
  'shape',
  'note',
  'group',
  'task'
]

const KIND_TO_CODE = new Map<CanvasObjectKind, number>(
  CANVAS_OBJECT_KINDS.map((kind, index) => [kind, index])
)

export type TransferableCanvasObjectPayload = {
  buffer: ArrayBuffer
  transferables: readonly ArrayBuffer[]
}

export type DecodeCanvasObjectPayloadResult = {
  valid: boolean
  errors: readonly string[]
  objects: readonly CanvasTileSummaryObject[]
}

export type CanvasTileSummaryWorkerRequest = {
  type: 'create-tile-summaries'
  requestId: string
  objectPayload: TransferableCanvasObjectPayload
  edges?: readonly CanvasTileSummaryEdge[]
  tileSize?: number
  densityColumns?: number
  densityRows?: number
  maxClustersPerTile?: number
}

export type CanvasTileSummaryWorkerResponse = {
  type: 'tile-summaries-created'
  requestId: string
  valid: boolean
  errors: readonly string[]
  decodedObjectCount: number
  summaries: readonly CanvasTileSummary[]
}

export function createTransferableCanvasObjectPayload(
  objects: readonly CanvasTileSummaryObject[]
): TransferableCanvasObjectPayload {
  const objectIds = objects.map((object) => object.id)
  const stringBytes = new TextEncoder().encode(JSON.stringify(objectIds))
  const buffer = new ArrayBuffer(
    HEADER_BYTES + stringBytes.byteLength + objects.length * RECORD_BYTES
  )
  const view = new DataView(buffer)

  view.setUint32(0, PAYLOAD_MAGIC, true)
  view.setUint32(4, PAYLOAD_VERSION, true)
  view.setUint32(8, objects.length, true)
  view.setUint32(12, stringBytes.byteLength, true)
  new Uint8Array(buffer, HEADER_BYTES, stringBytes.byteLength).set(stringBytes)

  objects.forEach((object, index) => {
    const offset = HEADER_BYTES + stringBytes.byteLength + index * RECORD_BYTES

    view.setUint32(offset, index, true)
    view.setUint16(
      offset + 4,
      KIND_TO_CODE.get(object.kind) ?? KIND_TO_CODE.get('shape') ?? 0,
      true
    )
    view.setUint16(offset + 6, 0, true)
    view.setFloat64(offset + 8, object.position.x, true)
    view.setFloat64(offset + 16, object.position.y, true)
    view.setFloat64(offset + 24, object.position.width, true)
    view.setFloat64(offset + 32, object.position.height, true)
  })

  return {
    buffer,
    transferables: [buffer]
  }
}

function createDecodeError(error: string): DecodeCanvasObjectPayloadResult {
  return {
    valid: false,
    errors: [error],
    objects: []
  }
}

function decodeStringTable(buffer: ArrayBuffer, length: number): string[] | undefined {
  try {
    const bytes = new Uint8Array(buffer, HEADER_BYTES, length)
    const decoded = JSON.parse(new TextDecoder().decode(bytes))

    return Array.isArray(decoded) && decoded.every((item) => typeof item === 'string')
      ? decoded
      : undefined
  } catch {
    return undefined
  }
}

export function decodeTransferableCanvasObjectPayload(
  payload: Pick<TransferableCanvasObjectPayload, 'buffer'>
): DecodeCanvasObjectPayloadResult {
  if (payload.buffer.byteLength < HEADER_BYTES) {
    return createDecodeError('Payload is smaller than the Canvas object header.')
  }

  const view = new DataView(payload.buffer)
  const magic = view.getUint32(0, true)
  const version = view.getUint32(4, true)
  const objectCount = view.getUint32(8, true)
  const stringByteLength = view.getUint32(12, true)
  const recordsOffset = HEADER_BYTES + stringByteLength
  const expectedByteLength = recordsOffset + objectCount * RECORD_BYTES

  if (magic !== PAYLOAD_MAGIC) {
    return createDecodeError('Payload magic does not match Canvas object payloads.')
  }

  if (version !== PAYLOAD_VERSION) {
    return createDecodeError(`Unsupported Canvas object payload version: ${version}.`)
  }

  if (payload.buffer.byteLength !== expectedByteLength) {
    return createDecodeError('Payload byte length does not match header counts.')
  }

  const objectIds = decodeStringTable(payload.buffer, stringByteLength)
  if (!objectIds || objectIds.length !== objectCount) {
    return createDecodeError('Payload string table does not match object count.')
  }

  return {
    valid: true,
    errors: [],
    objects: Array.from({ length: objectCount }, (_, index) => {
      const offset = recordsOffset + index * RECORD_BYTES
      const idIndex = view.getUint32(offset, true)
      const kindCode = view.getUint16(offset + 4, true)

      return {
        id: objectIds[idIndex] ?? `missing:${index}`,
        kind: CANVAS_OBJECT_KINDS[kindCode] ?? 'shape',
        position: {
          x: view.getFloat64(offset + 8, true),
          y: view.getFloat64(offset + 16, true),
          width: view.getFloat64(offset + 24, true),
          height: view.getFloat64(offset + 32, true)
        }
      }
    })
  }
}

export function handleCanvasTileSummaryWorkerRequest(
  request: CanvasTileSummaryWorkerRequest
): CanvasTileSummaryWorkerResponse {
  const decoded = decodeTransferableCanvasObjectPayload(request.objectPayload)

  if (!decoded.valid) {
    return {
      type: 'tile-summaries-created',
      requestId: request.requestId,
      valid: false,
      errors: decoded.errors,
      decodedObjectCount: 0,
      summaries: []
    }
  }

  return {
    type: 'tile-summaries-created',
    requestId: request.requestId,
    valid: true,
    errors: [],
    decodedObjectCount: decoded.objects.length,
    summaries: createCanvasTileSummaries({
      objects: decoded.objects,
      edges: request.edges,
      tileSize: request.tileSize,
      densityColumns: request.densityColumns,
      densityRows: request.densityRows,
      maxClustersPerTile: request.maxClustersPerTile
    })
  }
}
