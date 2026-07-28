/**
 * Tab navigation helpers, expressed against the {@link PlatformPort}
 * (exploration 0406) — the host decides whether "open this node" means a URL
 * (web) or a shell-state transition (desktop).
 *
 * VS Code-style preview tabs (0284): opening a node from a single click is
 * a *preview* by default — it renders italic and is replaced by the next
 * single-click open. Editing it, or double-clicking its tab/source row,
 * promotes it to a permanent tab. Centralizing the preview intent here means
 * every single-click source (explorer, home list, chat links, person/space/
 * tag views, desk) gets the behavior without each remembering to opt in.
 * Pass `{ preview: false }` for activation of an already-open tab, and note
 * that deep links / back-forward / creation never route through here, so
 * they stay permanent.
 */
import type { NavigateOptions, NavTarget } from './platform'
import type { TabNodeType } from './state'
import type { CreatableDocType } from '../lib/doc-creation'
import { newDocId } from '../lib/doc-creation'

/** The port's navigate — what every helper here threads through. */
export type PlatformNavigate = (target: NavTarget, options?: NavigateOptions) => void

export function navigateToNode(
  navigate: PlatformNavigate,
  nodeType: TabNodeType,
  nodeId: string,
  opts: { preview?: boolean } = {}
): void {
  // Preview intent is applied by the host (it owns the tab store's latch);
  // the shell only states whether this open is a preview.
  navigate({
    kind: 'node',
    nodeType,
    nodeId,
    ...(opts.preview === false ? { preview: false } : {})
  })
}

/**
 * Open a node through an arbitrary registered view (0346).
 * `frameSpec` = `<viewType>~<nodeId>`; one route covers every
 * registry/plugin view. Tabless (0353) this is a plain route like any
 * other — the `frame` TabNodeType survives only so the tab path (still
 * reachable behind the preference) keeps working.
 */
export function navigateToFrame(
  navigate: PlatformNavigate,
  viewType: string,
  nodeId: string,
  opts: { preview?: boolean } = {}
): void {
  navigateToNode(navigate, 'frame', `${viewType}~${nodeId}`, opts)
}

/** Parse a frame tab's nodeId back into view type + target node. */
export function parseFrameSpec(frameSpec: string): { viewType: string; nodeId: string } | null {
  const idx = frameSpec.indexOf('~')
  if (idx <= 0 || idx === frameSpec.length - 1) return null
  return { viewType: frameSpec.slice(0, idx), nodeId: frameSpec.slice(idx + 1) }
}

/**
 * Generate an id for a new document and open its surface — the port-shaped
 * sibling of `lib/doc-creation`'s `navigateToNewDoc`. Every creatable doc
 * type is a {@link TabNodeType}, which the signature relies on; the old call
 * sites cast the router's navigate through `NavigateLike`, a hole the
 * compiler could not see into.
 */
export function navigateToNewDoc(navigate: PlatformNavigate, type: CreatableDocType): void {
  navigate({ kind: 'node', nodeType: type, nodeId: newDocId(), preview: false })
}
