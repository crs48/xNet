/**
 * DevTools panel registry.
 *
 * A typed registry that describes every panel's metadata — its label, icon,
 * group, tier, and search keywords. The Shell renders the four `hero` panels
 * in the always-visible primary row and tucks every `secondary` panel into a
 * grouped "More" menu + the command palette, so the bottom strip stays cozy
 * instead of being a wall of 20 same-weight tabs.
 *
 * Keeping this as pure metadata (no React component refs) means it stays
 * trivially testable and importable without pulling in the panel tree. The
 * Shell maps `id -> component` in one switch.
 */

import type { PanelId } from '../provider/DevToolsContext'
import {
  Activity,
  ArrowLeftRight,
  BarChart3,
  Bot,
  Boxes,
  Braces,
  Clock,
  Database,
  Gauge,
  GitCommit,
  HardDrive,
  History,
  Lock,
  RefreshCw,
  ScrollText,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sprout,
  Tag,
  Trash2,
  type LucideIcon
} from 'lucide-react'

/** Which row a panel lives in. */
export type PanelTier = 'hero' | 'secondary'

/** Category used to group secondary panels in the "More" menu + palette. */
export type PanelGroup = 'data' | 'activity' | 'protocol' | 'tools'

export interface DevtoolsPanelDef {
  id: PanelId
  label: string
  icon: LucideIcon
  group: PanelGroup
  tier: PanelTier
  /** Extra terms the command palette matches against, beyond the label. */
  keywords: string[]
  /** One-line description shown in the palette. */
  description: string
}

/** Human labels for each group (used as section headers). */
export const PANEL_GROUP_LABELS: Record<PanelGroup, string> = {
  data: 'Data',
  activity: 'Activity',
  protocol: 'Protocol',
  tools: 'Tools'
}

/** Order groups appear in the "More" menu / palette. */
export const PANEL_GROUP_ORDER: PanelGroup[] = ['data', 'activity', 'protocol', 'tools']

