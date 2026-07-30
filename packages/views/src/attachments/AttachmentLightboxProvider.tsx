/**
 * AttachmentLightboxProvider — mounts one lightbox for a whole database
 * surface so any file chip, at any depth, can open it without prop-drilling
 * (exploration 0385 W1).
 *
 * `useAttachmentLightbox()` returns an opener, or null when no provider is
 * mounted — chips stay inert rather than throwing, so the property handlers
 * keep working in isolation (tests, plugin hosts, the form renderer).
 */

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { AttachmentLightbox, type AttachmentLightboxRequest } from './AttachmentLightbox.js'

export type OpenAttachmentLightbox = (request: AttachmentLightboxRequest) => void

const AttachmentLightboxContext = createContext<OpenAttachmentLightbox | null>(null)

export interface AttachmentLightboxProviderProps {
  /** Carries `onResolveFileUrl` for resolving CIDs to displayable URLs. */
  config?: Record<string, unknown>
  children: React.ReactNode
}

export function AttachmentLightboxProvider({
  config,
  children
}: AttachmentLightboxProviderProps): React.JSX.Element {
  const [request, setRequest] = useState<AttachmentLightboxRequest | null>(null)

  const open = useCallback<OpenAttachmentLightbox>((next) => {
    if (!next.refs.length) return
    setRequest(next)
  }, [])

  // The opener identity must stay stable — chips depend on it in callbacks.
  const value = useMemo(() => open, [open])

  return (
    <AttachmentLightboxContext.Provider value={value}>
      {children}
      {request && (
        <AttachmentLightbox
          refs={request.refs}
          initialIndex={request.initialIndex}
          config={config}
          onClose={() => setRequest(null)}
        />
      )}
    </AttachmentLightboxContext.Provider>
  )
}

/** Opener for the nearest provider, or null when none is mounted. */
export function useAttachmentLightbox(): OpenAttachmentLightbox | null {
  return useContext(AttachmentLightboxContext)
}
