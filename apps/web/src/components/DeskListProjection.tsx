/**
 * DeskListProjection — the Desk on a phone (exploration 0273).
 *
 * Spatial layouts don't reflow to a 375px screen, so below the compact
 * breakpoint the Desk renders as an ordered list of its cards: reading order
 * (top-to-bottom, then left-to-right by canvas position), which doubles as
 * the screen-reader traversal order. Source-backed cards link to their node's
 * full surface; the spatial arrangement stays a ≥768px enhancement.
 */
import type { CanvasNode } from '@xnetjs/canvas'
import type * as Y from 'yjs'
import { useNavigate } from '@tanstack/react-router'
import { getCanvasObjectsMap } from '@xnetjs/canvas'
import { FileText, StickyNote, type LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { navigateToNode } from '../workbench/navigation'
import { useWorkbench, type TabNodeType } from '../workbench/state'
import { TAB_VIEWS } from '../workbench/tabs'
import { SCHEMA_IDS } from '../workbench/views/explorer-items'

/** schemaId → explorer node type (the route family for a pinned card). */
const NODE_TYPE_BY_SCHEMA: Record<string, TabNodeType> = Object.fromEntries(
  Object.entries(SCHEMA_IDS).map(([nodeType, schemaId]) => [schemaId, nodeType as TabNodeType])
)

function iconFor(nodeType: TabNodeType | null, cardType: string): LucideIcon {
  if (nodeType) return TAB_VIEWS[nodeType].icon
  return cardType === 'note' ? StickyNote : FileText
}

export function DeskListProjection({ doc, title }: { doc: Y.Doc; title: string }) {
  const navigate = useNavigate()
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    const objects = getCanvasObjectsMap(doc)
    const onChange = () => setRevision((current) => current + 1)
    objects.observeDeep(onChange)
    return () => objects.unobserveDeep(onChange)
  }, [doc])

  const cards = useMemo(() => {
    void revision
    return [...getCanvasObjectsMap<CanvasNode>(doc).values()]
      .filter((node) => node.type !== 'shape' && node.type !== 'group')
      .sort(
        (a, b) =>
          (a.position?.y ?? 0) - (b.position?.y ?? 0) || (a.position?.x ?? 0) - (b.position?.x ?? 0)
      )
  }, [doc, revision])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-12 shrink-0 items-center px-4">
        <h1 className="text-base font-semibold text-ink-1">{title}</h1>
      </header>
      {cards.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-sm text-ink-3">Nothing on your Desk yet.</p>
          <button
            type="button"
            onClick={() => useWorkbench.getState().setPanelOpen('left', true)}
            className="cursor-pointer rounded-full border border-hairline bg-surface-1 px-4 py-2 text-sm text-ink-2"
          >
            Pin something
          </button>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 list-none overflow-y-auto px-2 pb-4" data-desk-projection>
          {cards.map((card) => {
            const nodeType = card.sourceSchemaId
              ? (NODE_TYPE_BY_SCHEMA[card.sourceSchemaId] ?? null)
              : null
            const label =
              card.alias?.trim() ||
              (typeof card.properties?.title === 'string' ? card.properties.title : '') ||
              'Untitled'
            const Icon = iconFor(nodeType, card.type)
            const openable = nodeType != null && card.sourceNodeId != null
            return (
              <li key={card.id} className="border-b border-hairline last:border-b-0">
                <button
                  type="button"
                  disabled={!openable}
                  onClick={() => {
                    if (openable && card.sourceNodeId) {
                      navigateToNode(navigate, nodeType, card.sourceNodeId)
                    }
                  }}
                  className="touch-target tap-highlight-none flex w-full cursor-pointer items-center gap-3 border-none bg-transparent px-2 py-3 text-left disabled:cursor-default"
                >
                  <Icon size={16} strokeWidth={1.5} className="shrink-0 text-ink-3" />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-1">{label}</span>
                  <span className="text-[10px] uppercase tracking-wider text-ink-3">
                    {card.type}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
