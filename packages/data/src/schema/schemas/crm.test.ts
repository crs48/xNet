import type { DID } from '../node'
import { describe, expect, it } from 'vitest'
import {
  OrganizationSchema,
  ContactSchema,
  RelationshipSchema,
  StageSchema,
  DealSchema,
  DealContactRoleSchema,
  ActivitySchema,
  ProductSchema,
  LineItemSchema,
  crmSchemas
} from './crm'
import { builtInSchemas } from './index'

const testDID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' as DID

describe('CRM schema pack (0187)', () => {
  it('registers all ten schemas under versioned and legacy IRIs', () => {
    for (const iri of [
      'xnet://xnet.fyi/Organization@1.0.0',
      'xnet://xnet.fyi/Contact@1.0.0',
      'xnet://xnet.fyi/Relationship@1.0.0',
      'xnet://xnet.fyi/Pipeline@1.0.0',
      'xnet://xnet.fyi/Stage@1.0.0',
      'xnet://xnet.fyi/Deal@1.0.0',
      'xnet://xnet.fyi/DealContactRole@1.0.0',
      'xnet://xnet.fyi/Activity@1.0.0',
      'xnet://xnet.fyi/Product@1.0.0',
      'xnet://xnet.fyi/LineItem@1.0.0',
      'xnet://xnet.fyi/Organization',
      'xnet://xnet.fyi/Contact',
      'xnet://xnet.fyi/Relationship',
      'xnet://xnet.fyi/Pipeline',
      'xnet://xnet.fyi/Stage',
      'xnet://xnet.fyi/Deal',
      'xnet://xnet.fyi/DealContactRole',
      'xnet://xnet.fyi/Activity',
      'xnet://xnet.fyi/Product',
      'xnet://xnet.fyi/LineItem'
    ] as const) {
      expect(builtInSchemas[iri]).toBeTypeOf('function')
    }
  })

  it('exposes exactly ten schemas in the crmSchemas array', () => {
    expect(crmSchemas).toHaveLength(10)
  })

  describe('ContactSchema', () => {
    it('requires only displayName and defaults lifecycle/visibility', () => {
      expect(ContactSchema.schema['@id']).toBe('xnet://xnet.fyi/Contact@1.0.0')
      const c = ContactSchema.create({ displayName: 'Maria Reyes' }, { createdBy: testDID })
      expect(c.displayName).toBe('Maria Reyes')
      // Lifecycle-as-field (no separate Lead object).
      expect(c.lifecycle).toBe('lead')
      // `inherit` = owner-only when personal, Space-scoped when in a Space.
      expect(c.visibility).toBe('inherit')
    })

    it('lowercases the email and rejects a malformed one', () => {
      const c = ContactSchema.create(
        { displayName: 'Jo', email: 'Jo@Example.COM' },
        { createdBy: testDID }
      )
      expect(c.email).toBe('jo@example.com')
      expect(ContactSchema.validate({ displayName: 'Jo', email: 'not-an-email' }).valid).toBe(false)
    })

    it('rejects a contact with no displayName', () => {
      expect(ContactSchema.validate({ email: 'a@b.co' }).valid).toBe(false)
    })

    it('carries the optional self-identity (did) and social actor link', () => {
      const c = ContactSchema.create(
        { displayName: 'Owned Contact', did: testDID, actor: 'actor-1' },
        { createdBy: testDID }
      )
      expect(c.did).toBe(testDID)
      expect(c.actor).toBe('actor-1')
    })
  })

  describe('OrganizationSchema', () => {
    it('has a collaborative document and self-referential parent', () => {
      expect(OrganizationSchema.schema.document).toBe('yjs')
      const org = OrganizationSchema.create(
        { name: 'Acme Inc', domain: 'acme.com', parent: 'org-holding' },
        { createdBy: testDID }
      )
      expect(org.name).toBe('Acme Inc')
      expect(org.parent).toBe('org-holding')
    })
  })

  describe('Pipeline + Stage + Deal', () => {
    it('models a stage with a termination flag pair and default probability', () => {
      const stage = StageSchema.create(
        { name: 'Closed Won', pipeline: 'p1', probability: 1, isClosed: true, isWon: true },
        { createdBy: testDID }
      )
      expect(stage.isClosed).toBe(true)
      expect(stage.isWon).toBe(true)
      expect(stage.probability).toBe(1)
    })

    it('requires a stage to belong to a pipeline', () => {
      expect(StageSchema.validate({ name: 'Orphan stage' }).valid).toBe(false)
    })

    it('defaults a deal to the pipeline forecast category', () => {
      const deal = DealSchema.create(
        { title: 'Acme renewal', amount: 12000, stage: 's1' },
        { createdBy: testDID }
      )
      expect(deal.title).toBe('Acme renewal')
      expect(deal.amount).toBe(12000)
      expect(deal.forecastCategory).toBe('pipeline')
    })

    it('requires both deal and contact on a DealContactRole', () => {
      expect(DealContactRoleSchema.validate({ deal: 'd1' }).valid).toBe(false)
      const role = DealContactRoleSchema.create(
        { deal: 'd1', contact: 'c1', role: 'champion', isPrimary: true },
        { createdBy: testDID }
      )
      expect(role.role).toBe('champion')
      expect(role.isPrimary).toBe(true)
    })
  })

  describe('ActivitySchema', () => {
    it('models a polymorphic timeline event (who + what)', () => {
      const a = ActivitySchema.create(
        { kind: 'call', contact: 'c1', about: 'deal-1', summary: 'Intro call' },
        { createdBy: testDID }
      )
      expect(a.kind).toBe('call')
      expect(a.contact).toBe('c1')
      expect(a.about).toBe('deal-1')
    })
  })

  describe('Relationship + catalog', () => {
    it('requires both ends of a relationship edge', () => {
      expect(RelationshipSchema.validate({ from: 'c1' }).valid).toBe(false)
      const rel = RelationshipSchema.create(
        { from: 'c1', to: 'c2', kind: 'spouse' },
        { createdBy: testDID }
      )
      expect(rel.from).toBe('c1')
      expect(rel.to).toBe('c2')
      expect(rel.kind).toBe('spouse')
    })

    it('defaults a product to active and a line item to its deal', () => {
      const product = ProductSchema.create({ name: 'Pro plan' }, { createdBy: testDID })
      expect(product.active).toBe(true)
      const item = LineItemSchema.create({ deal: 'd1', quantity: 2 }, { createdBy: testDID })
      expect(item.deal).toBe('d1')
      expect(item.quantity).toBe(2)
    })
  })
})
