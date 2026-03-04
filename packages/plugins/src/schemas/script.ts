/**
 * Script schema - stores user-created scripts as Nodes for P2P sync
 *
 * Scripts are the simplest plugin type (Layer 1) - single functions that
 * transform or react to data. They run in a sandboxed environment with
 * no network, DOM, or import access.
 */

import { defineSchema, text, checkbox, date, select } from '@xnetjs/data'

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Script trigger types:
 * - manual: Run via UI button or command
 * - onChange: Run when a node matching inputSchema changes
 * - onView: Run when computing a column value (lazy evaluation)
 * - scheduled: Run on a cron schedule (future)
 */
export type ScriptTriggerType = 'manual' | 'onChange' | 'onView' | 'scheduled'

/**
 * Script output types:
 * - value: Returns a computed value (for computed columns)
 * - mutation: Returns partial node to merge into target
 * - decoration: Returns visual decorations/tags
 * - void: Side-effect only (logging, etc.)
 */
export type ScriptOutputType = 'value' | 'mutation' | 'decoration' | 'void'

// ─── Schema Definition ───────────────────────────────────────────────────────

const TRIGGER_OPTIONS = [
  { id: 'manual', name: 'Manual', color: 'gray' },
  { id: 'onChange', name: 'On Change', color: 'blue' },
  { id: 'onView', name: 'On View', color: 'green' },
  { id: 'scheduled', name: 'Scheduled', color: 'purple' }
] as const

const OUTPUT_OPTIONS = [
  { id: 'value', name: 'Value', color: 'blue' },
  { id: 'mutation', name: 'Mutation', color: 'orange' },
  { id: 'decoration', name: 'Decoration', color: 'purple' },
  { id: 'void', name: 'Void', color: 'gray' }
] as const

/**
 * Script schema for user-created scripts.
 *
 * Scripts are stored as Nodes and sync via P2P like any other data.
 * They can be created manually, via AI generation, or imported.
 *
 * @example
 * ```typescript
 * // Create a tax calculator script
 * await store.create(ScriptSchema, {
 *   name: 'Calculate Tax',
 *   description: 'Adds 8% tax to subtotal',
 *   code: '(node) => node.subtotal * 0.08',
 *   triggerType: 'onView',
 *   outputType: 'value',
 *   inputSchema: 'xnet://myapp/Invoice',
 *   enabled: true
 * })
 * ```
 */
export const ScriptSchema = defineSchema({
  name: 'Script',
  namespace: 'xnet://xnet.dev/',
  properties: {
    /** Human-readable script name */
    name: text({ required: true }),

    /** Description of what the script does */
    description: text({}),

    /** The script code (JavaScript expression or arrow function) */
    code: text({ required: true }),

    /** When the script should execute */
    triggerType: select({
      options: TRIGGER_OPTIONS,
      default: 'manual'
    }),

    /** For onChange trigger: which property to watch (empty = any) */
    triggerProperty: text({}),

    /** For scheduled trigger: cron expression */
    triggerCron: text({}),

    /** Schema IRI this script operates on (e.g., 'xnet://myapp/Task') */
    inputSchema: text({}),

    /** What the script returns */
    outputType: select({
      options: OUTPUT_OPTIONS,
      default: 'value'
    }),

    /** Whether the script is active */
    enabled: checkbox({ default: true }),

    /** Last execution error message (null if last run succeeded) */
    lastError: text({}),

    /** Timestamp of last execution */
    lastRun: date({})
  }
})

// ─── Script Node Type ────────────────────────────────────────────────────────

/**
 * Type-safe representation of a Script node
 */
export interface ScriptNode {
  id: string
  schemaId: string
  name: string
  description?: string
  code: string
  triggerType: ScriptTriggerType
  triggerProperty?: string
  triggerCron?: string
  inputSchema?: string
  outputType: ScriptOutputType
  enabled: boolean
  lastError?: string
  lastRun?: number
}

/**
 * Type guard to check if a node is a Script
 */
export function isScriptNode(node: unknown): node is ScriptNode {
  if (!node || typeof node !== 'object') return false
  const n = node as Record<string, unknown>
  return (
    typeof n.id === 'string' &&
    typeof n.name === 'string' &&
    typeof n.code === 'string' &&
    typeof n.triggerType === 'string' &&
    typeof n.outputType === 'string' &&
    typeof n.enabled === 'boolean'
  )
}
