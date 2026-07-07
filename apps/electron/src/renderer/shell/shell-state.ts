/**
 * Desktop shell state — the ShellState union plus the pure transition
 * reducer, extracted from App.tsx. Adding a new shell view means adding a
 * kind here (state + action + reducer arm + overlay title) instead of
 * threading it through App.tsx callbacks.
 *
 * The overlay transition-timer semantics (OVERLAY_OPEN_DELAY_MS) are owned by
 * `use-document-shell.ts`; the reducer itself is pure and synchronous.
 */

export type DocType = 'page' | 'database' | 'canvas'

export type ViewportSnapshot = {
  x: number
  y: number
  zoom: number
}

export type ShellState =
  | { kind: 'canvas-home' }
  | { kind: 'page-focus'; docId: string; returnViewport: ViewportSnapshot | null }
  | { kind: 'database-focus'; docId: string; returnViewport: ViewportSnapshot | null }
  | { kind: 'database-split'; docId: string }
  | { kind: 'settings' }
  | { kind: 'data-workspace' }
  | { kind: 'social-import' }
  | { kind: 'meetings' }
  | { kind: 'stories' }

export type DocumentItem = {
  id: string
  title: string
  type: DocType
  createdAt?: number
  updatedAt?: number
}

/**
 * When a focus transition animates from the canvas (the camera glide toward
 * the linked document), the overlay opens after this delay so the glide is
 * visible before the focused surface covers it.
 */
export const OVERLAY_OPEN_DELAY_MS = 180

export type ShellAction =
  | { type: 'return-home' }
  | {
      type: 'focus-document'
      docType: Exclude<DocType, 'canvas'>
      docId: string
      returnViewport: ViewportSnapshot | null
    }
  | { type: 'open-database-split'; docId: string }
  | { type: 'open-settings' }
  | { type: 'open-data-workspace' }
  | { type: 'open-social-import' }
  | { type: 'open-meetings' }
  | { type: 'open-stories' }

export function shellReducer(_state: ShellState, action: ShellAction): ShellState {
  switch (action.type) {
    case 'return-home':
      return { kind: 'canvas-home' }
    case 'focus-document':
      return action.docType === 'page'
        ? { kind: 'page-focus', docId: action.docId, returnViewport: action.returnViewport }
        : { kind: 'database-focus', docId: action.docId, returnViewport: action.returnViewport }
    case 'open-database-split':
      return { kind: 'database-split', docId: action.docId }
    case 'open-settings':
      return { kind: 'settings' }
    case 'open-data-workspace':
      return { kind: 'data-workspace' }
    case 'open-social-import':
      return { kind: 'social-import' }
    case 'open-meetings':
      return { kind: 'meetings' }
    case 'open-stories':
      return { kind: 'stories' }
  }
}

export function overlayTitleFor(kind: ShellState['kind']): string | null {
  if (kind === 'page-focus') return 'Document'
  if (kind === 'database-focus') return 'Database'
  if (kind === 'settings') return 'Settings'
  if (kind === 'data-workspace') return 'Data Workspace'
  if (kind === 'social-import') return 'Social Import'
  if (kind === 'meetings') return 'Meetings'
  if (kind === 'stories') return 'Stories'
  return null
}

/** The canvas stays interactive underneath these shell states. */
export function isCanvasInteractiveShellKind(kind: ShellState['kind']): boolean {
  return kind === 'canvas-home' || kind === 'database-split'
}
