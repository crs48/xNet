/**
 * Contact hygiene tools (exploration 0190) — surfaces two fully-built but
 * unwired `@xnetjs/crm` capabilities:
 *  - vCard (RFC 6350) import/export via toVCards / parseVCard.
 *  - Duplicate detection via findDuplicateCandidates (Jaro-Winkler + blocking),
 *    with a merge that re-points references (activities, deals, roles,
 *    relationships, introducer edges) from the duplicate onto the survivor,
 *    fills the survivor's empty fields, then removes the duplicate.
 */
import {
  findDuplicateCandidates,
  parseVCard,
  toVCards,
  type DuplicateCandidate,
  type VCardContact
} from '@xnetjs/crm'
import {
  ActivitySchema,
  ContactSchema,
  DealContactRoleSchema,
  DealSchema,
  RelationshipSchema
} from '@xnetjs/data'
import { useMutate, useQuery } from '@xnetjs/react'
import { useMemo, useRef, useState, type JSX } from 'react'
import { str } from './crm-helpers'

interface ContactRow {
  id: string
  displayName?: unknown
  firstName?: unknown
  lastName?: unknown
  email?: unknown
  phone?: unknown
  title?: unknown
  org?: unknown
}

function toVCardContact(c: ContactRow): VCardContact {
  return {
    displayName: str(c.displayName) || 'Unnamed',
    ...(str(c.firstName) ? { firstName: str(c.firstName) } : {}),
    ...(str(c.lastName) ? { lastName: str(c.lastName) } : {}),
    ...(str(c.email) ? { email: str(c.email) } : {}),
    ...(str(c.phone) ? { phone: str(c.phone) } : {}),
    ...(str(c.title) ? { title: str(c.title) } : {})
  }
}

function download(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/vcard' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function ContactTools({ contacts }: { contacts: ContactRow[] }): JSX.Element {
  const { create, update, remove } = useMutate()
  const { data: activityData } = useQuery(ActivitySchema, { limit: 2000 })
  const { data: dealData } = useQuery(DealSchema, { limit: 1000 })
  const { data: roleData } = useQuery(DealContactRoleSchema, { limit: 2000 })
  const { data: relData } = useQuery(RelationshipSchema, { limit: 2000 })
  const fileRef = useRef<HTMLInputElement>(null)
  const [showDupes, setShowDupes] = useState(false)
  const [busy, setBusy] = useState(false)

  const candidates = useMemo<DuplicateCandidate[]>(
    () =>
      findDuplicateCandidates(
        contacts.map((c) => ({
          id: c.id,
          displayName: str(c.displayName),
          email: str(c.email) || null,
          phone: str(c.phone) || null
        }))
      ),
    [contacts]
  )
  const nameOf = (id: string): string =>
    str(contacts.find((c) => c.id === id)?.displayName) || 'Unknown'

  const exportVcf = (): void => {
    download('contacts.vcf', toVCards(contacts.map(toVCardContact)))
  }

  const importVcf = async (file: File): Promise<void> => {
    const text = await file.text()
    const parsed = parseVCard(text)
    for (const v of parsed) {
      await create(ContactSchema, {
        displayName: v.displayName,
        ...(v.firstName ? { firstName: v.firstName } : {}),
        ...(v.lastName ? { lastName: v.lastName } : {}),
        ...(v.email ? { email: v.email } : {}),
        ...(v.phone ? { phone: v.phone } : {}),
        ...(v.title ? { title: v.title } : {})
      })
    }
  }

  /** Re-point references from `dupId` to `survivorId`, fill gaps, delete dup. */
  const merge = async (survivorId: string, dupId: string): Promise<void> => {
    setBusy(true)
    try {
      const repoint = async (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        schema: any,
        rows: Array<{ id: string }>,
        field: string,
        match: (r: Record<string, unknown>) => boolean
      ): Promise<void> => {
        for (const r of rows as Array<Record<string, unknown>>) {
          if (match(r)) await update(schema, (r as { id: string }).id, { [field]: survivorId })
        }
      }
      const activities = (activityData ?? []) as unknown as Array<Record<string, unknown>>
      const deals = (dealData ?? []) as unknown as Array<Record<string, unknown>>
      const roles = (roleData ?? []) as unknown as Array<Record<string, unknown>>
      const rels = (relData ?? []) as unknown as Array<Record<string, unknown>>

      await repoint(ActivitySchema, activities as never, 'contact', (r) => str(r.contact) === dupId)
      await repoint(ActivitySchema, activities as never, 'about', (r) => str(r.about) === dupId)
      await repoint(
        DealSchema,
        deals as never,
        'primaryContact',
        (r) => str(r.primaryContact) === dupId
      )
      await repoint(
        DealContactRoleSchema,
        roles as never,
        'contact',
        (r) => str(r.contact) === dupId
      )
      await repoint(RelationshipSchema, rels as never, 'from', (r) => str(r.from) === dupId)
      await repoint(RelationshipSchema, rels as never, 'to', (r) => str(r.to) === dupId)
      await repoint(
        ContactSchema,
        contacts as never,
        'introducedBy',
        (r) => str(r.introducedBy) === dupId
      )

      // Fill the survivor's empty fields from the duplicate.
      const survivor = contacts.find((c) => c.id === survivorId)
      const dup = contacts.find((c) => c.id === dupId)
      if (survivor && dup) {
        const patch: Record<string, unknown> = {}
        for (const key of ['firstName', 'lastName', 'email', 'phone', 'title', 'org'] as const) {
          if (!str(survivor[key]) && str(dup[key])) patch[key] = str(dup[key])
        }
        if (Object.keys(patch).length > 0) await update(ContactSchema, survivorId, patch)
      }

      await remove(dupId)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-1.5 px-3 pb-2">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={exportVcf}
          className="rounded-sm border border-hairline px-2 py-0.5 text-[11px] text-ink-2 hover:bg-accent"
        >
          Export vCard
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="rounded-sm border border-hairline px-2 py-0.5 text-[11px] text-ink-2 hover:bg-accent"
        >
          Import vCard
        </button>
        <button
          type="button"
          onClick={() => setShowDupes((v) => !v)}
          className={`rounded-sm border border-hairline px-2 py-0.5 text-[11px] hover:bg-accent ${
            candidates.length > 0 ? 'text-amber-500' : 'text-ink-2'
          }`}
        >
          Duplicates{candidates.length > 0 ? ` (${candidates.length})` : ''}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".vcf,text/vcard"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void importVcf(f)
            e.target.value = ''
          }}
        />
      </div>

      {showDupes && (
        <div className="rounded-sm border border-hairline p-2 text-[11px]">
          {candidates.length === 0 ? (
            <p className="text-ink-3">No likely duplicates.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {candidates.map((c) => (
                <li key={`${c.a}:${c.b}`} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-ink-1">
                    {nameOf(c.a)} ⟷ {nameOf(c.b)}
                    <span className="ml-1 text-ink-3">{Math.round(c.score * 100)}%</span>
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void merge(c.a, c.b)}
                    title={`Merge ${nameOf(c.b)} into ${nameOf(c.a)}`}
                    className="rounded-sm border border-hairline px-1.5 py-0.5 text-ink-2 hover:bg-accent disabled:opacity-40"
                  >
                    Merge →
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
