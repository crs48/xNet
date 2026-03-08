/**
 * Captures tagged preview selections from the embedded iframe and prefills OpenCode.
 */

import type { SelectedContext } from '../../../shared/workspace-session'
import type { SessionSummaryNode } from '../state/active-session'
import { useEffect, useMemo, useState } from 'react'
import {
  buildSelectedContextPrompt,
  isPreviewSelectedContextMessage
} from '../context/selected-context'
import { useSessionCommands } from './useSessionCommands'

type UsePreviewSelectedContextResult = {
  selectedContext: SelectedContext | null
}

export function usePreviewSelectedContext(
  activeSession: SessionSummaryNode | null
): UsePreviewSelectedContextResult {
  const { storeWorkspaceSelectedContext, updateSessionSummary } = useSessionCommands()
  const [contextsBySessionId, setContextsBySessionId] = useState<Record<string, SelectedContext>>(
    {}
  )

  const selectedContext = useMemo(() => {
    if (!activeSession) {
      return null
    }

    return contextsBySessionId[activeSession.id] ?? null
  }, [activeSession, contextsBySessionId])

  useEffect(() => {
    const handleMessage = (event: MessageEvent): void => {
      if (
        !activeSession ||
        !activeSession.previewUrl ||
        !isPreviewSelectedContextMessage(event.data)
      ) {
        return
      }

      try {
        const previewOrigin = new URL(activeSession.previewUrl).origin
        if (event.origin !== previewOrigin) {
          return
        }
      } catch {
        return
      }

      const nextContext: SelectedContext = {
        sessionId: activeSession.id,
        routeId: event.data.routeId,
        targetId: event.data.targetId,
        targetLabel: event.data.targetLabel,
        fileHint: event.data.fileHint,
        documentId: event.data.documentId,
        bounds: event.data.bounds,
        nearbyText: event.data.nearbyText,
        screenshotPath: activeSession.lastScreenshotPath ?? null,
        capturedAt: Date.now()
      }

      void storeWorkspaceSelectedContext(activeSession, nextContext)
        .then((stored) => {
          const prompt = buildSelectedContextPrompt(nextContext, stored.path)
          setContextsBySessionId((current) => ({
            ...current,
            [activeSession.id]: nextContext
          }))
          return Promise.all([
            updateSessionSummary(activeSession.id, { lastMessagePreview: prompt }),
            window.xnetOpenCode.appendPrompt({ prompt })
          ])
        })
        .catch((error) => {
          console.error('[PreviewSelectedContext] Failed to store selected context', error)
        })
    }

    window.addEventListener('message', handleMessage)
    return () => {
      window.removeEventListener('message', handleMessage)
    }
  }, [activeSession, storeWorkspaceSelectedContext, updateSessionSummary])

  return {
    selectedContext
  }
}
