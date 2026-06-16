/**
 * Deal stakeholders (exploration 0190) — the DealContactRole M:M junction had
 * no UI. Lists the contacts on a deal with their buying role (decision-maker,
 * champion, technical-buyer, …) and lets you add/remove them. Rendered as an
 * extra panel inside the Deal NodeInspector.
 */
import {
  ContactSchema,
  DealContactRoleSchema,
  DEAL_CONTACT_ROLES,
  type DealContactRoleKind
} from '@xnetjs/data'
import { useMutate, useQuery } from '@xnetjs/react'
import { Trash2 } from 'lucide-react'
import { useState, type JSX } from 'react'
import { str } from './crm-helpers'

interface RoleRow {
  id: string
  deal?: unknown
  contact?: unknown
  role?: unknown
}
interface ContactRow {
  id: string
  displayName?: unknown
}

export function DealStakeholders({ dealId }: { dealId: string }): JSX.Element {
  const { data: roleData } = useQuery(DealContactRoleSchema, {})
  const { data: contactData } = useQuery(ContactSchema, { orderBy: { createdAt: 'desc' } })
  const { create, update, remove } = useMutate()
  const [addContact, setAddContact] = useState('')
  const [addRole, setAddRole] = useState<DealContactRoleKind>('decision-maker')

  const contacts = (contactData ?? []) as ContactRow[]
  const nameOf = (id: string): string =>
    str(contacts.find((c) => c.id === id)?.displayName) || 'Unknown contact'
  const roles = ((roleData ?? []) as RoleRow[]).filter((r) => str(r.deal) === dealId)
  const usedIds = new Set(roles.map((r) => str(r.contact)))
  const available = contacts.filter((c) => !usedIds.has(c.id))

  const add = async (): Promise<void> => {
    if (!addContact) return
    await create(DealContactRoleSchema, { deal: dealId, contact: addContact, role: addRole })
    setAddContact('')
  }

  return (
    <div className="flex flex-col gap-2 text-xs">
      {roles.length === 0 ? (
        <p className="text-ink-3">No stakeholders yet.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {roles.map((r) => (
            <li key={r.id} className="flex items-center gap-2">
              <span className="flex-1 truncate text-ink-1">{nameOf(str(r.contact))}</span>
              <select
                aria-label={`Role for ${nameOf(str(r.contact))}`}
                value={str(r.role) || 'other'}
                onChange={(e) =>
                  void update(DealContactRoleSchema, r.id, {
                    role: e.target.value as DealContactRoleKind
                  })
                }
                className="rounded-sm border border-hairline bg-surface-1 px-1.5 py-0.5 text-[11px] text-ink-2"
              >
                {DEAL_CONTACT_ROLES.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                aria-label={`Remove ${nameOf(str(r.contact))}`}
                onClick={() => void remove(r.id)}
                className="text-ink-3 hover:text-red-500"
              >
                <Trash2 size={12} strokeWidth={1.5} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {available.length > 0 && (
        <div className="flex items-center gap-1.5 pt-1">
          <select
            aria-label="Add stakeholder"
            value={addContact}
            onChange={(e) => setAddContact(e.target.value)}
            className="flex-1 rounded-sm border border-hairline bg-surface-1 px-1.5 py-0.5 text-[11px] text-ink-2"
          >
            <option value="">Add a contact…</option>
            {available.map((c) => (
              <option key={c.id} value={c.id}>
                {str(c.displayName) || 'Untitled contact'}
              </option>
            ))}
          </select>
          <select
            aria-label="Role"
            value={addRole}
            onChange={(e) => setAddRole(e.target.value as DealContactRoleKind)}
            className="rounded-sm border border-hairline bg-surface-1 px-1.5 py-0.5 text-[11px] text-ink-2"
          >
            {DEAL_CONTACT_ROLES.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void add()}
            disabled={!addContact}
            className="rounded-md border border-hairline px-2 py-0.5 text-[11px] text-ink-1 hover:bg-accent disabled:opacity-40"
          >
            Add
          </button>
        </div>
      )}
    </div>
  )
}
