/**
 * DeskRadialMenu — flagged long-press radial menu on Desk cards (0273 §5).
 *
 * Marking menus (Kurtenbach & Buxton) are one of the few chrome-free
 * affordances with true pointer/touch parity: novices wait for the radial
 * popup, experts flick. This first cut is deliberately small — three actions
 * on one ring (well under the ≤8 × 1-level reliability ceiling) — and ships
 * behind `xnet:experiment:desk-radial` while the gesture grammar settles.
 *
 * Long-press (500ms, <8px travel) on any `[data-canvas-object-id]` card
 * inside the canvas surface opens the ring; Esc, click-away, or any action
 * closes it.
 */
import type { CanvasNode } from '@xnetjs/canvas'
import type * as Y from 'yjs'
import { useNavigate } from '@tanstack/react-router'
import { getCanvasObjectsMap } from '@xnetjs/canvas'
import { Presence } from '@xnetjs/ui'
import { ExternalLink, PanelRight, Trash2, type LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { navigateToNode } from '../workbench/navigation'
import { useWorkbench, type TabNodeType } from '../workbench/state'
import { SCHEMA_IDS } from '../workbench/views/explorer-items'

const LONG_PRESS_MS = 500
const MOVE_TOLERANCE_PX = 8
const RING_RADIUS = 64

const NODE_TYPE_BY_SCHEMA: Record<string, TabNodeType> = Object.fromEntries(
  Object.entries(SCHEMA_IDS).map(([nodeType, schemaId]) => [schemaId, nodeType as TabNodeType])
)

interface RadialState {
  x: number
  y: number
  objectId: string
}

interface RadialAction {
  id: string
  label: string
  icon: LucideIcon
  run: () => void
}

export function DeskRadialMenu({ doc }: { doc: Y.Doc }) {
  const navigate = useNavigate()
  const [state, setState] = useState<RadialState | null>(null)

  // Long-press detection on the canvas surface (mouse and touch alike).
  useEffect(() => {
    const surface = document.querySelector('[data-canvas-surface="true"]')
    if (!(surface instanceof HTMLElement)) return

    let timer: number | undefined
    let origin: { x: number; y: number } | null = null

    const cancel = () => {
      window.clearTimeout(timer)
      origin = null
    }

    const onPointerDown = (event: PointerEvent) => {
      const card =
        event.target instanceof Element ? event.target.closest('[data-canvas-object-id]') : null
      if (!card) return
      const objectId = card.getAttribute('data-canvas-object-id')
      if (!objectId) return
      origin = { x: event.clientX, y: event.clientY }
      timer = window.setTimeout(() => {
        setState({ x: event.clientX, y: event.clientY, objectId })
      }, LONG_PRESS_MS)
    }

    const onPointerMove = (event: PointerEvent) => {
      if (!origin) return
      if (
        Math.abs(event.clientX - origin.x) > MOVE_TOLERANCE_PX ||
        Math.abs(event.clientY - origin.y) > MOVE_TOLERANCE_PX
      ) {
        cancel()
      }
    }

    surface.addEventListener('pointerdown', onPointerDown)
    surface.addEventListener('pointermove', onPointerMove)
    surface.addEventListener('pointerup', cancel)
    surface.addEventListener('pointercancel', cancel)
    return () => {
      cancel()
      surface.removeEventListener('pointerdown', onPointerDown)
      surface.removeEventListener('pointermove', onPointerMove)
      surface.removeEventListener('pointerup', cancel)
      surface.removeEventListener('pointercancel', cancel)
    }
  }, [doc])

  useEffect(() => {
    if (!state) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setState(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state])

  if (!state) return null

  const card = getCanvasObjectsMap<CanvasNode>(doc).get(state.objectId)
  if (!card) return null

  const nodeType = card.sourceSchemaId ? (NODE_TYPE_BY_SCHEMA[card.sourceSchemaId] ?? null) : null
  const title =
    card.alias?.trim() ||
    (typeof card.properties?.title === 'string' ? card.properties.title : '') ||
    'Untitled'

  const actions: RadialAction[] = [
    ...(nodeType && card.sourceNodeId
      ? [
          {
            id: 'open',
            label: 'Open',
            icon: ExternalLink,
            run: () => navigateToNode(navigate, nodeType, card.sourceNodeId as string)
          },
          {
            id: 'peek',
            label: 'Peek',
            icon: PanelRight,
            run: () =>
              useWorkbench.getState().openCanvas({
                nodeType,
                nodeId: card.sourceNodeId as string,
                title
              })
          }
        ]
      : []),
    {
      id: 'remove',
      label: 'Remove from Desk',
      icon: Trash2,
      run: () => {
        doc.transact(() => {
          getCanvasObjectsMap(doc).delete(state.objectId)
        })
      }
    }
  ]

  return (
    <>
      {/* Scrim: click-away closes without acting. */}
      <div className="fixed inset-0 z-50" onPointerDown={() => setState(null)} aria-hidden />
      <Presence show motion="pop" className="fixed z-50" wrapperProps={{ role: 'menu' }}>
        <div
          data-desk-radial="true"
          className="pointer-events-none fixed"
          style={{ left: state.x, top: state.y }}
        >
          {actions.map((action, index) => {
            // Spread the ring across the top arc so items never sit under
            // the pressing finger.
            const angle = Math.PI * (0.75 + (index / Math.max(actions.length - 1, 1)) * 0.5)
            const dx = Math.cos(angle) * RING_RADIUS
            const dy = -Math.sin(angle) * RING_RADIUS
            const Icon = action.icon
            return (
              <button
                key={action.id}
                type="button"
                role="menuitem"
                title={action.label}
                aria-label={action.label}
                onClick={() => {
                  setState(null)
                  action.run()
                }}
                style={{ transform: `translate(${dx - 20}px, ${dy - 20}px)` }}
                className="pointer-events-auto absolute flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-hairline bg-surface-1 text-ink-2 shadow-lg transition-colors hover:text-ink-1"
              >
                <Icon size={16} strokeWidth={1.5} />
              </button>
            )
          })}
        </div>
      </Presence>
    </>
  )
}
