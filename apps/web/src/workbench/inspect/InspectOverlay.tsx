/**
 * InspectOverlay — the pointing device for point-and-change (exploration 0399).
 *
 * Hold <kbd>⌥</kbd>: the element under the pointer is outlined and labelled with
 * the LANE that owns it and one sentence saying what a change there would move.
 * Release the key and it is gone. <kbd>⌥</kbd>-click freezes that resolution and
 * opens the Lane 1 change panel ({@link InspectPrompt}).
 *
 * Invisible by default on purpose. The doc's "not overwhelming" requirement is
 * satisfied by borrowing an affordance everyone already knows from the browser
 * inspector rather than adding a mode, a panel, or a persistent toolbar.
 *
 * The hover pass itself still cannot change anything — every edit goes through
 * the panel, and the panel leads with the blast-radius sentence.
 */
import { resolveLane, type Resolution } from '@xnetjs/devkit/blast-radius'
import { getSlotView } from '@xnetjs/workbench'
import { useCallback, useEffect, useRef, useState } from 'react'
import { InspectPrompt } from './InspectPrompt'
import {
  browserColorNormalizer,
  buildTokenIndex,
  resolvePointed,
  tokenRefFor
} from './resolve-pointed'

/** What the overlay needs to draw itself for one hovered element. */
interface Hovered {
  rect: DOMRect
  resolution: Resolution
}

const LANE_LABEL: Record<1 | 2 | 3, string> = {
  1: 'Lane 1 · theme & layout',
  2: 'Lane 2 · plugin',
  3: 'Lane 3 · xNet source'
}

/**
 * Outline and chip colour per verdict.
 *
 * A refusal reads as a refusal (destructive), Lane 3 as "this costs a pull
 * request" (warning), and the no-code lanes as ordinary accent. Token classes
 * only — raw palette colours are what the 0299 surface guard exists to stop.
 */
function laneStyles(resolution: Resolution): { ring: string; chip: string } {
  if (!resolution.allowed) {
    return { ring: 'border-destructive', chip: 'bg-destructive text-destructive-foreground' }
  }
  if (resolution.lane === 3) {
    return { ring: 'border-warning', chip: 'bg-warning text-warning-foreground' }
  }
  return { ring: 'border-accent-ink', chip: 'bg-accent text-accent-foreground' }
}

/** A frozen resolution the user clicked into, with where to pin the panel. */
interface Pinned {
  resolution: Resolution
  anchor: { left: number; top: number }
}

export function InspectOverlay(): React.JSX.Element | null {
  const [hovered, setHovered] = useState<Hovered | null>(null)
  const [pinned, setPinned] = useState<Pinned | null>(null)
  // Refs, not state: the pointer position and the modifier state are read inside
  // listeners that must not be re-registered on every mouse move.
  const lastTarget = useRef<Element | null>(null)
  const heldRef = useRef(false)
  const tokenIndex = useRef<Map<string, string>>(new Map())
  // One probe element for the whole session; tokens hold HSL components while
  // computed styles report rgb(), so the two must be normalized to compare.
  const normalizeColor = useRef(browserColorNormalizer())

  const show = useCallback((target: Element | null) => {
    if (!target) {
      setHovered(null)
      return
    }
    const pointed = resolvePointed(target, {
      slotLabel: (id) => getSlotView(id)?.label,
      tokenRef: (element) => tokenRefFor(element, tokenIndex.current, (el) => getComputedStyle(el))
    })
    setHovered({ rect: target.getBoundingClientRect(), resolution: resolveLane(pointed) })
  }, [])

  const setHeld = useCallback(
    (held: boolean) => {
      if (heldRef.current === held) return
      heldRef.current = held
      if (!held) {
        setHovered(null)
        return
      }
      // Rebuilt per activation rather than per move: inverting every custom
      // property on :root is cheap but not free, and the theme cannot change
      // while a modifier is held.
      tokenIndex.current = buildTokenIndex(
        getComputedStyle(document.documentElement),
        normalizeColor.current
      )
      // Resolve from where the pointer already is, so holding the key without
      // moving the mouse still shows something.
      show(lastTarget.current)
    },
    [show]
  )

  useEffect(() => {
    // `event.target` is the element under the pointer for a real mousemove —
    // more direct than a hit test, and it still works when the window has no
    // laid-out viewport (`elementFromPoint` returns null for every coordinate
    // there, which silently disables the whole overlay).
    const onMove = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null
      lastTarget.current = target
      // The event is the authority on the modifier: holding ⌥ and switching
      // windows never delivers a keyup, so a cached flag goes stale.
      setHeld(event.altKey)
      if (event.altKey) show(target)
    }
    const onKey = (event: KeyboardEvent) => {
      // Escape closes the panel; without it the only way out is the X, and a
      // modal-ish surface that ignores Escape reads as stuck.
      if (event.key === 'Escape') setPinned(null)
      setHeld(event.altKey)
    }
    const clear = () => setHeld(false)

    // ⌥-click freezes what the overlay is currently describing. Captured so the
    // click never reaches the app underneath — pointing at a button to change it
    // must not also press it.
    const onClick = (event: MouseEvent) => {
      if (!event.altKey) return
      const target = event.target instanceof Element ? event.target : null
      if (!target) return
      event.preventDefault()
      event.stopPropagation()
      const rect = target.getBoundingClientRect()
      const pointed = resolvePointed(target, {
        slotLabel: (id) => getSlotView(id)?.label,
        tokenRef: (element) =>
          tokenRefFor(element, tokenIndex.current, (el) => getComputedStyle(el))
      })
      setPinned({
        resolution: resolveLane(pointed),
        anchor: { left: rect.left, top: rect.bottom + 8 }
      })
    }

    window.addEventListener('mousemove', onMove, { passive: true, capture: true })
    window.addEventListener('click', onClick, { capture: true })
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    window.addEventListener('blur', clear)
    document.addEventListener('visibilitychange', clear)
    return () => {
      window.removeEventListener('mousemove', onMove, { capture: true })
      window.removeEventListener('click', onClick, { capture: true })
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
      window.removeEventListener('blur', clear)
      document.removeEventListener('visibilitychange', clear)
    }
  }, [setHeld, show])

  if (!hovered && !pinned) return null

  // The panel is a SIBLING of the highlight layer, never a child: that layer is
  // `aria-hidden` and `pointer-events-none`, which would make the dialog inside
  // it both unclickable and invisible to assistive tech.
  const panel = pinned ? (
    <InspectPrompt
      resolution={pinned.resolution}
      anchor={pinned.anchor}
      onClose={() => setPinned(null)}
    />
  ) : null

  if (!hovered) return panel

  const { rect, resolution } = hovered
  const styles = laneStyles(resolution)
  // Flip the chip below the element when there is no room above it.
  const above = rect.top > 44

  return (
    <>
      <div
        // Presentation only, and it must never intercept the pointer it is
        // tracking — every layer here is inert.
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[70]"
        data-testid="inspect-overlay"
      >
        <div
          className={`absolute rounded-sm border-2 ${styles.ring}`}
          style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
        />
        <div
          className={`absolute max-w-sm rounded-md px-2 py-1 text-[11px] leading-snug shadow-md ${styles.chip}`}
          style={{ left: rect.left, top: above ? rect.top - 40 : rect.bottom + 6 }}
        >
          <span className="font-medium">
            {resolution.allowed ? LANE_LABEL[resolution.lane] : 'Not editable here'}
          </span>
          <span className="ml-1 opacity-90">{resolution.explain}</span>
        </div>
      </div>
      {panel}
    </>
  )
}
