import { describe, expect, it } from 'vitest'
import {
  createTransferableCanvasObjectPayload,
  decodeTransferableCanvasObjectPayload,
  handleCanvasTileSummaryWorkerRequest,
  type TransferableCanvasObjectPayload
} from './workers'

describe('tile summary worker payloads', () => {
  it('round-trips Canvas summary objects through a transferable binary payload', () => {
    const payload = createTransferableCanvasObjectPayload([
      {
        id: 'page-1',
        kind: 'page',
        position: { x: 10, y: 20, width: 30, height: 40 }
      },
      {
        id: 'shape-1',
        kind: 'shape',
        position: { x: -50, y: 80, width: 90, height: 100 }
      }
    ])
    const decoded = decodeTransferableCanvasObjectPayload(payload)

    expect(payload.transferables).toEqual([payload.buffer])
    expect(decoded).toEqual({
      valid: true,
      errors: [],
      objects: [
        {
          id: 'page-1',
          kind: 'page',
          position: { x: 10, y: 20, width: 30, height: 40 }
        },
        {
          id: 'shape-1',
          kind: 'shape',
          position: { x: -50, y: 80, width: 90, height: 100 }
        }
      ]
    })
  })

  it('returns validation errors for invalid payload buffers', () => {
    const decoded = decodeTransferableCanvasObjectPayload({
      buffer: new ArrayBuffer(4)
    })

    expect(decoded.valid).toBe(false)
    expect(decoded.errors).toEqual(['Payload is smaller than the Canvas object header.'])
  })

  it('decodes payloads and generates summaries in the worker handler', () => {
    const objectPayload = createTransferableCanvasObjectPayload([
      {
        id: 'object-1',
        kind: 'shape',
        position: { x: 10, y: 10, width: 20, height: 20 }
      },
      {
        id: 'object-2',
        kind: 'database',
        position: { x: 120, y: 10, width: 20, height: 20 }
      }
    ])
    const response = handleCanvasTileSummaryWorkerRequest({
      type: 'create-tile-summaries',
      requestId: 'request-1',
      objectPayload,
      edges: [{ id: 'edge-1', sourceObjectId: 'object-1', targetObjectId: 'object-2' }],
      tileSize: 100,
      densityColumns: 2,
      densityRows: 2
    })

    expect(response.valid).toBe(true)
    expect(response.decodedObjectCount).toBe(2)
    expect(response.summaries.map((summary) => summary.tileId)).toEqual(['0/0/0', '0/1/0'])
    expect(response.summaries.map((summary) => summary.edgeCount)).toEqual([1, 1])
  })

  it('returns worker errors without materializing summaries for invalid payloads', () => {
    const response = handleCanvasTileSummaryWorkerRequest({
      type: 'create-tile-summaries',
      requestId: 'request-1',
      objectPayload: {
        buffer: new ArrayBuffer(0),
        transferables: []
      } satisfies TransferableCanvasObjectPayload
    })

    expect(response).toEqual({
      type: 'tile-summaries-created',
      requestId: 'request-1',
      valid: false,
      errors: ['Payload is smaller than the Canvas object header.'],
      decodedObjectCount: 0,
      summaries: []
    })
  })
})
