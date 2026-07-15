/**
 * Context tools — accessory panels that attach to ANY node (explorations
 * 0327/0329, first consumer: the Time Machine).
 *
 * A context tool is a registry entry: given the focused node (the active
 * tab's node), the ContextPanel offers every tool whose `supportedSchemas`
 * matches the node's schema as an extra panel-local tab, after the sections
 * the active view publishes (0166). Tools are node-generic by construction —
 * they receive only a `nodeId` and read everything else from the store — so
 * one registration covers pages, tasks, database rows, canvases alike.
 */
import type { ReactNode } from 'react'
import { createElement } from 'react'
import { DraftReviewPanel } from './drafts/DraftReviewPanel'
import { TimeMachinePanel } from './timemachine/TimeMachinePanel'

export interface ContextToolDef {
  /** Stable id — becomes the ContextPanel section id (`tool:<id>`). */
  id: string
  /** Tab title shown in the context panel header. */
  title: string
  /** Icon name (lucide identifier) — a string so the registry stays render-free. */
  icon: string
  /** `'*'` attaches to every node; otherwise an explicit list of schema IRIs. */
  supportedSchemas: '*' | string[]
  /** Render the tool's panel body for the focused node. */
  render: (props: { nodeId: string }) => ReactNode
}

/**
 * The registry. Order matters within a specificity tier (first registered
 * renders first). The Time Machine leads: every node has a change log, so
 * every node gets history (exploration 0329).
 */
export const CONTEXT_TOOLS: ContextToolDef[] = [
  {
    id: 'time-machine',
    title: 'History',
    icon: 'history',
    supportedSchemas: '*',
    render: ({ nodeId }) => createElement(TimeMachinePanel, { nodeId })
  },
  {
    // The second context tool (exploration 0329 P3): review the focused
    // node's drafts as three-way property cards; merge/refresh/request-review.
    id: 'draft-review',
    title: 'Drafts',
    icon: 'git-branch',
    supportedSchemas: '*',
    render: ({ nodeId }) => createElement(DraftReviewPanel, { nodeId })
  }
]

/**
 * Tools applicable to a schema, specific-before-wildcard: a tool that names
 * the schema explicitly outranks a `'*'` tool; registry order breaks ties.
 */
export function contextToolsForSchema(
  schemaIRI: string,
  registry: readonly ContextToolDef[] = CONTEXT_TOOLS
): ContextToolDef[] {
  const specific = registry.filter(
    (tool) => tool.supportedSchemas !== '*' && tool.supportedSchemas.includes(schemaIRI)
  )
  const wildcard = registry.filter((tool) => tool.supportedSchemas === '*')
  return [...specific, ...wildcard]
}
