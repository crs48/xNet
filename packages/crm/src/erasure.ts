/**
 * Erasure-by-design (GDPR Art. 17) — anonymize rather than hard-delete, so
 * referential integrity and aggregate reporting survive while the PII is gone.
 * Returns a patch to apply to a Contact via `update`; a background job (not
 * here) cascades to null PII in the contact's Activity bodies.
 */

export interface ContactErasurePatch {
  displayName: string
  firstName: null
  lastName: null
  email: null
  phone: null
  howWeMet: null
  piiErasedAt: number
}

/**
 * The patch that anonymizes a contact: clears identifying fields, replaces the
 * display name with a non-identifying placeholder, and stamps `piiErasedAt`.
 */
export function anonymizeContactPatch(at: number = Date.now()): ContactErasurePatch {
  return {
    displayName: 'Erased contact',
    firstName: null,
    lastName: null,
    email: null,
    phone: null,
    howWeMet: null,
    piiErasedAt: at
  }
}

/** Whether a contact has been erased (its PII anonymized). */
export function isErased(contact: { piiErasedAt?: number | null }): boolean {
  return contact.piiErasedAt != null
}

export interface ErasablePractice {
  id: string
  from?: string | null
  to?: string | null
}

/**
 * The practices to **delete** when a contact is erased (exploration 0422).
 *
 * Practices are the one CRM record that cannot be anonymized the way contacts
 * and activities are. An activity survives erasure with its body nulled because
 * the remaining husk ("a call happened") is not about anyone. A practice is the
 * opposite: the claim *is* the payload. "Erased contact goes to therapy with
 * Maria Reyes" still discloses the sensitive fact and re-identifies through the
 * other end of the edge, and blanking `primitive` is not available — it is a
 * required property, so a cleared practice is an invalid node rather than an
 * anonymous one.
 *
 * So erasure removes them outright. Callers delete these ids; there is no patch
 * to apply, and returning an empty list means the contact genuinely had no
 * practices — not that erasure was skipped.
 */
export function practiceErasureIds(
  contactId: string,
  practices: readonly ErasablePractice[]
): string[] {
  return practices.filter((p) => p.from === contactId || p.to === contactId).map((p) => p.id)
}
