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
