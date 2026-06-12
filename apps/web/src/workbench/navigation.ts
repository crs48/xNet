/**
 * Tab navigation helper — the router stays authoritative, so every
 * tab activation goes through navigate(); the route effect in
 * EditorArea reconciles the store afterwards.
 */
import type { TabNodeType } from './state'
import type { useNavigate } from '@tanstack/react-router'

type Navigate = ReturnType<typeof useNavigate>

export function navigateToNode(navigate: Navigate, nodeType: TabNodeType, nodeId: string): void {
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
    case 'savedview':
      void navigate({ to: '/view/$viewId' as never, params: { viewId: nodeId } as never })
      break
    case 'tasks':
      void navigate({ to: '/tasks' })
      break
    case 'data':
      void navigate({ to: '/data' })
      break
  }
}
