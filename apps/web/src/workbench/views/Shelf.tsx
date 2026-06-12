/**
 * Shelf — a Muse-style temporary holding area for content in transit
 * between contexts (exploration 0166). Drop any node here mid-move;
 * drag it back out later. Entries are references, never copies.
 */
import type { TabNodeType } from '../state'
import { CANVAS_INTERNAL_NODE_MIME, serializeCanvasInternalNodeDragData } from '@xnetjs/canvas'
import { getNodeTransfer, hasNodeTransfer, setNodeTransfer } from '@xnetjs/ui'
import { Inbox, X } from 'lucide-react'
import { useState } from 'react'
import { useWorkbench } from '../state'
import { TAB_VIEWS } from '../tabs'

export function ShelfTray() {
  const shelf = useWorkbench((state) => state.shelf)
  const shelfAdd = useWorkbench((state) => state.shelfAdd)
  const shelfRemove = useWorkbench((state) => state.shelfRemove)
  const shelfClear = useWorkbench((state) => state.shelfClear)
  const [over, setOver] = useState(false)

  return (
    <div
      className={`flex h-full min-h-0 flex-col transition-colors ${over ? 'bg-accent/60' : ''}`}
      onDragOver={(event) => {
        if (!hasNodeTransfer(event)) return
        event.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        setOver(false)
        const transfer = getNodeTransfer(event)
        if (!transfer) return
        event.preventDefault()
        shelfAdd({
          nodeId: transfer.nodeId,
          nodeType: transfer.nodeType,
          title: transfer.title,
          schemaId: transfer.schemaId
        })
      }}
    >
      {shelf.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-1 text-xs text-ink-3">
          <Inbox size={16} strokeWidth={1.5} />
          Drop anything here to hold it while you work.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 p-3">
            {shelf.map((entry) => {
              const Icon =
                entry.nodeType in TAB_VIEWS ? TAB_VIEWS[entry.nodeType as TabNodeType].icon : Inbox
              return (
                <div
                  key={entry.nodeId}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'copyMove'
                    setNodeTransfer(event, {
                      nodeId: entry.nodeId,
                      nodeType: entry.nodeType,
                      title: entry.title,
                      schemaId: entry.schemaId,
                      sourceContext: 'shelf'
                    })
                    if (entry.schemaId) {
                      event.dataTransfer.setData(
                        CANVAS_INTERNAL_NODE_MIME,
                        serializeCanvasInternalNodeDragData({
                          nodeId: entry.nodeId,
                          schemaId: entry.schemaId,
                          title: entry.title || 'Untitled'
                        })
                      )
                    }
                  }}
                  className="group flex cursor-grab items-center gap-1.5 rounded-md border border-hairline bg-surface-0 px-2 py-1 text-xs text-ink-2"
                >
                  <Icon size={12} strokeWidth={1.5} className="shrink-0 text-ink-3" />
                  <span className="max-w-[160px] truncate">{entry.title || entry.nodeId}</span>
                  <button
                    type="button"
                    title="Remove from shelf"
                    aria-label="Remove from shelf"
                    onClick={() => shelfRemove(entry.nodeId)}
                    className="cursor-pointer border-none bg-transparent p-0 text-ink-3 opacity-0 transition-opacity hover:text-ink-1 group-hover:opacity-100"
                  >
                    <X size={11} strokeWidth={1.5} />
                  </button>
                </div>
              )
            })}
          </div>
          <div className="mt-auto border-t border-hairline p-2">
            <button
              type="button"
              onClick={shelfClear}
              className="cursor-pointer border-none bg-transparent p-0 px-1 text-[11px] text-ink-3 hover:text-ink-1"
            >
              Clear shelf
            </button>
          </div>
        </>
      )}
    </div>
  )
}
