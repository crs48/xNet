/**
 * Tab navigation helper — the router stays authoritative, so every
 * tab activation goes through navigate(); the route effect in
 * EditorArea reconciles the store afterwards.
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
import type { TabNodeType } from './state'
import type { useNavigate } from '@tanstack/react-router'
import { setPreviewIntent } from './tabs'

type Navigate = ReturnType<typeof useNavigate>

export function navigateToNode(
  navigate: Navigate,
  nodeType: TabNodeType,
  nodeId: string,
  opts: { preview?: boolean } = {}
): void {
  if (opts.preview !== false) setPreviewIntent()
  switch (nodeType) {
    case 'page':
      void navigate({ to: '/doc/$docId', params: { docId: nodeId } })
      break
    case 'database':
      void navigate({ to: '/db/$dbId', params: { dbId: nodeId } })
      break
    case 'canvas':
      void navigate({ to: '/canvas/$canvasId', params: { canvasId: nodeId } })
      break
    case 'dashboard':
      void navigate({ to: '/dashboard/$dashboardId', params: { dashboardId: nodeId } })
      break
    case 'map':
      void navigate({ to: '/map/$mapId' as never, params: { mapId: nodeId } as never })
      break
    case 'savedview':
      void navigate({ to: '/view/$viewId' as never, params: { viewId: nodeId } as never })
      break
    case 'tasks':
      void navigate({ to: '/tasks' })
      break
    case 'meetings':
      void navigate({ to: '/meetings' })
      break
    case 'data':
      void navigate({ to: '/data' })
      break
    case 'experiments':
      void navigate({ to: '/experiments' as never })
      break
    case 'crm':
      void navigate({ to: '/crm' as never })
      break
    case 'finance':
      void navigate({ to: '/finance' as never })
      break
    case 'tag':
      void navigate({ to: '/tag/$tagId' as never, params: { tagId: nodeId } as never })
      break
    case 'channel':
      void navigate({ to: '/channel/$channelId', params: { channelId: nodeId } })
      break
    case 'person':
      void navigate({ to: '/person/$did' as never, params: { did: nodeId } as never })
      break
    case 'lab':
      void navigate({ to: '/lab/$labId' as never, params: { labId: nodeId } as never })
      break
    case 'space':
      void navigate({ to: '/space/$spaceId' as never, params: { spaceId: nodeId } as never })
      break
    case 'settings':
      void navigate({ to: '/settings' })
      break
    case 'frame':
      void navigate({ to: '/frame/$frameSpec' as never, params: { frameSpec: nodeId } as never })
      break
    default:
      // Exhaustiveness guard: a TabNodeType with no case here navigates
      // nowhere, silently. Tabless (0353) that also strands the history
      // chords, which resolve a remembered route through this switch.
      assertNeverNodeType(nodeType)
  }
}

function assertNeverNodeType(nodeType: never): void {
  console.warn(`navigateToNode: unhandled node type ${String(nodeType)}`)
}

/**
 * Open a node through an arbitrary registered view (0346).
 * `frameSpec` = `<viewType>~<nodeId>`; one route covers every
 * registry/plugin view. Tabless (0353) this is a plain route like any
 * other — the `frame` TabNodeType survives only so the tab path (still
 * reachable behind the preference) keeps working.
 */
export function navigateToFrame(
  navigate: Navigate,
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
