/**
 * Link preview resolver for the page editor (exploration 0295).
 *
 * Bridges the editor's `resolveLinkPreview` prop onto the same
 * hub-proxied resolution (and cache) the chat composer uses, so pasted
 * URLs get identical metadata everywhere. Undefined when no hub is
 * connected — cards then keep their URL-derived attrs.
 */
import type { MessageLinkPreview } from '@xnetjs/data'
import { useMemo } from 'react'
import { resolveExternalPreview } from '../comms/useComposerPreviews'
import { useHubApi } from './useShareLinks'

export function useLinkPreviewResolver():
  | ((url: string) => Promise<MessageLinkPreview | null>)
  | undefined {
  const { ready, request } = useHubApi()
  return useMemo(
    () => (ready ? (url: string) => resolveExternalPreview(request, url) : undefined),
    [ready, request]
  )
}
