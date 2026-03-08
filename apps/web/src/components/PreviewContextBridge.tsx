/**
 * Sends tagged preview-context selections to the parent shell via postMessage.
 */

import { useEffect } from 'react'

const PREVIEW_SELECTED_CONTEXT_MESSAGE_TYPE = 'xnet:preview:selected-context'

type PreviewContextBridgeProps = {
  routeId: string
}

function readAttribute(element: Element | null, name: string): string | null {
  return element?.getAttribute(name) ?? null
}

function buildNearbyText(element: Element | null): string | null {
  const value = element?.textContent?.replace(/\s+/g, ' ').trim()
  if (!value) {
    return null
  }

  return value.slice(0, 160)
}

export function PreviewContextBridge({ routeId }: PreviewContextBridgeProps): null {
  useEffect(() => {
    const handleContextMenu = (event: MouseEvent): void => {
      if (!(event.target instanceof Element) || window.parent === window) {
        return
      }

      const target = event.target.closest(
        '[data-xnet-target-id], [data-xnet-target-label], [data-xnet-file-hint], [data-xnet-route-id]'
      )

      if (!target) {
        return
      }

      const routeTarget = target.closest('[data-xnet-route-id]')
      const documentTarget = target.closest('[data-xnet-document-id]')
      const bounds = target.getBoundingClientRect()

      event.preventDefault()

      window.parent.postMessage(
        {
          type: PREVIEW_SELECTED_CONTEXT_MESSAGE_TYPE,
          routeId: readAttribute(routeTarget, 'data-xnet-route-id') ?? routeId,
          targetId: readAttribute(target, 'data-xnet-target-id'),
          targetLabel: readAttribute(target, 'data-xnet-target-label'),
          fileHint: readAttribute(target, 'data-xnet-file-hint'),
          documentId: readAttribute(documentTarget, 'data-xnet-document-id'),
          bounds: {
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height
          },
          nearbyText: buildNearbyText(target)
        },
        '*'
      )
    }

    window.addEventListener('contextmenu', handleContextMenu)
    return () => {
      window.removeEventListener('contextmenu', handleContextMenu)
    }
  }, [routeId])

  return null
}
