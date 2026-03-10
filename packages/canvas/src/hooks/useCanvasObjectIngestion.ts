/**
 * useCanvasObjectIngestion - Source-backed canvas drop/paste helpers.
 */

import type {
  CanvasExternalReferenceDescriptor,
  CanvasIngressPayload,
  CanvasPrimitiveObjectKind,
  CanvasViewportSnapshot
} from '../ingestion'
import type { CanvasNode, Point } from '../types'
import type { BlobService } from '@xnetjs/data'
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
import { getCanvasObjectsMap } from '../scene/doc-layout'

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

export interface CanvasIngestionResult {
  canvasNodeId: string
  sourceNodeId?: string
}

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
  status: 'uploading' | 'ready' | 'error'
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
          status: 'uploading'
        })
      })

      doc.transact(() => {
        nodes.set(pendingNode.id, pendingNode)
      })

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

  const ingestPayload = useCallback(
    async (
      payload: CanvasIngressPayload,
      options: { canvasPoint?: Point | null; spreadIndex?: number } = {}
    ): Promise<CanvasIngestionResult | null> => {
      const spreadIndex = options.spreadIndex ?? 0

      if (payload.kind === 'internal-node') {
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
          spreadIndex
        })
      }

      if (payload.kind === 'url') {
        return await ingestUrlPayload(payload.url, options.canvasPoint, spreadIndex)
      }

      if (payload.kind === 'file') {
        return await ingestFilePayload(payload.file, options.canvasPoint, spreadIndex)
      }

      const descriptor = describeExternalReference(payload.text)
      if (!descriptor) {
        return null
      }

      return await ingestUrlPayload(descriptor.normalizedUrl, options.canvasPoint, spreadIndex)
    },
    [ingestFilePayload, ingestUrlPayload, placeSourceObject]
  )

  const ingestDataTransfer = useCallback(
    async (
      dataTransfer: DataTransfer,
      options: { canvasPoint?: Point | null } = {}
    ): Promise<CanvasIngestionResult[]> => {
      const payloads = extractCanvasIngressPayloads(dataTransfer)
      const results: CanvasIngestionResult[] = []

      for (const [index, payload] of payloads.entries()) {
        const result = await ingestPayload(payload, {
          canvasPoint: options.canvasPoint,
          spreadIndex: index
        })

        if (result) {
          results.push(result)
        }
      }

      return results
    },
    [ingestPayload]
  )

  const ingestText = useCallback(
    async (
      text: string,
      options: { canvasPoint?: Point | null } = {}
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