export const DEVTOOLS_PANELS: DevtoolsPanelDef[] = [
  // ─── Hero panels ──────────────────────────────────────────
  {
    id: 'data',
    label: 'Data',
    icon: Database,
    group: 'data',
    tier: 'hero',
    keywords: ['nodes', 'query', 'table', 'rows', 'browse', 'store', 'records'],
    description: 'Query and browse every node in the store'
  },
  {
    id: 'changes',
    label: 'Changes',
    icon: GitCommit,
    group: 'data',
    tier: 'hero',
    keywords: ['crdt', 'log', 'lamport', 'diff', 'history', 'conflict'],
    description: 'Live feed of the CRDT change log'
  },
  {
    id: 'logs',
    label: 'Logs',
    icon: ScrollText,
    group: 'activity',
    tier: 'hero',
    keywords: ['debug', 'console', 'sync', 'sqlite', 'query', 'trace', 'output'],
    description: 'Toggle debug channels and read captured logs'
  },
  {
    id: 'performance',
    label: 'Performance',
    icon: Gauge,
    group: 'activity',
    tier: 'hero',
    keywords: ['perf', 'profile', 'boot', 'trace', 'fps', 'memory', 'timeline', 'latency'],
    description: 'Boot timeline, traces, query activity, and frame budget'
  },

  // ─── Secondary: Data ──────────────────────────────────────
  {
    id: 'schemas',
    label: 'Schemas',
    icon: Boxes,
    group: 'data',
    tier: 'secondary',
    keywords: ['schema', 'registry', 'properties', 'iri', 'types'],
    description: 'Browse the registered schema definitions'
  },
  {
    id: 'schema-history',
    label: 'Schema History',
    icon: History,
    group: 'data',
    tier: 'secondary',
    keywords: ['schema', 'version', 'migration', 'diff', 'columns'],
    description: 'Per-node schema version timeline'
  },

  // ─── Secondary: Activity ──────────────────────────────────
  {
    id: 'sync',
    label: 'Sync',
    icon: RefreshCw,
    group: 'activity',
    tier: 'secondary',
    keywords: ['peers', 'connection', 'hub', 'p2p', 'websocket', 'network'],
    description: 'Peer connections and sync statistics'
  },
  {
    id: 'queries',
    label: 'Queries',
    icon: Search,
    group: 'activity',
    tier: 'secondary',
    keywords: ['hooks', 'usequery', 'subscriptions', 'plan', 'render'],
    description: 'Active query/mutation hook subscriptions'
  },
  {
    id: 'traces',
    label: 'Traces',
    icon: Activity,
    group: 'activity',
    tier: 'secondary',
    keywords: ['waterfall', 'spans', 'timing', 'profile'],
    description: 'Per-operation trace waterfalls'
  },
  {
    id: 'telemetry',
    label: 'Telemetry',
    icon: BarChart3,
    group: 'activity',
    tier: 'secondary',
    keywords: ['metrics', 'security', 'crashes', 'consent', 'usage'],
    description: 'Security events, metrics, crashes, and consent'
  },

  // ─── Secondary: Protocol ──────────────────────────────────
  {
    id: 'yjs',
    label: 'Yjs',
    icon: Braces,
    group: 'protocol',
    tier: 'secondary',
    keywords: ['ydoc', 'crdt', 'state vector', 'document'],
    description: 'Inspect Y.Doc structure and updates'
  },
  {
    id: 'authz',
    label: 'AuthZ',
    icon: ShieldCheck,
    group: 'protocol',
    tier: 'secondary',
    keywords: ['authorization', 'grants', 'delegation', 'policy', 'access'],
    description: 'Authorization decisions and grant chains'
  },
  {
    id: 'abuse',
    label: 'Abuse',
    icon: ShieldAlert,
    group: 'protocol',
    tier: 'secondary',
    keywords: ['moderation', 'labels', 'reputation', 'quota', 'policy'],
    description: 'Policy decisions, labels, and peer scores'
  },
  {
    id: 'agent-audit',
    label: 'Agent Audit',
    icon: Bot,
    group: 'activity',
    tier: 'secondary',
    keywords: ['agent', 'openclaw', 'hermes', 'audit', 'approval', 'passport', 'ceremony'],
    description: 'Every agent tool call, its risk tier, and its approval trail'
  },
  {
    id: 'security',
    label: 'Security',
    icon: Lock,
    group: 'protocol',
    tier: 'secondary',
    keywords: ['crypto', 'ed25519', 'ml-dsa', 'signature', 'keys', 'quantum'],
    description: 'Cryptography level and key status'
  },
  {
    id: 'version',
    label: 'Version',
    icon: Tag,
    group: 'protocol',
    tier: 'secondary',
    keywords: ['protocol', 'features', 'peers', 'compatibility'],
    description: 'Protocol version and feature/peer matrices'
  },
  {
    id: 'migration',
    label: 'Migrate',
    icon: ArrowLeftRight,
    group: 'protocol',
    tier: 'secondary',
    keywords: ['migration', 'schema', 'lens', 'breaking', 'wizard'],
    description: 'Step-by-step schema migration wizard'
  },

  // ─── Secondary: Tools ─────────────────────────────────────
  {
    id: 'seed',
    label: 'Seed',
    icon: Sprout,
    group: 'tools',
    tier: 'secondary',
    keywords: ['test data', 'sample', 'generate', 'qa', 'fixtures'],
    description: 'Generate sample pages, databases, and comments'
  },
  {
    id: 'history',
    label: 'History',
    icon: Clock,
    group: 'tools',
    tier: 'secondary',
    keywords: ['time travel', 'snapshot', 'blame', 'audit', 'document'],
    description: 'Document history and time travel'
  },
  {
    id: 'sqlite',
    label: 'SQLite',
    icon: HardDrive,
    group: 'tools',
    tier: 'secondary',
    keywords: ['database', 'opfs', 'storage', 'adapter', 'quota'],
    description: 'SQLite health and storage status'
  },
  {
    id: 'reset',
    label: 'Reset',
    icon: Trash2,
    group: 'tools',
    tier: 'secondary',
    keywords: ['clear', 'wipe', 'factory', 'destructive', 'hub'],
    description: 'Clear local data, hub data, or everything'
  }
]

/** Lookup map by id. */
const PANEL_BY_ID: Map<PanelId, DevtoolsPanelDef> = new Map(
  DEVTOOLS_PANELS.map((panel) => [panel.id, panel])
)

export function getPanel(id: PanelId): DevtoolsPanelDef | undefined {
  return PANEL_BY_ID.get(id)
}

/** The always-visible primary-row panels, in registry order. */
export function heroPanels(): DevtoolsPanelDef[] {
  return DEVTOOLS_PANELS.filter((p) => p.tier === 'hero')
}

/** Secondary panels grouped + ordered for the "More" menu and palette. */
export function secondaryPanelsByGroup(): Array<{ group: PanelGroup; panels: DevtoolsPanelDef[] }> {
  return PANEL_GROUP_ORDER.map((group) => ({
    group,
    panels: DEVTOOLS_PANELS.filter((p) => p.tier === 'secondary' && p.group === group)
  })).filter((section) => section.panels.length > 0)
}

/** Every valid panel id (source of truth for persistence validation). */
export const ALL_PANEL_IDS: PanelId[] = DEVTOOLS_PANELS.map((p) => p.id)

/**
 * Migrate a previously-persisted panel id to its current name. Returns null
 * when the stored id has no modern equivalent (caller falls back to default).
 */
export function migratePanelId(stored: string): PanelId | null {
  // `nodes` was rebuilt into the queryable `data` browser.
  if (stored === 'nodes') return 'data'
  return (ALL_PANEL_IDS as string[]).includes(stored) ? (stored as PanelId) : null
}
