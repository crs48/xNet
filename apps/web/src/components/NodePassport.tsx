/**
 * Node passport (exploration 0346, Phase 4) — the consistent identity
 * chrome every node surface shares: what this node IS (type, id,
 * created, author), rendered as one uniform right-island section. The
 * substrate answer made visible: every page carries the same passport
 * regardless of which surface renders it.
 */
import { useNodeStore } from '@xnetjs/react'
import { useEffect, useState, type JSX } from 'react'
import type { ContextPanelSection } from '../workbench/context-panel'

interface PassportFacts {
  schemaId: string
  createdAt: number | null
  createdBy: string | null
}

function PassportBody({ nodeId }: { nodeId: string }): JSX.Element {
  const { store } = useNodeStore()
  const [facts, setFacts] = useState<PassportFacts | null | undefined>(undefined)

  useEffect(() => {
    if (!store) return
    let cancelled = false
    const load = () => {
      void store.get(nodeId).then((state) => {
        if (cancelled) return
        setFacts(
          state
            ? {
                schemaId: state.schemaId,
                createdAt:
                  typeof state.properties.createdAt === 'number'
                    ? state.properties.createdAt
                    : null,
                createdBy:
                  typeof state.properties.createdBy === 'string' ? state.properties.createdBy : null
              }
            : null
        )
      })
    }
    load()
    const unsubscribe = store.subscribeToNode(nodeId, load)
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [store, nodeId])

  if (facts === undefined) {
    return <div className="p-3 text-xs text-ink-3">Loading…</div>
  }
  if (facts === null) {
    return <div className="p-3 text-xs text-ink-3">Not available in this workspace.</div>
  }

  const typeName = facts.schemaId.split('/').pop()?.replace(/@.*/, '') ?? facts.schemaId
  const rows: Array<[string, string]> = [
    ['Type', typeName],
    ['ID', nodeId],
    ...(facts.createdAt
      ? ([['Created', new Date(facts.createdAt).toLocaleDateString()]] as Array<[string, string]>)
      : []),
    ...(facts.createdBy
      ? ([['By', `${facts.createdBy.slice(0, 20)}…`]] as Array<[string, string]>)
      : [])
  ]

  return (
    <div className="flex flex-col gap-1.5 p-3 text-xs">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-start justify-between gap-2">
          <span className="shrink-0 text-ink-3">{label}</span>
          <span className="min-w-0 break-all text-right font-mono text-[11px] text-ink-1">
            {value}
          </span>
        </div>
      ))}
    </div>
  )
}

/** The shared passport section — append to any surface's section list. */
export function nodePassportSection(nodeId: string): ContextPanelSection {
  return {
    id: 'node-passport',
    title: 'Passport',
    content: <PassportBody nodeId={nodeId} />
  }
}
