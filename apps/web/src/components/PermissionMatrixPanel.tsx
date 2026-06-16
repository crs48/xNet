/**
 * PermissionMatrixPanel — "who can do what" for a node's schema (exploration 0188).
 *
 * Reflects the doc's schema authorization into a role × action matrix using
 * `buildPermissionMatrix`, and lists each role with its provenance (how a
 * subject comes to hold it: creator / property / inherited / membership). This
 * is a structural summary of the policy; concrete per-subject access still
 * flows through the evaluator (and the People tab shows actual grantees).
 */

import { buildPermissionMatrix, type SchemaIRI } from '@xnetjs/data'
import { useNodeStore, useEffectiveSchema } from '@xnetjs/react'
import { Globe, KeyRound, ShieldCheck, UserCircle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

const ACTION_LABELS: Record<string, string> = {
  read: 'View',
  write: 'Edit',
  delete: 'Delete',
  share: 'Share',
  admin: 'Administer'
}

function RolePill({ role }: { role: string }): JSX.Element {
  return (
    <span className="px-1.5 py-0.5 rounded bg-secondary text-[11px] text-foreground">{role}</span>
  )
}

export function PermissionMatrixPanel({ docId }: { docId: string }): JSX.Element {
  const { store, isReady } = useNodeStore()
  const [schemaId, setSchemaId] = useState<SchemaIRI | null>(null)

  useEffect(() => {
    let active = true
    if (!isReady || !store) return
    void store
      .get(docId)
      .then((node) => {
        if (active) setSchemaId((node?.schemaId as SchemaIRI | undefined) ?? null)
      })
      .catch(() => {
        if (active) setSchemaId(null)
      })
    return () => {
      active = false
    }
  }, [store, isReady, docId])

  const { schema, loading } = useEffectiveSchema(schemaId)
  const matrix = useMemo(() => buildPermissionMatrix(schema?.authorization), [schema])

  if (loading || !schemaId) {
    return <p className="text-xs text-muted-foreground">Resolving permissions…</p>
  }

  if (matrix.roles.length === 0) {
    return (
      <div className="flex items-start gap-2 text-xs text-muted-foreground">
        <Globe size={14} className="mt-0.5 shrink-0" />
        <span>This type has no access rules — anyone with the link can read it.</span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <section>
        <h3 className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">Roles</h3>
        <ul className="space-y-1">
          {matrix.roles.map((role) => (
            <li key={role.role} className="flex items-center gap-2 text-xs">
              <UserCircle size={14} className="shrink-0 text-muted-foreground" />
              <span className="font-medium">{role.role}</span>
              <span className="text-muted-foreground">— {role.provenance}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">
          Who can do what
        </h3>
        <table className="w-full text-xs">
          <tbody>
            {matrix.actions.map((action) => (
              <tr key={action.action} className="border-t border-border">
                <td className="py-1.5 pr-3 align-top font-medium whitespace-nowrap">
                  {ACTION_LABELS[action.action] ?? action.action}
                </td>
                <td className="py-1.5">
                  <div className="flex flex-wrap items-center gap-1">
                    {action.public && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-500 text-[11px]">
                        <Globe size={11} /> Anyone
                      </span>
                    )}
                    {action.authenticated && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-500 text-[11px]">
                        <KeyRound size={11} /> Signed in
                      </span>
                    )}
                    {action.roles.map((role) => (
                      <RolePill key={role} role={role} />
                    ))}
                    {action.denied.map((role) => (
                      <span
                        key={`deny-${role}`}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 text-[11px] line-through"
                      >
                        {role}
                      </span>
                    ))}
                    {!action.public &&
                      !action.authenticated &&
                      action.roles.length === 0 &&
                      action.denied.length === 0 && (
                        <span className="text-muted-foreground">Nobody</span>
                      )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <ShieldCheck size={12} className="mt-0.5 shrink-0" />
          Roles are resolved structurally from the schema. See the People tab for who currently
          holds each role.
        </p>
      </section>
    </div>
  )
}
