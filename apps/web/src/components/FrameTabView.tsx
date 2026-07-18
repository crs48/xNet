/**
 * FrameTabView — a node opened through an arbitrary registered view as
 * a full-bleed tab (0346). The workbench tab IS a live-tier frame: one
 * route (`/frame/<viewType>~<nodeId>`) covers every registry and plugin
 * view without touching the closed TabNodeType machinery again.
 */
import { useNavigate } from '@tanstack/react-router'
import { FrameHostProvider, FrameRenderer, type FrameDef } from '@xnetjs/views'
import { useCallback, useMemo, type JSX } from 'react'
import { WORKBENCH_SAVED_VIEW_REGISTRY } from '../lib/saved-view-registry'
import { navigateToNode, parseFrameSpec } from '../workbench/navigation'
import type { TabNodeType } from '../workbench/state'
import '../lib/frame-renderers'

export function FrameTabView({ frameSpec }: { frameSpec: string }): JSX.Element {
  const navigate = useNavigate()
  const spec = parseFrameSpec(frameSpec)

  const handleNavigate = useCallback(
    (href: string) => {
      const match = href.match(/^xnet:\/\/([a-z]+)\/(.+)$/)
      if (match) {
        navigateToNode(navigate, match[1] as TabNodeType, match[2])
        return
      }
      void navigate({ to: '/doc/$docId', params: { docId: href } })
    },
    [navigate]
  )

  const frame = useMemo<FrameDef | null>(
    () =>
      spec
        ? {
            id: `tab:${frameSpec}`,
            source: { kind: 'node', nodeId: spec.nodeId },
            viewType: spec.viewType,
            tier: 'live',
            sortKey: ''
          }
        : null,
    [spec, frameSpec]
  )

  if (!frame) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-ink-3">
        Malformed frame address.
      </div>
    )
  }

  return (
    <FrameHostProvider
      value={{ onNavigate: handleNavigate, savedViewRegistry: WORKBENCH_SAVED_VIEW_REGISTRY }}
    >
      <div className="flex h-full min-h-0 flex-col overflow-y-auto p-4">
        <FrameRenderer frame={frame} className="flex-1" />
      </div>
    </FrameHostProvider>
  )
}
