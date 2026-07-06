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
 * closes it. The ring geometry and action set live in ./desk-cards (pure,
 * unit-tested); this file is the gesture plumbing and presentation.
 */
import type { CanvasNode } from '@xnetjs/canvas'
import type * as Y from 'yjs'
import { useNavigate } from '@tanstack/react-router'
import { getCanvasObjectsMap } from '@xnetjs/canvas'
import { Presence } from '@xnetjs/ui'
import { ExternalLink, PanelRight, Trash2, type LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { navigateToNode } from '../workbench/navigation'
import { useWorkbench } from '../workbench/state'
import {
  deskCardMeta,
  radialActionsFor,
  radialOffset,
  type DeskRadialActionDef
} from './desk-cards'

const LONG_PRESS_MS = 500
const MOVE_TOLERANCE_PX = 8
const RING_RADIUS = 64

const ACTION_ICONS: Record<DeskRadialActionDef['id'], LucideIcon> = {
  open: ExternalLink,
  peek: PanelRight,
  remove: Trash2
}

interface RadialState {
  x: number
  y: number
  objectId: string
}

/** Resolve the card element under a pointer event, if any. */
function radialTargetFor(event: PointerEvent): string | null {
  const card =
    event.target instanceof Element ? event.target.closest('[data-canvas-object-id]') : null
  return card?.getAttribute('data-canvas-object-id') ?? null
}

/** Long-press detection on the canvas surface (mouse and touch alike). */
function useLongPress(onLongPress: (state: RadialState) => void) {
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
      const objectId = radialTargetFor(event)
      if (!objectId) return
      origin = { x: event.clientX, y: event.clientY }
      timer = window.setTimeout(() => {
        onLongPress({ x: event.clientX, y: event.clientY, objectId })
      }, LONG_PRESS_MS)
    }

    const onPointerMove = (event: PointerEvent) => {
      if (!origin) return
      const moved =
        Math.abs(event.clientX - origin.x) > MOVE_TOLERANCE_PX ||
        Math.abs(event.clientY - origin.y) > MOVE_TOLERANCE_PX
      if (moved) cancel()
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
  }, [onLongPress])
}

interface RadialRunContext {
  doc: Y.Doc
  objectId: string
  meta: ReturnType<typeof deskCardMeta>
  navigate: ReturnType<typeof useNavigate>
}

function runRadialOpen({ meta, navigate }: RadialRunContext): void {
  if (!meta.nodeType || !meta.sourceNodeId) return
  navigateToNode(navigate, meta.nodeType, meta.sourceNodeId)
}

function runRadialPeek({ meta }: RadialRunContext): void {
  if (!meta.nodeType || !meta.sourceNodeId) return
  useWorkbench.getState().openCanvas({
    nodeType: meta.nodeType,
    nodeId: meta.sourceNodeId,
    title: meta.label
  })
}

function runRadialRemove({ doc, objectId }: RadialRunContext): void {
  doc.transact(() => {
    getCanvasObjectsMap(doc).delete(objectId)
  })
}

const RADIAL_RUNNERS: Record<DeskRadialActionDef['id'], (ctx: RadialRunContext) => void> = {
  open: runRadialOpen,
  peek: runRadialPeek,
  remove: runRadialRemove
}

function RadialRing({
  doc,
  state,
  card,
  onClose
}: {
  doc: Y.Doc
  state: RadialState
  card: CanvasNode
  onClose: () => void
}) {
  const navigate = useNavigate()
  const meta = deskCardMeta(card)
  const actions = radialActionsFor(meta)

  const run = (id: DeskRadialActionDef['id']) => {
    onClose()
    RADIAL_RUNNERS[id]({ doc, objectId: state.objectId, meta, navigate })
  }

  return (
    <>
      {/* Scrim: click-away closes without acting. */}
      <div className="fixed inset-0 z-50" onPointerDown={onClose} aria-hidden />
      <Presence show motion="pop" className="fixed z-50" wrapperProps={{ role: 'menu' }}>
        <div
          data-desk-radial="true"
          className="pointer-events-none fixed"
          style={{ left: state.x, top: state.y }}
        >
          {actions.map((action, index) => {
            const { dx, dy } = radialOffset(index, actions.length, RING_RADIUS)
            const Icon = ACTION_ICONS[action.id]
            return (
              <button
                key={action.id}
                type="button"
                role="menuitem"
                title={action.label}
                aria-label={action.label}
                onClick={() => run(action.id)}
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

export function DeskRadialMenu({ doc }: { doc: Y.Doc }) {
  const [state, setState] = useState<RadialState | null>(null)
  useLongPress(setState)

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

  return <RadialRing doc={doc} state={state} card={card} onClose={() => setState(null)} />
}
