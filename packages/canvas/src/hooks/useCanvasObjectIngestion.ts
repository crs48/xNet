/**
 * useCanvasObjectIngestion - Source-backed canvas drop/paste helpers.
 */

import type {
  CanvasExternalReferenceDescriptor,
  CanvasIngressPayload,
  CanvasPrimitiveObjectKind,
  CanvasViewportSnapshot
} from '../ingestion'
import type {
  CanvasIngestBatchOptions,
  CanvasIngestOptions,
  CanvasIngestResult,
  CanvasIngestor
} from '../ingestors'
import type { CanvasNode, Point } from '../types'
import type { BlobService, ExternalReference } from '@xnetjs/data'
import type * as Y from 'yjs'
import { ExternalReferenceSchema, MediaAssetSchema } from '@xnetjs/data'
import { useMutate, useQuery } from '@xnetjs/react'
import { useCallback, useMemo } from 'react'
import {
  createCanvasPrimitiveNode,
  createSourceBackedCanvasNode,
  describeExternalReference,
  extractCanvasIngressPayloads,
  getCanvasObjectKindFromSchema,
  getMediaRect,
  inferMediaKind,
  readImageDimensions
} from '../ingestion'
import {
  ingestCanvasPayloadBatch,
  resolveCanvasIngestOptions,
  selectCanvasIngestor
} from '../ingestors'
import { getCanvasObjectsMap } from '../scene/doc-layout'
import { getCanvasBlockedPreviewReason } from '../storage-policy'

export interface UseCanvasObjectIngestionOptions {
  doc: Y.Doc | null
  blobService: BlobService | null
  getViewportSnapshot: () => CanvasViewportSnapshot
  externalReferenceLimit?: number
}

export interface PlaceCanvasSourceObjectInput {
  objectKind: 'page' | 'database' | 'external-reference' | 'media' | 'note'
  sourceNodeId: string
  sourceSchemaId: string
  title: string
  canvasPoint?: Point | null
  spreadIndex?: number
  rect?: Partial<{ width: number; height: number }>
  properties?: Record<string, unknown>
}

export interface PlaceCanvasPrimitiveObjectInput {
  objectKind: CanvasPrimitiveObjectKind
  title?: string
  canvasPoint?: Point | null
  spreadIndex?: number
  rect?: Partial<{ width: number; height: number }>
  properties?: Record<string, unknown>
}

export type CanvasIngestionResult = CanvasIngestResult

function getNodesMap(doc: Y.Doc | null): Y.Map<CanvasNode> | null {
  if (!doc) {
    return null
  }

  return getCanvasObjectsMap<CanvasNode>(doc)
}

function toExternalReferenceProperties(
  descriptor: CanvasExternalReferenceDescriptor,
  status: 'resolving' | 'ready' | 'error' = 'ready',
  error?: string
): Record<string, unknown> {
  return {
    title: descriptor.title,
    url: descriptor.normalizedUrl,
    provider: descriptor.provider,
    kind: descriptor.kind,
    subtitle: descriptor.subtitle,
    icon: descriptor.icon,
    embedUrl: descriptor.embedUrl,
    metadata: JSON.stringify(descriptor.metadata),
    status,
    ...(error ? { error } : {})
  }
}

function toMediaProperties(input: {
  title: string
  mimeType: string
  kind: string
  size: number
  width?: number
  height?: number
  status: 'uploading' | 'ready' | 'error' | 'blocked'
  error?: string
}): Record<string, unknown> {
  return {
    title: input.title,
    mimeType: input.mimeType,
    kind: input.kind,
    size: input.size,
    width: input.width,
    height: input.height,
    status: input.status,
    ...(input.error ? { error: input.error } : {})
  }
}

function toExternalReferenceCreateInput(descriptor: CanvasExternalReferenceDescriptor) {
  return {
    url: descriptor.normalizedUrl,
    provider: descriptor.provider,
    kind: descriptor.kind,
    ...(descriptor.refId ? { refId: descriptor.refId } : {}),
    title: descriptor.title,
    ...(descriptor.subtitle ? { subtitle: descriptor.subtitle } : {}),
    ...(descriptor.icon ? { icon: descriptor.icon } : {}),
    ...(descriptor.embedUrl ? { embedUrl: descriptor.embedUrl } : {}),
    metadata: JSON.stringify(descriptor.metadata)
  }
}

