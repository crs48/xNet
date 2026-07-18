/**
 * FrameRenderer — one renderer, four containers (0346).
 *
 * Dispatches a FrameDef by source kind: node sources resolve their
 * schema and render through the FrameSourceRegistry; query sources run
 * through SavedViewRunner; collection sources render a curated list of
 * node cards. Depth is tracked via context so transclusion clamps at
 * FRAME_MAX_DEPTH instead of recursing.
 */

import type { SchemaIRI } from '@xnetjs/data'
import type { SavedViewSchemaRegistry } from '@xnetjs/react'
import { SavedViewRunner, useNodeStore } from '@xnetjs/react'
import { FileQuestion, Files, Lock } from 'lucide-react'
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type JSX,
  type ReactNode
} from 'react'
import { frameSourceRegistry } from './registry.js'
import { FRAME_MAX_DEPTH, type FrameDef } from './types.js'

// ─── Host context ───────────────────────────────────────────────────────────

export interface FrameHost {
  onNavigate?: (href: string) => void
  /** Schema registry for query-source frames (SavedViewRunner). */
  savedViewRegistry?: SavedViewSchemaRegistry
  readOnly?: boolean
}

const FrameHostContext = createContext<FrameHost>({})

export function FrameHostProvider({
  value,
  children
}: {
  value: FrameHost
  children: ReactNode
}): JSX.Element {
  return <FrameHostContext.Provider value={value}>{children}</FrameHostContext.Provider>
}

export function useFrameHost(): FrameHost {
  return useContext(FrameHostContext)
}

// ─── Depth clamp ────────────────────────────────────────────────────────────

const FrameDepthContext = createContext(0)

/** Depth of the current frame nesting (0 outside any frame). */
export function useFrameDepth(): number {
  return useContext(FrameDepthContext)
}

// ─── Shared cards ───────────────────────────────────────────────────────────

/**
 * Sealed frame (0346): the source is unreadable here — deleted, not yet
 * synced, or outside this identity's grants. Deliberately calm; never
 * an error state.
 */
export function SealedFrame({ label }: { label?: string }): JSX.Element {
  return (
    <div
      data-frame-sealed="true"
      className="my-1 flex items-center gap-2 rounded-md border border-dashed border-border/60 bg-muted/20 px-3 py-2 text-sm text-muted-foreground"
    >
      <Lock size={14} />
      <span>{label ?? 'This content isn’t available in this workspace.'}</span>
    </div>
  )
}

function MissingRendererCard({ schemaId }: { schemaId: string }): JSX.Element {
  return (
    <div className="my-1 flex items-center gap-2 rounded-md border border-dashed border-border/60 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
      <FileQuestion size={14} />
      <span>
        No frame renderer for <code className="text-xs">{schemaId}</code>. A plugin may need to be
        enabled.
      </span>
    </div>
  )
}

/** Depth-clamped stand-in: renders where a nested frame would recurse. */
function DepthClampedCard({ frame }: { frame: FrameDef }): JSX.Element {
  const host = useFrameHost()
  const nodeId = frame.source.kind === 'node' ? frame.source.nodeId : null
  return (
    <button
      type="button"
      data-frame-depth-clamped="true"
      className="my-1 flex w-full items-center gap-2 rounded-md border border-border/60 bg-muted/10 px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted/30"
      onClick={() => nodeId && host.onNavigate?.(nodeId)}
    >
      <Files size={14} />
      <span>Nested view — open to explore.</span>
    </button>
  )
}

// ─── Node source ────────────────────────────────────────────────────────────

