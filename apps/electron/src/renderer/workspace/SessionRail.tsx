/**
 * Left-rail session browser for the coding workspace shell.
 */

import type { SessionSummaryNode } from './state/active-session'
import type { TreeNode } from '@xnetjs/ui'
import { Badge, Button, TreeView } from '@xnetjs/ui'
import {
  AlertTriangle,
  Eye,
  GitBranch,
  LoaderCircle,
  MessageSquarePlus,
  Sparkles,
  Trash2
} from 'lucide-react'
import React, { useMemo } from 'react'

type SessionRailProps = {
  sessions: SessionSummaryNode[]
  activeSession: SessionSummaryNode | null
  activeSessionId: string | null
  loading: boolean
  error: Error | null
  onCreateSession: () => void
  onRemoveSession: () => void
  onSelectSession: (sessionId: string) => void
}

function badgeVariantForState(state: SessionSummaryNode['state']) {
  switch (state) {
    case 'running':
      return 'success'
    case 'previewing':
      return 'secondary'
    case 'error':
      return 'destructive'
    default:
      return 'outline'
  }
}

function createSessionNode(
  session: SessionSummaryNode,
  onSelectSession: (sessionId: string) => void
): TreeNode {
  return {
    id: session.id,
    label: `${session.title ?? 'Untitled'} · ${session.branch ?? 'no-branch'}`,
    icon:
      session.state === 'running' ? (
        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
      ) : session.state === 'error' ? (
        <AlertTriangle className="h-3.5 w-3.5" />
      ) : session.state === 'previewing' ? (
        <Eye className="h-3.5 w-3.5" />
      ) : (
        <GitBranch className="h-3.5 w-3.5" />
      ),
    badge: (
      <span className="flex items-center gap-2">
        <Badge variant={badgeVariantForState(session.state)} className="px-1.5 py-0 text-[10px]">
          {session.state ?? 'idle'}
        </Badge>
        <span className="tabular-nums text-[10px] text-muted-foreground">
          {String(session.changedFilesCount ?? 0)}
        </span>
      </span>
    ),
    onSelect: () => onSelectSession(session.id)
  }
}

export function SessionRail({
  sessions,
  activeSession,
  activeSessionId,
  loading,
  error,
  onCreateSession,
  onRemoveSession,
  onSelectSession
}: SessionRailProps): React.ReactElement {
  const treeNodes = useMemo(() => {
    if (sessions.length === 0) {
      return []
    }

    const [selected, ...rest] = sessions
    const nodes: TreeNode[] = []

    if (activeSessionId && selected && selected.id === activeSessionId) {
      nodes.push({
        id: 'active-session-group',
        label: 'Active Session',
        defaultExpanded: true,
        badge: '1',
        children: [createSessionNode(selected, onSelectSession)]
      })
    }

    if (rest.length > 0) {
      nodes.push({
        id: 'other-sessions-group',
        label: activeSessionId ? 'Other Sessions' : 'Sessions',
        defaultExpanded: true,
        badge: String(rest.length),
        children: rest.map((session) => createSessionNode(session, onSelectSession))
      })
    }

    if (!activeSessionId) {
      return [
        {
          id: 'sessions-group',
          label: 'Sessions',
          defaultExpanded: true,
          badge: String(sessions.length),
          children: sessions.map((session) => createSessionNode(session, onSelectSession))
        }
      ]
    }

    return nodes
  }, [activeSessionId, onSelectSession, sessions])

  return (
    <section className="flex h-full flex-col border-r border-border/60 bg-background/85 backdrop-blur-xl">
      <div className="border-b border-border/60 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" />
              Sessions
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {activeSession?.title ?? 'No coding session selected'}
              </p>
              <p className="text-xs text-muted-foreground">
                {activeSession
                  ? `${activeSession.branch ?? 'no-branch'} · ${activeSession.worktreePath ?? 'pending worktree'}`
                  : 'Create a placeholder session now. Real worktree wiring lands in Step 04.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeSession ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                leftIcon={<Trash2 />}
                onClick={onRemoveSession}
              >
                Remove
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="outline"
              leftIcon={<MessageSquarePlus />}
              onClick={onCreateSession}
            >
              New
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Loading coding sessions...
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {error.message}
          </div>
        ) : treeNodes.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-border/70 bg-background/60 px-6 text-center">
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">No coding sessions yet</p>
              <p className="text-xs leading-5 text-muted-foreground">
                Create a worktree-backed session to attach a branch, preview runtime, and shared
                OpenCode chat surface.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              leftIcon={<MessageSquarePlus />}
              onClick={onCreateSession}
            >
              Create first session
            </Button>
          </div>
        ) : (
          <TreeView
            nodes={treeNodes}
            selectedId={activeSessionId ?? undefined}
            className="space-y-2"
          />
        )}
      </div>
    </section>
  )
}