function toStoredExternalReferenceProperties(
  reference: ExternalReference
): Record<string, unknown> {
  const normalizedUrl = typeof reference.url === 'string' ? reference.url : ''
  const described = normalizedUrl ? describeExternalReference(normalizedUrl) : null

  return {
    title: reference.title,
    url: normalizedUrl,
    provider: reference.provider || described?.provider || 'generic',
    kind: reference.kind || described?.kind || 'link',
    subtitle: typeof reference.subtitle === 'string' ? reference.subtitle : described?.subtitle,
    icon: typeof reference.icon === 'string' ? reference.icon : described?.icon,
    embedUrl: typeof reference.embedUrl === 'string' ? reference.embedUrl : described?.embedUrl,
    metadata:
      typeof reference.metadata === 'string'
        ? reference.metadata
        : JSON.stringify(described?.metadata ?? {}),
    status: 'ready'
  }
}

function updateCanvasNode(
  doc: Y.Doc | null,
  nodeId: string,
  updater: (node: CanvasNode) => CanvasNode
): void {
  const nodes = getNodesMap(doc)
  const current = nodes?.get(nodeId)
  if (!nodes || !current) {
    return
  }

  doc?.transact(() => {
    nodes.set(nodeId, updater(current))
  })
}

export function useCanvasObjectIngestion({
  doc,
  blobService,
  getViewportSnapshot,
  externalReferenceLimit = 500
}: UseCanvasObjectIngestionOptions) {
  const { create } = useMutate()
  const { data: externalReferences } = useQuery(ExternalReferenceSchema, {
    limit: externalReferenceLimit
  })

  const externalReferenceByUrl = useMemo(() => {
    const entries = externalReferences
      .map((reference) => {
        if (typeof reference.url !== 'string') {
          return null
        }

        const descriptor = describeExternalReference(reference.url)
        if (!descriptor) {
          return null
        }

        return [descriptor.normalizedUrl, reference] as const
      })
      .filter(
        (entry): entry is readonly [string, (typeof externalReferences)[number]] => entry !== null
      )

    return new Map(entries)
  }, [externalReferences])

  const externalReferenceById = useMemo(() => {
    return new Map(externalReferences.map((reference) => [reference.id, reference] as const))
  }, [externalReferences])

  const placeSourceObject = useCallback(
    (input: PlaceCanvasSourceObjectInput): CanvasIngestionResult | null => {
      const nodes = getNodesMap(doc)
      if (!doc || !nodes) {
        return null
      }

      const node = createSourceBackedCanvasNode({
        objectKind: input.objectKind,
        viewport: getViewportSnapshot(),
        sourceNodeId: input.sourceNodeId,
        sourceSchemaId: input.sourceSchemaId,
        title: input.title,
        canvasPoint: input.canvasPoint,
        spreadIndex: input.spreadIndex,
        rect: input.rect,
        properties: input.properties
      })

      doc.transact(() => {
        nodes.set(node.id, node)
      })

      return {
        canvasNodeId: node.id,
        sourceNodeId: input.sourceNodeId
      }
    },
    [doc, getViewportSnapshot]
  )

  const placePrimitiveObject = useCallback(
    (input: PlaceCanvasPrimitiveObjectInput): CanvasIngestionResult | null => {
      const nodes = getNodesMap(doc)
      if (!doc || !nodes) {
        return null
      }

      const node = createCanvasPrimitiveNode({
        objectKind: input.objectKind,
        viewport: getViewportSnapshot(),
        title: input.title,
        canvasPoint: input.canvasPoint,
        spreadIndex: input.spreadIndex,
        rect: input.rect,
        properties: input.properties
      })

      doc.transact(() => {
        nodes.set(node.id, node)
      })

      return {
        canvasNodeId: node.id
      }
    },
    [doc, getViewportSnapshot]
  )

  const ingestUrlPayload = useCallback(
    async (
      url: string,
      canvasPoint?: Point | null,
      spreadIndex = 0
    ): Promise<CanvasIngestionResult | null> => {
      const nodes = getNodesMap(doc)
      const descriptor = describeExternalReference(url)
      if (!doc || !nodes || !descriptor) {
        return null
      }

      const pendingNode = createSourceBackedCanvasNode({
        objectKind: 'external-reference',
        viewport: getViewportSnapshot(),
        title: descriptor.title,
        canvasPoint,
        spreadIndex,
        properties: toExternalReferenceProperties(descriptor, 'resolving')
      })

      doc.transact(() => {
        nodes.set(pendingNode.id, pendingNode)
      })

      try {
        const existingReference = externalReferenceByUrl.get(descriptor.normalizedUrl)
        const sourceNode =
          existingReference ??
          (await create(ExternalReferenceSchema, toExternalReferenceCreateInput(descriptor)))

        if (!sourceNode) {
          throw new Error('External reference creation returned no node')
        }

        updateCanvasNode(doc, pendingNode.id, (node) => ({
          ...node,
          sourceNodeId: sourceNode.id,
          sourceSchemaId: ExternalReferenceSchema._schemaId,
          properties: toExternalReferenceProperties(descriptor, 'ready')
        }))

        return {
          canvasNodeId: pendingNode.id,
          sourceNodeId: sourceNode.id
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        updateCanvasNode(doc, pendingNode.id, (node) => ({
          ...node,
          properties: toExternalReferenceProperties(descriptor, 'error', message)
        }))
        return {
          canvasNodeId: pendingNode.id
        }
      }
    },
    [create, doc, externalReferenceByUrl, getViewportSnapshot]
  )

  const ingestFilePayload = useCallback(
    async (
      file: File,
      canvasPoint?: Point | null,
      spreadIndex = 0
    ): Promise<CanvasIngestionResult | null> => {
      const nodes = getNodesMap(doc)
      if (!doc || !nodes || !blobService) {
        return null
      }

      const mediaKind = inferMediaKind(file)
      const blockedReason = getCanvasBlockedPreviewReason({
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream'
      })
      const pendingNode = createSourceBackedCanvasNode({
        objectKind: 'media',
        viewport: getViewportSnapshot(),
        title: file.name,
        canvasPoint,
        spreadIndex,
        properties: toMediaProperties({
          title: file.name,
          mimeType: file.type || 'application/octet-stream',
          kind: mediaKind,
          size: file.size,
          status: blockedReason ? 'blocked' : 'uploading',
          error: blockedReason ?? undefined
        })
      })

      doc.transact(() => {
        nodes.set(pendingNode.id, pendingNode)
      })

      if (blockedReason) {
        return {
          canvasNodeId: pendingNode.id
        }
      }

      try {
        const dimensions = await readImageDimensions(file)
        const fileRef = await blobService.upload(file)
        const sourceNode = await create(MediaAssetSchema, {
          title: file.name,
          file: fileRef,
          kind: mediaKind,
          ...(dimensions?.width ? { width: dimensions.width } : {}),
          ...(dimensions?.height ? { height: dimensions.height } : {})
        })

        if (!sourceNode) {
          throw new Error('Media asset creation returned no node')
        }

        const rect = getMediaRect(dimensions)
        updateCanvasNode(doc, pendingNode.id, (node) => ({
          ...node,
          sourceNodeId: sourceNode.id,
          sourceSchemaId: MediaAssetSchema._schemaId,
          position: {
            ...node.position,
            width: rect.width,
            height: rect.height
          },
          properties: toMediaProperties({
            title: file.name,
            mimeType: file.type || 'application/octet-stream',
            kind: mediaKind,
            size: file.size,
            width: dimensions?.width,
            height: dimensions?.height,
            status: 'ready'
          })
        }))

        return {
          canvasNodeId: pendingNode.id,
          sourceNodeId: sourceNode.id
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        updateCanvasNode(doc, pendingNode.id, (node) => ({
          ...node,
          properties: toMediaProperties({
            title: file.name,
            mimeType: file.type || 'application/octet-stream',
            kind: mediaKind,
            size: file.size,
            status: 'error',
            error: message
          })
        }))
        return {
          canvasNodeId: pendingNode.id
        }
      }
    },
    [blobService, create, doc, getViewportSnapshot]
  )

  const builtInIngestors = useMemo<CanvasIngestor[]>(
    () => [
      {
        id: 'internal-node',
        priority: 1000,
        matches: (payload) =>
          payload.kind === 'internal-node' &&
          getCanvasObjectKindFromSchema(payload.data.schemaId, payload.data.canvasKind) !== null,
        ingest: async (payload, options) => {
          if (payload.kind !== 'internal-node') {
            return null
          }

          const objectKind = getCanvasObjectKindFromSchema(
            payload.data.schemaId,
            payload.data.canvasKind
          )
          if (!objectKind) {
            return null
          }

          return placeSourceObject({
            objectKind,
            sourceNodeId: payload.data.nodeId,
            sourceSchemaId: payload.data.schemaId,
            title: payload.data.title,
            canvasPoint: options.canvasPoint,
            spreadIndex: options.spreadIndex,
            properties:
              objectKind === 'external-reference'
                ? (() => {
                    const externalReference = externalReferenceById.get(payload.data.nodeId)
                    return externalReference
                      ? toStoredExternalReferenceProperties(externalReference)
                      : undefined
                  })()
                : undefined
          })
        }
      },
      {
        id: 'file',
        priority: 900,
        matches: (payload) => payload.kind === 'file',
        ingest: async (payload, options) => {
          if (payload.kind !== 'file') {
            return null
          }

          return await ingestFilePayload(payload.file, options.canvasPoint, options.spreadIndex)
        }
      },
      {
        id: 'url',
        priority: 800,
        matches: (payload) =>
          payload.kind === 'url' && describeExternalReference(payload.url) !== null,
        ingest: async (payload, options) => {
          if (payload.kind !== 'url') {
            return null
          }

          return await ingestUrlPayload(payload.url, options.canvasPoint, options.spreadIndex)
        }
      },
      {
        id: 'text-url',
        priority: 700,
        matches: (payload) =>
          payload.kind === 'text' && describeExternalReference(payload.text) !== null,
        ingest: async (payload, options) => {
          if (payload.kind !== 'text') {
            return null
          }

          const descriptor = describeExternalReference(payload.text)
          if (!descriptor) {
            return null
          }

          return await ingestUrlPayload(
            descriptor.normalizedUrl,
            options.canvasPoint,
            options.spreadIndex
          )
        }
      }
    ],
    [externalReferenceById, ingestFilePayload, ingestUrlPayload, placeSourceObject]
  )

  const ingestPayload = useCallback(
    async (
      payload: CanvasIngressPayload,
      options: CanvasIngestOptions = {}
    ): Promise<CanvasIngestionResult | null> => {
      if (options.signal?.aborted) {
        return null
      }

      const ingestor = selectCanvasIngestor(payload, builtInIngestors)
      if (!ingestor) {
        return null
      }

      return await ingestor.ingest(payload, resolveCanvasIngestOptions(options))
    },
    [builtInIngestors]
  )

  const ingestDataTransfer = useCallback(
    async (
      dataTransfer: DataTransfer,
      options: Pick<CanvasIngestBatchOptions, 'canvasPoint' | 'dedupe' | 'signal'> = {}
    ): Promise<CanvasIngestionResult[]> => {
      const payloads = extractCanvasIngressPayloads(dataTransfer)
      const batch = await ingestCanvasPayloadBatch(payloads, builtInIngestors, {
        canvasPoint: options.canvasPoint,
        dedupe: options.dedupe,
        signal: options.signal
      })

      return batch.results
    },
    [builtInIngestors]
  )

  const ingestText = useCallback(
    async (
      text: string,
      options: CanvasIngestOptions = {}
    ): Promise<CanvasIngestionResult | null> => {
      return await ingestPayload({ kind: 'text', text }, options)
    },
    [ingestPayload]
  )

  return {
    placeSourceObject,
    placePrimitiveObject,
    ingestPayload,
    ingestDataTransfer,
    ingestText
  }
}
