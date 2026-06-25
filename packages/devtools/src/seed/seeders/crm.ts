/**
 * CRM seeder — a deep, interrelated sales graph:
 * Pipeline → Stages; Organizations → Contacts; Deals → (Stage, Org, primary
 * Contact, Products via LineItems); DealContactRole junctions (Deal↔Contact);
 * Activities (→ Contact, → about Deal); Relationships (Contact↔Contact).
 * Scoped to the Sales space, tagged, and filed under work/sales.
 */

import type { SeedDoc, SeederModule } from '../types'
import type { DeterministicNodeImportDraft } from '@xnetjs/data'
import {
  ActivitySchema,
  ContactSchema,
  DealContactRoleSchema,
  DealSchema,
  LineItemSchema,
  OrganizationSchema,
  PipelineSchema,
  ProductSchema,
  RelationshipSchema,
  StageSchema
} from '@xnetjs/data'
import { accountNotesDoc, contactNotesDoc, dealNotesDoc } from '../docs/page-builders'
import { int, pick, seedId } from '../seed-ids'

const DAY = 86_400_000
const BASE_TS = 1_750_000_000_000

const PIPELINE_ID = seedId('pipeline', 'sales')
export const crmDealId = (i: number): string => seedId('deal', i)
const orgId = (i: number) => seedId('org', i)
const contactId = (o: number, c: number) => seedId('contact', o, c)
const productId = (slug: string) => seedId('product', slug)
const stageId = (slug: string) => seedId('stage', slug)

const STAGES = [
  { slug: 'lead', name: 'Lead', probability: 0.1 },
  { slug: 'qualified', name: 'Qualified', probability: 0.3 },
  { slug: 'demo', name: 'Demo', probability: 0.5 },
  { slug: 'proposal', name: 'Proposal', probability: 0.7 },
  { slug: 'won', name: 'Won', probability: 1, isClosed: true, isWon: true },
  { slug: 'lost', name: 'Lost', probability: 0, isClosed: true }
] as const

const PRODUCTS = [
  { slug: 'pro', name: 'Pro Plan', kind: 'subscription', price: 4900 },
  { slug: 'onboard', name: 'Onboarding', kind: 'service', price: 150000 },
  { slug: 'addon', name: 'Analytics Add-on', kind: 'subscription', price: 9900 }
] as const

const COMPANY_NAMES = [
  'Globex',
  'Initech',
  'Umbrella',
  'Soylent',
  'Hooli',
  'Vehement',
  'Massive Dynamic',
  'Stark Industries',
  'Wayne Enterprises',
  'Cyberdyne',
  'Tyrell',
  'Wonka'
]

