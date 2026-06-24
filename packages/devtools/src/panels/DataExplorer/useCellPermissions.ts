/**
 * Per-cell authorization for the Data grid.
 *
 * Computes, lazily (only in edit mode) and over the loaded window, which cells
 * the current identity may write — via `store.auth.can` (no mutation). Read is
 * node-level and unreadable nodes are already filtered out by the store, so the
 * only locks we surface are edit locks: a non-writable node locks all its
 * editable cells, and a field with a restrictive `fieldRule` locks that cell.
 *
 * Returns a `cellLockReasons` map keyed "rowId:fieldId" → human reason, which
 * GridSurface uses to both block editing and show a lock glyph + tooltip.
 */

import type { NodeState, Schema } from '@xnetjs/data'
import { useEffect, useMemo, useState } from 'react'
import { useDevTools } from '../../provider/useDevTools'

export type WriteDecision = { allowed: boolean; reasons: readonly string[] }

/** Field names that carry a field-level rule on this schema (so they may be
 *  restricted even when the node is writable). The serialized authorization
 *  already keys fieldRules by field name — no deserialize needed. */
export function restrictedFieldNames(schema: Schema | null): Set<string> {
  const rules = (schema?.authorization as { fieldRules?: Record<string, unknown> } | undefined)
    ?.fieldRules
  return rules ? new Set(Object.keys(rules)) : new Set<string>()
}

const DENY_REASON_TEXT: Record<string, string> = {
  DENY_NODE_POLICY: 'a node policy denies it',
  DENY_NO_ROLE_MATCH: 'you hold no role that allows it',
  DENY_NO_GRANT: 'no grant authorizes it',
  DENY_FIELD_RESTRICTED: 'a field rule restricts this column',
  DENY_GRANT_EXPIRED: 'the grant has expired',
  DENY_NOT_AUTHENTICATED: 'you are not authenticated'
}

function friendlyNodeReason(reasons: readonly string[] | undefined): string {
  const mapped = (reasons ?? []).map((r) => DENY_REASON_TEXT[r] ?? r)
  return mapped.length > 0
    ? `You can't edit this node — ${mapped.join('; ')}`
    : "You can't edit this node"
}

/**
 * Pure derivation of the per-cell lock map from resolved decisions. A
 * non-writable node locks all its editable cells; a restrictive field rule
 * locks that one cell. Cells are left unlocked until their decision resolves
 * (optimistic) to avoid flicker.
 */
export function deriveCellLocks(params: {
  nodes: NodeState[]
  editableFieldIds: string[]
  restricted: ReadonlySet<string>
  nodeWrite: ReadonlyMap<string, WriteDecision>
  fieldWrite: ReadonlyMap<string, boolean>
}): Map<string, string> {
  const { nodes, editableFieldIds, restricted, nodeWrite, fieldWrite } = params
  const locks = new Map<string, string>()
  for (const node of nodes) {
    const dec = nodeWrite.get(node.id)
    if (dec && !dec.allowed) {
      const reason = friendlyNodeReason(dec.reasons)
      for (const fieldId of editableFieldIds) locks.set(`${node.id}:${fieldId}`, reason)
      continue
    }
    for (const f of restricted) {
      if (!editableFieldIds.includes(f)) continue
      if (fieldWrite.get(`${node.id}:${f}`) === false) {
        locks.set(`${node.id}:${f}`, `The "${f}" field is restricted by a field rule`)
      }
    }
  }
  return locks
}

export function useCellPermissions(opts: {
  nodes: NodeState[]
  schema: Schema | null
  editing: boolean
  /** Field ids that are editable by type (not system/computed) — the cells we
   *  may need to lock for authorization reasons. */
  editableFieldIds: string[]
}) {
  const { store } = useDevTools()
  const authz = store?.auth ?? null
  const authzEnabled = Boolean(authz)
  const { nodes, schema, editing, editableFieldIds } = opts
  const restricted = useMemo(() => restrictedFieldNames(schema), [schema])

  const [nodeWrite, setNodeWrite] = useState<Map<string, WriteDecision>>(new Map())
  const [fieldWrite, setFieldWrite] = useState<Map<string, boolean>>(new Map())

  // Evaluate only while editing (you only need editability when editing).
  useEffect(() => {
    if (!authz || !editing) {
      setNodeWrite(new Map())
      setFieldWrite(new Map())
      return
    }
    let alive = true
    const restrictedFields = [...restricted].filter((f) => editableFieldIds.includes(f))
    void (async () => {
      const nodeEntries = await Promise.all(
        nodes.map(async (node): Promise<readonly [string, WriteDecision]> => {
          try {
            const d = await authz.can({ action: 'write', nodeId: node.id })
            return [node.id, { allowed: d.allowed, reasons: d.reasons ?? [] }]
          } catch {
            return [node.id, { allowed: true, reasons: [] }]
          }
        })
      )
      // Field-level checks only for fields that actually carry a rule (rare).
      const fieldPairs = restrictedFields.length
        ? nodes.flatMap((node) => restrictedFields.map((f) => ({ node, f })))
        : []
      const fieldEntries = await Promise.all(
        fieldPairs.map(async ({ node, f }): Promise<readonly [string, boolean]> => {
          try {
            const d = await authz.can({
              action: 'write',
              nodeId: node.id,
              patch: { [f]: node.properties[f] ?? null }
            })
            return [`${node.id}:${f}`, d.allowed]
          } catch {
            return [`${node.id}:${f}`, true]
          }
        })
      )
      if (alive) {
        setNodeWrite(new Map(nodeEntries))
        setFieldWrite(new Map(fieldEntries))
      }
    })()
    return () => {
      alive = false
    }
  }, [authz, editing, nodes, restricted, editableFieldIds])

  const cellLockReasons = useMemo(() => {
    if (!authz || !editing) return new Map<string, string>()
    return deriveCellLocks({ nodes, editableFieldIds, restricted, nodeWrite, fieldWrite })
  }, [authz, editing, nodes, nodeWrite, fieldWrite, restricted, editableFieldIds])

  return { cellLockReasons, authzEnabled }
}
