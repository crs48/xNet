/**
 * Practices section on the contact detail (exploration 0422) — read-only.
 *
 * Shows the activities this pair actually shares, and, underneath, the
 * activities people commonly share in the kind of relationship they most
 * resemble but that this pair does not. That second list is the whole point:
 * it is a set difference offered as possibilities, never a gap to close.
 *
 * Deliberately absent: any number standing for the relationship. No health
 * score, no ranking against other contacts, no "you're neglecting this person".
 * The `scored intimacy` rule in scripts/check-humane-patterns.mjs and Charter §6
 * make that a build failure rather than a matter of taste.
 */
import { bundlesFromPrimitives, deriveBundle } from '@xnetjs/crm'
import { PracticeSchema, RelationshipPrimitiveSchema } from '@xnetjs/data'
import { useQuery } from '@xnetjs/react'
import type { JSX } from 'react'
import { str } from './crm-helpers'

interface PracticeRow {
  id: string
  from?: unknown
  to?: unknown
  primitive?: unknown
}

interface PrimitiveRow {
  id: string
  label?: unknown
  conventionalBundles?: unknown
}

export function ContactPractices({ contactId }: { contactId: string }): JSX.Element {
  const { data: practiceData } = useQuery(PracticeSchema, {})
  const { data: primitiveData } = useQuery(RelationshipPrimitiveSchema, {})

  const practices = (practiceData ?? []) as PracticeRow[]
  const primitives = (primitiveData ?? []) as PrimitiveRow[]

  // `where` is equality-only, so the either-end match happens here — same shape
  // as the activity timeline above.
  const mine = practices.filter(
    (p) => str(p.from) === contactId || str(p.to) === contactId
  )
  const practisedIds = [...new Set(mine.map((p) => str(p.primitive)).filter(Boolean))]

  const labelOf = (id: string) =>
    str(primitives.find((p) => p.id === id)?.label) || 'Unnamed activity'

  const bundles = bundlesFromPrimitives(
    primitives.map((p) => ({ id: p.id, conventionalBundles: str(p.conventionalBundles) }))
  )
  // Only the closest-matching bundle is shown. Listing every bundle's misses
  // would turn a menu into an inventory of everything you are not.
  const [closest] = deriveBundle(practisedIds, bundles)
  const suggestions = closest && closest.matched.length > 0 ? closest.missing : []

  return (
    <div className="mt-6">
      <h3 className="mb-2 text-xs font-medium text-ink-2">Practices</h3>

      {practisedIds.length === 0 ? (
        <p className="text-xs text-ink-3">Nothing recorded yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {practisedIds.map((id) => (
            <li
              key={id}
              className="rounded-sm bg-surface-2 px-1.5 py-0.5 text-[11px] text-ink-1"
            >
              {labelOf(id)}
            </li>
          ))}
        </ul>
      )}

      {suggestions.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] uppercase tracking-wider text-ink-3">
            Often shared in a {closest.label} relationship
          </p>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {suggestions.map((id) => (
              <li
                key={id}
                className="rounded-sm border border-hairline px-1.5 py-0.5 text-[11px] text-ink-2"
              >
                {labelOf(id)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
