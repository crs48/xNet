import type { PanelId } from '../provider/DevToolsContext'

export const DEVTOOLS_PANELS: Array<{ id: PanelId; label: string }> = [
  { id: 'nodes', label: 'Nodes' },
  { id: 'changes', label: 'Changes' },
  { id: 'sync', label: 'Sync' },
  { id: 'yjs', label: 'Yjs' },
  { id: 'authz', label: 'AuthZ' },
  { id: 'queries', label: 'Queries' },
  { id: 'telemetry', label: 'Telemetry' },
  { id: 'schemas', label: 'Schemas' },
  { id: 'schema-history', label: 'Schema Hist' },
  { id: 'security', label: 'Security' },
  { id: 'sqlite', label: 'SQLite' },
  { id: 'version', label: 'Version' },
  { id: 'migration', label: 'Migrate' },
  { id: 'seed', label: 'Seed' },
  { id: 'history', label: 'History' }
]