function NodeFrame({ frame, nodeId }: { frame: FrameDef; nodeId: string }): JSX.Element {
  const host = useFrameHost()
  const { store } = useNodeStore()
  const [schemaId, setSchemaId] = useState<SchemaIRI | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    if (!store) return
    void store.get(nodeId).then((state) => {
      if (!cancelled) setSchemaId(state?.schemaId ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [store, nodeId])

  if (schemaId === undefined) {
    return <div className="my-1 h-10 animate-pulse rounded-md bg-muted/30" />
  }
  if (schemaId === null) {
    return <SealedFrame />
  }
  const renderer = frameSourceRegistry.getForSchema(schemaId)
  if (!renderer) return <MissingRendererCard schemaId={schemaId} />
  const Component = renderer.component
  return (
    <Component
      frame={frame}
      nodeId={nodeId}
      onNavigate={host.onNavigate}
      readOnly={host.readOnly}
    />
  )
}

// ─── Collection source ──────────────────────────────────────────────────────

interface CollectionEntry {
  id: string
  title: string
  schemaId: string | null
}

/** Bounded curated list — titles resolve live via per-node subscription. */
function CollectionFrame({ nodeIds }: { nodeIds: string[] }): JSX.Element {
  const host = useFrameHost()
  const { store } = useNodeStore()
  const bounded = useMemo(() => nodeIds.slice(0, 50), [nodeIds])
  const [entries, setEntries] = useState<CollectionEntry[]>([])

  useEffect(() => {
    if (!store) return
    let cancelled = false
    const load = () => {
      void Promise.all(
        bounded.map(async (id) => {
          const state = await store.get(id)
          return {
            id,
            title: state ? String(state.properties.title ?? state.properties.name ?? id) : id,
            schemaId: state?.schemaId ?? null
          }
        })
      ).then((resolved) => {
        if (!cancelled) setEntries(resolved)
      })
    }
    load()
    const subscriptions = bounded.map((id) => store.subscribeToNode(id, load))
    return () => {
      cancelled = true
      for (const unsubscribe of subscriptions) unsubscribe()
    }
  }, [store, bounded])

  return (
    <div
      data-frame-collection="true"
      className="my-1 flex flex-col overflow-hidden rounded-md border border-border/60 bg-background"
    >
      {entries.length === 0 ? (
        <div className="px-3 py-2 text-sm text-muted-foreground">Empty collection.</div>
      ) : (
        entries.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className="flex w-full items-center gap-2 border-b border-border/40 px-3 py-1.5 text-left text-sm last:border-b-0 hover:bg-muted/40"
            onClick={() => host.onNavigate?.(entry.id)}
          >
            {entry.schemaId === null ? <Lock size={13} /> : <Files size={13} />}
            <span className="truncate">
              {entry.schemaId === null ? 'Unavailable' : entry.title}
            </span>
          </button>
        ))
      )}
      {nodeIds.length > bounded.length && (
        <div className="px-3 py-1 text-xs text-muted-foreground">
          {nodeIds.length - bounded.length} more not shown
        </div>
      )}
    </div>
  )
}

// ─── Dispatch ───────────────────────────────────────────────────────────────

export interface FrameRendererProps {
  frame: FrameDef
  className?: string
}

export function FrameRenderer({ frame, className }: FrameRendererProps): JSX.Element {
  const host = useFrameHost()
  const depth = useFrameDepth()

  if (depth >= FRAME_MAX_DEPTH) {
    return <DepthClampedCard frame={frame} />
  }

  let body: JSX.Element
  switch (frame.source.kind) {
    case 'node':
      body = <NodeFrame frame={frame} nodeId={frame.source.nodeId} />
      break
    case 'query':
      body = host.savedViewRegistry ? (
        <SavedViewRunner
          descriptor={frame.source.descriptor}
          registry={host.savedViewRegistry}
          className={className}
        />
      ) : (
        <SealedFrame label="Saved views aren’t available on this surface." />
      )
      break
    case 'collection':
      body = <CollectionFrame nodeIds={frame.source.nodeIds} />
      break
  }

  return (
    <FrameDepthContext.Provider value={depth + 1}>
      <div data-frame-id={frame.id} data-frame-tier={frame.tier} className={className}>
        {body}
      </div>
    </FrameDepthContext.Provider>
  )
}
