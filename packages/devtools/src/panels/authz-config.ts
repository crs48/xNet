import type { PanelId } from '../provider/DevToolsContext'

export type AuthZTab = 'playground' | 'grants' | 'timeline' | 'delegation' | 'propagation'

export const AUTHZ_TABS: readonly AuthZTab[] = [
  'playground',
  'grants',
  'timeline',
  'delegation',
  'propagation'
]

export const AUTHZ_PANEL_ID: PanelId = 'authz'
