/**
 * `<Screen>` — a wireframe surface for visual explorations (exploration 0403).
 *
 * The renderer owns the look; the author owns the content. Write plain semantic
 * HTML as children — `<h1>`, `<p>`, `<button>`, `.wf-card`, `.wf-pill` — and
 * `wireframe.css` themes it from the real token ramp.
 *
 * Use a `<Screen>` for UI that does NOT exist yet. For a change to a surface
 * that already ships, import the real component instead (0403's tier rule).
 */
import * as lucide from 'lucide-react'
import React, { useEffect, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import './wireframe.css'

/** Footprints. Pick the one the user will actually see — a sidebar popover is a
 *  `popover`, not a desktop page plus a phone frame. */
export type WireframeSurface = 'browser' | 'desktop' | 'mobile' | 'popover' | 'panel'

export interface ScreenProps {
  /** Footprint and aspect. Never set width/height yourself. */
  surface?: WireframeSurface
  /** Optional caption rendered beneath the frame. */
  label?: string
  children?: React.ReactNode
}

/**
 * Marker names authors may use in `data-icon`, mapped to the repo's icon set
 * (lucide-react — the only icon library `packages/ui` depends on). Aliases match
 * the vocabulary in the visual-exploration skill so a marker never renders as a
 * visible word.
 */
const ICONS: Record<string, keyof typeof lucide> = {
  mail: 'Mail',
  email: 'Mail',
  lock: 'Lock',
  password: 'Lock',
  search: 'Search',
  plus: 'Plus',
  add: 'Plus',
  x: 'X',
  close: 'X',
  check: 'Check',
  chevronDown: 'ChevronDown',
  chevron: 'ChevronDown',
  caret: 'ChevronDown',
  dropdown: 'ChevronDown',
  chevronUp: 'ChevronUp',
  chevronLeft: 'ChevronLeft',
  chevronRight: 'ChevronRight',
  dots: 'MoreHorizontal',
  more: 'MoreHorizontal',
  user: 'User',
  settings: 'Settings',
  calendar: 'Calendar',
  bell: 'Bell',
  send: 'Send',
  edit: 'Pencil',
  arrowLeft: 'ArrowLeft',
  arrowRight: 'ArrowRight'
}

/** Resolve a marker name to a lucide component, or null if unknown. */
export function resolveIcon(name: string): React.ComponentType<{ className?: string }> | null {
  const key = ICONS[name]
  if (!key) return null
  const Icon = lucide[key] as unknown

  return typeof Icon === 'function' ? (Icon as React.ComponentType<{ className?: string }>) : null
}

/**
 * Replace every `[data-icon]` marker inside `host` with a real SVG.
 *
 * Authors write an empty `<span data-icon="mail" aria-label="Email" />` rather
 * than the word "mail", so a mockup shows an icon where the product would.
 * Unknown names are left alone (and warned about) rather than silently dropped —
 * a missing icon the author can see beats one that vanished.
 */
function mountIcons(host: HTMLElement, roots: Root[]): void {
  host.querySelectorAll<HTMLElement>('[data-icon]').forEach((el) => {
    if (el.dataset.wfIconMounted === 'true') return
    const name = el.dataset.icon ?? ''
    const Icon = resolveIcon(name)
    if (!Icon) {
      console.warn(`[wireframe] unknown data-icon "${name}" — left as-is`)

      return
    }
    el.dataset.wfIconMounted = 'true'
    el.classList.add('wf-icon')
    const root = createRoot(el)
    root.render(<Icon className="wf-icon" />)
    roots.push(root)
  })
}

export function Screen({ surface = 'panel', label, children }: ScreenProps): React.ReactElement {
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = bodyRef.current
    if (!host) return
    const roots: Root[] = []
    mountIcons(host, roots)

    return () => {
      // Defer: unmounting a root synchronously from inside an effect cleanup
      // warns in React 18.
      queueMicrotask(() => roots.forEach((root) => root.unmount()))
    }
  }, [children])

  return (
    <figure style={{ margin: 0, display: 'inline-flex', flexDirection: 'column', gap: '8px' }}>
      <div className="wf-root" data-surface={surface}>
        <div className="wf-body" ref={bodyRef}>
          {children}
        </div>
      </div>
      {label ? (
        <figcaption style={{ fontSize: '12px', color: 'hsl(var(--ink-2))' }}>{label}</figcaption>
      ) : null}
    </figure>
  )
}
