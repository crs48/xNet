/**
 * Object-specific resize policies for canvas direct manipulation.
 */

import type { CanvasNode, ResizeHandle } from '../types'
import type { CanvasResizeUpdateOptions } from './scene-operations'
import { isFrameLikeCanvasNode } from '../scene/node-kind'

export type CanvasResizePolicy = CanvasResizeUpdateOptions & {
  preserveAspectRatio: boolean
}

const DEFAULT_RESIZE_POLICY: CanvasResizePolicy = {
  minWidth: 96,
  minHeight: 72,
  preserveAspectRatio: false
}

const VIDEO_PROVIDERS = new Set(['youtube', 'vimeo', 'loom'])

function isCornerResizeHandle(handle: ResizeHandle): boolean {
  return (
    handle === 'top-left' ||
    handle === 'top-right' ||
    handle === 'bottom-right' ||
    handle === 'bottom-left'
  )
}

function getOptionalString(value: unknown): string | null {
  return typeof value === 'string' ? value.toLowerCase() : null
}

function getFinitePositiveNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function withAspectRatio(
  policy: Omit<CanvasResizePolicy, 'aspectRatio' | 'preserveAspectRatio'>,
  node: CanvasNode,
  handle: ResizeHandle,
  fallbackAspectRatio?: number
): CanvasResizePolicy {
  const aspectRatio =
    getFinitePositiveNumber(node.properties.aspectRatio) ??
    fallbackAspectRatio ??
    node.position.width / node.position.height
  const shouldPreserveAspectRatio = isCornerResizeHandle(handle)

  return {
    ...policy,
    preserveAspectRatio: shouldPreserveAspectRatio,
    ...(shouldPreserveAspectRatio && Number.isFinite(aspectRatio) && aspectRatio > 0
      ? { aspectRatio }
      : {})
  }
}

function getExternalReferenceResizePolicy(
  node: CanvasNode,
  handle: ResizeHandle
): CanvasResizePolicy {
  const provider = getOptionalString(node.properties.provider)
  const kind = getOptionalString(node.properties.kind)

  if (provider && VIDEO_PROVIDERS.has(provider)) {
    return withAspectRatio(
      {
        minWidth: 320,
        minHeight: 180
      },
      node,
      handle,
      16 / 9
    )
  }

  if (provider === 'spotify' || kind === 'audio') {
    return {
      minWidth: 280,
      minHeight: 120,
      preserveAspectRatio: false
    }
  }

  if (kind === 'social') {
    return {
      minWidth: 260,
      minHeight: 320,
      preserveAspectRatio: false
    }
  }

  return {
    minWidth: 220,
    minHeight: 120,
    preserveAspectRatio: false
  }
}

function getMediaResizePolicy(node: CanvasNode, handle: ResizeHandle): CanvasResizePolicy {
  const kind = getOptionalString(node.properties.kind)
  const mimeType = getOptionalString(node.properties.mimeType)

  if (kind === 'image' || kind === 'video' || mimeType?.startsWith('image/')) {
    return withAspectRatio(
      {
        minWidth: 96,
        minHeight: 96
      },
      node,
      handle
    )
  }

  if (kind === 'pdf' || kind === 'document' || mimeType === 'application/pdf') {
    return {
      minWidth: 240,
      minHeight: 320,
      preserveAspectRatio: false
    }
  }

  if (kind === 'audio' || mimeType?.startsWith('audio/')) {
    return {
      minWidth: 240,
      minHeight: 96,
      preserveAspectRatio: false
    }
  }

  return {
    minWidth: 160,
    minHeight: 120,
    preserveAspectRatio: false
  }
}

export function getCanvasResizePolicy(node: CanvasNode, handle: ResizeHandle): CanvasResizePolicy {
  if (isFrameLikeCanvasNode(node)) {
    return {
      minWidth: 320,
      minHeight: 220,
      preserveAspectRatio: false
    }
  }

  switch (node.type) {
    case 'page':
      return {
        minWidth: 220,
        minHeight: 140,
        preserveAspectRatio: false
      }
    case 'database':
      return {
        minWidth: 320,
        minHeight: 220,
        preserveAspectRatio: false
      }
    case 'note':
      return {
        minWidth: 160,
        minHeight: 96,
        preserveAspectRatio: false
      }
    case 'shape':
      return {
        minWidth: 48,
        minHeight: 48,
        preserveAspectRatio: false
      }
    case 'external-reference':
      return getExternalReferenceResizePolicy(node, handle)
    case 'media':
      return getMediaResizePolicy(node, handle)
    default:
      return DEFAULT_RESIZE_POLICY
  }
}
