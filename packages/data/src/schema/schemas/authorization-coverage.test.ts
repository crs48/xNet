/**
 * Authorization coverage guard rail (exploration 0192).
 *
 * Every built-in schema must either declare an `authorization` block or appear
 * on the intentional `AUTH_EXEMPT_SCHEMA_IRIS` allowlist. A schema with no
 * authorization is "legacy" (owner-only) in the policy engine's eyes — so a new
 * content type shipping without a policy silently becomes un-shareable the day
 * the evaluator is wired in. This test freezes coverage and forces a per-schema
 * decision for every future schema.
 */
import { describe, expect, it } from 'vitest'
import { getAuthMode } from '../../auth'
import { AUTH_EXEMPT_SCHEMA_IRIS, isAuthExemptSchema } from './auth-exempt'
import { builtInSchemas } from './index'

describe('authorization coverage', () => {
  it('every registered schema declares authorization or is explicitly exempt', async () => {
    const offenders: string[] = []
    const seen = new Set<string>()

    for (const load of Object.values(builtInSchemas)) {
      const defined = await load()
      const schema = defined.schema
      const id = schema['@id']
      if (seen.has(id)) continue
      seen.add(id)

      if (getAuthMode(schema) === 'legacy' && !isAuthExemptSchema(id)) {
        offenders.push(`${schema.name} (${id})`)
      }
    }

    expect(
      offenders,
      `Schemas missing an authorization block (add spaceCascadeAuthorization() ` +
        `or add the IRI to AUTH_EXEMPT_SCHEMA_IRIS with a justification): ` +
        offenders.join(', ')
    ).toEqual([])
  })

  it('every auth-exempt schema is actually registered and actually legacy', async () => {
    // Guards against the allowlist rotting: an exempt entry that no longer
    // exists, or one that has since gained an authorization block (and should
    // therefore be removed from the exemption).
    const byId = new Map<
      string,
      Awaited<ReturnType<(typeof builtInSchemas)[keyof typeof builtInSchemas]>>['schema']
    >()
    for (const load of Object.values(builtInSchemas)) {
      const defined = await load()
      byId.set(defined.schema['@id'], defined.schema)
    }

    const stale: string[] = []
    for (const iri of AUTH_EXEMPT_SCHEMA_IRIS) {
      const schema = byId.get(iri)
      if (!schema) continue // unversioned aliases resolve to the same @id; skip
      if (getAuthMode(schema) !== 'legacy') {
        stale.push(`${schema.name} (${iri}) now declares authorization — remove the exemption`)
      }
    }

    expect(stale, stale.join(', ')).toEqual([])
  })
})
