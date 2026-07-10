/**
 * App link up-res provider (exploration 0295).
 *
 * Supplies the workspace-aware renderer behind @xnetjs/ui's LinkUpres
 * context: an internal deep link (or xnet:// reference) whose node exists
 * in the local workspace renders as a navigable chip carrying the node's
 * live title instead of a bare URL. Unresolvable and external URLs fall
 * back to plain anchors. Render-time only — message/comment text is never
 * rewritten, so titles stay live and old content up-reses retroactively.
 */
import type { TabNodeType } from '../workbench/state'
import { useNavigate } from '@tanstack/react-router'
import { useXNet } from '@xnetjs/react'
import { LinkUpresProvider, type LinkUpresRenderer } from '@xnetjs/ui'
import { useCallback, useMemo, type ReactNode } from 'react'
import { nodeIdFromHref } from '../comms/link-composer'
import { useLinkTargets } from '../hooks/useLinkTargets'
import { normalizeHubHttpUrl } from '../lib/share-links'
import { classifyUrl, currentUrlEnv } from '../lib/url-upres'
import { navigateToNode } from '../workbench/navigation'

function NodeChip({ title, kind, onOpen }: { title: string; kind: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      title={`Open ${kind}`}
      onClick={(event) => {
        event.stopPropagation()
        onOpen()
      }}
      className="inline-flex max-w-64 cursor-pointer items-baseline gap-1 rounded-full border border-hairline bg-transparent px-1.5 py-px align-baseline text-ink-2 transition-colors hover:text-ink-1"
    >
      <span className="truncate">[[{title}]]</span>
      <span className="shrink-0 text-[10px] uppercase tracking-wider text-ink-3">{kind}</span>
    </button>
  )
}

export function AppLinkUpres({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const { hubUrl } = useXNet()
  const { linkTargets } = useLinkTargets()
  const env = useMemo(() => currentUrlEnv(hubUrl ? normalizeHubHttpUrl(hubUrl) : null), [hubUrl])

  const render = useCallback<LinkUpresRenderer>(
    (link) => {
      const cls = classifyUrl(link.href, env)
      if (cls.kind !== 'internal') return null
      const target = linkTargets.find((t) => nodeIdFromHref(t.href) === cls.nodeId)
      if (!target) return null
      return (
        <NodeChip
          title={target.title}
          kind={target.kind}
          onOpen={() =>
            navigateToNode(navigate, (target.kind || 'page') as TabNodeType, cls.nodeId)
          }
        />
      )
    },
    [env, linkTargets, navigate]
  )

  return <LinkUpresProvider render={render}>{children}</LinkUpresProvider>
}