export const crmSeeder: SeederModule = {
  domain: 'crm',
  label: 'CRM (orgs, deals, contacts)',
  schemaIds: [
    PipelineSchema._schemaId,
    StageSchema._schemaId,
    OrganizationSchema._schemaId,
    ContactSchema._schemaId,
    DealSchema._schemaId,
    DealContactRoleSchema._schemaId,
    LineItemSchema._schemaId,
    ProductSchema._schemaId,
    ActivitySchema._schemaId,
    RelationshipSchema._schemaId
  ],
  seed: ({ fixtures, scale, rng }) => {
    const drafts: DeterministicNodeImportDraft[] = []
    const docs: SeedDoc[] = []
    const space = fixtures.spaces.sales
    const folder = fixtures.folder('work/sales')
    const salesTag = [fixtures.tag('sales')]

    // ─── Pipeline + stages ───────────────────────────────────────────────
    drafts.push({
      id: PIPELINE_ID,
      schemaId: PipelineSchema._schemaId,
      properties: {
        name: 'Sales Pipeline',
        description: 'Inbound + outbound',
        isDefault: true,
        space
      }
    })
    STAGES.forEach((stage, i) => {
      drafts.push({
        id: stageId(stage.slug),
        schemaId: StageSchema._schemaId,
        properties: {
          name: stage.name,
          pipeline: PIPELINE_ID,
          sortKey: `a${i}`,
          probability: stage.probability,
          isClosed: 'isClosed' in stage ? stage.isClosed : false,
          isWon: 'isWon' in stage ? stage.isWon : false,
          space
        }
      })
    })

    // ─── Products ────────────────────────────────────────────────────────
    for (const p of PRODUCTS) {
      drafts.push({
        id: productId(p.slug),
        schemaId: ProductSchema._schemaId,
        properties: {
          name: p.name,
          kind: p.kind,
          unitPrice: p.price,
          currency: 'USD',
          active: true,
          space
        }
      })
    }

    // ─── Organizations → Contacts ────────────────────────────────────────
    const allContacts: string[] = []
    for (let o = 0; o < scale.orgs; o++) {
      drafts.push({
        id: orgId(o),
        schemaId: OrganizationSchema._schemaId,
        properties: {
          name: COMPANY_NAMES[o % COMPANY_NAMES.length],
          domain: `${COMPANY_NAMES[o % COMPANY_NAMES.length].toLowerCase().replace(/[^a-z]/g, '')}.com`,
          website: `https://${COMPANY_NAMES[o % COMPANY_NAMES.length].toLowerCase().replace(/[^a-z]/g, '')}.com`,
          industry: pick(rng, ['SaaS', 'Fintech', 'Healthcare', 'Retail', 'Gaming']),
          size: pick(rng, ['small', 'medium', 'large', 'enterprise']),
          city: pick(rng, ['SF', 'NYC', 'Austin', 'London', 'Berlin']),
          country: 'US',
          space,
          folder,
          tags: salesTag
        }
      })
      for (let c = 0; c < scale.contactsPerOrg; c++) {
        const id = contactId(o, c)
        allContacts.push(id)
        drafts.push({
          id,
          schemaId: ContactSchema._schemaId,
          properties: {
            displayName: `${pick(rng, ['Sam', 'Robin', 'Alex', 'Jordan', 'Casey', 'Riley'])} ${pick(rng, ['Lee', 'Kim', 'Patel', 'Garcia', 'Stone'])}`,
            email: `contact${o}-${c}@example.com`,
            title: pick(rng, ['CEO', 'CTO', 'VP Eng', 'Procurement', 'PM']),
            org: orgId(o),
            lifecycle: pick(rng, ['lead', 'mql', 'sql', 'opportunity', 'customer']),
            space,
            folder,
            tags: salesTag
          }
        })
      }
    }

    // ─── Contact↔Contact relationships ───────────────────────────────────
    for (let i = 0; i + 1 < allContacts.length; i += Math.max(1, scale.contactsPerOrg)) {
      drafts.push({
        id: seedId('relationship', i),
        schemaId: RelationshipSchema._schemaId,
        properties: {
          from: allContacts[i],
          to: allContacts[i + 1],
          kind: pick(rng, ['colleague', 'introduced-by', 'knows']),
          space
        }
      })
    }

    // ─── Deals → stage/org/contact + line items + roles + activities ─────
    for (let d = 0; d < scale.deals; d++) {
      const o = d % scale.orgs
      const stage = STAGES[d % STAGES.length]
      const primaryContact = contactId(o, 0)
      const dealId = crmDealId(d)
      drafts.push({
        id: dealId,
        schemaId: DealSchema._schemaId,
        properties: {
          title: `${COMPANY_NAMES[o % COMPANY_NAMES.length]} — ${pick(rng, PRODUCTS).name}`,
          org: orgId(o),
          primaryContact,
          pipeline: PIPELINE_ID,
          stage: stageId(stage.slug),
          amount: int(rng, 5, 200) * 100,
          currency: 'USD',
          probability: stage.probability,
          closeDate: BASE_TS + (d + 10) * DAY,
          forecastCategory: pick(rng, ['pipeline', 'best-case', 'commit']),
          source: pick(rng, ['inbound', 'outbound', 'referral', 'partner', 'event']),
          space,
          folder,
          tags: salesTag
        }
      })

      // Line items → products
      const lineCount = int(rng, 1, 2)
      for (let li = 0; li < lineCount; li++) {
        const product = pick(rng, PRODUCTS)
        drafts.push({
          id: seedId('lineitem', d, li),
          schemaId: LineItemSchema._schemaId,
          properties: {
            deal: dealId,
            product: productId(product.slug),
            description: product.name,
            quantity: int(rng, 1, 10),
            unitPrice: product.price,
            space
          }
        })
      }

      // Deal↔Contact junction roles
      const roles = ['champion', 'decision-maker', 'economic-buyer'] as const
      for (let c = 0; c < Math.min(scale.contactsPerOrg, 2); c++) {
        drafts.push({
          id: seedId('dealrole', d, c),
          schemaId: DealContactRoleSchema._schemaId,
          properties: {
            deal: dealId,
            contact: contactId(o, c),
            role: roles[c % roles.length],
            isPrimary: c === 0,
            space
          }
        })
      }

      // Activities → contact, about the deal
      for (let a = 0; a < 2; a++) {
        drafts.push({
          id: seedId('activity', d, a),
          schemaId: ActivitySchema._schemaId,
          properties: {
            kind: pick(rng, ['call', 'email', 'meeting', 'note']),
            contact: primaryContact,
            about: dealId,
            summary: pick(rng, ['Intro call', 'Sent proposal', 'Follow-up', 'Demo scheduled']),
            direction: pick(rng, ['inbound', 'outbound']),
            occurredAt: BASE_TS - (a + 1) * DAY,
            completed: true,
            space
          }
        })
      }
    }

    // Rich `.document` notes on the first org / contact / deal.
    docs.push({
      nodeId: orgId(0),
      build: () => accountNotesDoc(orgId(0), OrganizationSchema._schemaId, 'Account')
    })
    docs.push({
      nodeId: contactId(0, 0),
      build: () => contactNotesDoc(contactId(0, 0), ContactSchema._schemaId, 'Contact')
    })
    docs.push({
      nodeId: crmDealId(0),
      build: () => dealNotesDoc(crmDealId(0), DealSchema._schemaId, 'Deal')
    })

    return { drafts, docs }
  }
}
