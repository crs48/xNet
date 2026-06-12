/**
 * Shell-level focus ring (exploration 0166).
 *
 * Regions carry data-wb-region attributes; F6 / Shift+F6 cycle focus
 * through the visible ones (the VS Code model), and Escape inside a
 * panel returns focus to the editor — the per-region "trap" exit.
 * Every shell action stays reachable by keyboard alone.
 */
import { getCommandRegistry } from '@xnetjs/plugins'
import { useEffect } from 'react'
import { useWorkbench } from './state'

export type WorkbenchRegion = 'left' | 'editor' | 'right' | 'bottom'

const RING_ORDER: WorkbenchRegion[] = ['left', 'editor', 'right', 'bottom']

const FOCUSABLE =
  'input, textarea, select, button, a[href], [tabindex]:not([tabindex="-1"]), [contenteditable="true"]'

export function focusRegion(region: WorkbenchRegion): void {
  const root = document.querySelector<HTMLElement>(`[data-wb-region="${region}"]`)
  if (!root) return
  const target = root.querySelector<HTMLElement>(FOCUSABLE) ?? root
  target.focus()
}

function visibleRing(): WorkbenchRegion[] {
  const state = useWorkbench.getState()
  return RING_ORDER.filter((region) => {
    if (region === 'editor') return true
    return state[region].open
  })
}

function currentRegion(): WorkbenchRegion | null {
  const active = document.activeElement
  if (!(active instanceof HTMLElement)) return null
  const root = active.closest<HTMLElement>('[data-wb-region]')
  return (root?.dataset.wbRegion as WorkbenchRegion | undefined) ?? null
}

function cycleRegion(delta: 1 | -1): void {
  const ring = visibleRing()
  if (ring.length === 0) return
  const current = currentRegion()
  const index = current ? ring.indexOf(current) : -1
  const next = ring[(index + delta + ring.length) % ring.length]
  focusRegion(next)
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
    return true
  }
  return target.isContentEditable
}

export function useFocusRing(): void {
  useEffect(() => {
    const registry = getCommandRegistry()
    const disposables = [
      registry.register({
        id: 'workbench.focusNextRegion',
        title: 'Focus next region',
        key: 'F6',
        allowInInput: true,
        run: () => cycleRegion(1)
      }),
      registry.register({
        id: 'workbench.focusPreviousRegion',
        title: 'Focus previous region',
        key: 'Shift-F6',
        allowInInput: true,
        run: () => cycleRegion(-1)
      }),
      registry.register({
        id: 'workbench.focusEditor',
        title: 'Focus editor',
        run: () => focusRegion('editor')
      })
    ]

    // Escape inside a panel returns to the editor; inputs keep their
    // own Escape semantics (blur, close menus) untouched.
    const escapeHandler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (isEditableTarget(event.target)) return
      const region = currentRegion()
      if (region && region !== 'editor') {
        focusRegion('editor')
      }
    }

    window.addEventListener('keydown', escapeHandler)
    return () => {
      for (const disposable of disposables) disposable.dispose()
      window.removeEventListener('keydown', escapeHandler)
    }
  }, [])
}
