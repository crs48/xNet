/**
 * CRM schema pack (exploration 0188) — a native CRM that grows into an ERP.
 *
 * One typed domain model serves the individual (personal contacts + keep-in-touch),
 * the business (a deal pipeline), and — via the shared party/product master and
 * the deferred quote-to-cash document chain — the enterprise.
 *
 * Design decisions, all argued in exploration 0188:
 *   - **Universal party model**: `Organization` (a company) and `Contact` (a
 *     person) are the two party kinds. Both stand alone (personal use) or
 *     interlink (B2B). Deciding this now is what keeps the CRM→ERP transition
 *     from becoming a master-data-management problem later.
 *   - **Lifecycle as a field, not a Lead object** (HubSpot's validated
 *     simplification) — `Contact.lifecycle` replaces the painful lead-conversion
 *     flow.
 *   - **Activity as an append-only, polymorphic timeline**: `contact` is the
 *     *who* (Salesforce `WhoId`) and `about` is the *what* (`WhatId`, an untyped
 *     relation so it can point at a Deal / Organization / Contact). Append-only
 *     keeps it audit-, GDPR-, and CRDT-friendly.
 *   - **Reuse, never fork, the people graph**: `Contact.did` optionally links the
 *     contact's *own* xNet identity, and `Contact.actor` links a
 *     `@xnetjs/social` `SocialActor` for import/dedup — without bloating social.
 *
 * Every entity carries the standard `space` + `visibility` pair and
 * `spaceCascadeAuthorization()`, so a personal CRM is owner-only by default
 * (no Space) while a team CRM inherits access from its Space (exploration 0181).
 */

import type { InferNode } from '../types'
import { defineSchema } from '../define'
import {
  text,
  number,
  checkbox,
  select,
  date,
  email,
  phone,
  url,
  person,
  relation
} from '../properties'
import { spaceCascadeAuthorization } from './space-authorization'

export const CRM_NAMESPACE = 'xnet://xnet.fyi/' as const

// Schema IRIs (versioned, canonical) — exported so callers reference one source.
export const ORGANIZATION_SCHEMA_IRI = 'xnet://xnet.fyi/Organization@1.0.0' as const
export const CONTACT_SCHEMA_IRI = 'xnet://xnet.fyi/Contact@1.0.0' as const
export const RELATIONSHIP_SCHEMA_IRI = 'xnet://xnet.fyi/Relationship@1.0.0' as const
export const PIPELINE_SCHEMA_IRI = 'xnet://xnet.fyi/Pipeline@1.0.0' as const
export const STAGE_SCHEMA_IRI = 'xnet://xnet.fyi/Stage@1.0.0' as const
export const DEAL_SCHEMA_IRI = 'xnet://xnet.fyi/Deal@1.0.0' as const
export const DEAL_CONTACT_ROLE_SCHEMA_IRI = 'xnet://xnet.fyi/DealContactRole@1.0.0' as const
export const ACTIVITY_SCHEMA_IRI = 'xnet://xnet.fyi/Activity@1.0.0' as const
export const PRODUCT_SCHEMA_IRI = 'xnet://xnet.fyi/Product@1.0.0' as const
export const LINE_ITEM_SCHEMA_IRI = 'xnet://xnet.fyi/LineItem@1.0.0' as const

const SPACE_TARGET = 'xnet://xnet.fyi/Space@1.0.0' as const
const TAG_TARGET = 'xnet://xnet.fyi/Tag@1.0.0' as const
const FOLDER_TARGET = 'xnet://xnet.fyi/Folder@1.0.0' as const
/** Ledger transaction — referenced by IRI so `data` keeps no extra dep. */
const TRANSACTION_TARGET = 'xnet://xnet.fyi/Transaction@1.0.0' as const
/** A `@xnetjs/social` actor — referenced as a string IRI so `data` never
 * depends on `social` (social depends on data, not the reverse). */
const SOCIAL_ACTOR_TARGET = 'xnet://xnet.social/SocialActor@1.0.0' as const

/** Shared visibility ladder. `inherit` is the safe default: with no Space it
 * resolves to owner-only (personal/private); inside a Space it defers to the
 * Space's roles (team sharing). Mirrors Task/Milestone. */
const VISIBILITY_OPTIONS = [
  { id: 'inherit', name: 'Inherit', color: 'gray' },
  { id: 'private', name: 'Private', color: 'gray' },
  { id: 'unlisted', name: 'Unlisted', color: 'yellow' },
  { id: 'public', name: 'Public', color: 'green' }
] as const

const visibility = () => select({ options: VISIBILITY_OPTIONS, default: 'inherit' })
const space = () => relation({ target: SPACE_TARGET })
/** Uniform folder filing (exploration 0190) — empty = Unfiled. */
const folder = () => relation({ target: FOLDER_TARGET })

export type CrmVisibility = (typeof VISIBILITY_OPTIONS)[number]['id']

// ---------------------------------------------------------------------------
// Party model: Organization + Contact + Relationship
// ---------------------------------------------------------------------------

export const ORGANIZATION_SIZES = [
  { id: 'solo', name: '1' },
  { id: 'small', name: '2–10' },
  { id: 'medium', name: '11–50' },
  { id: 'large', name: '51–250' },
  { id: 'xlarge', name: '251–1000' },
  { id: 'enterprise', name: '1000+' }
] as const

export type OrganizationSize = (typeof ORGANIZATION_SIZES)[number]['id']

export const OrganizationSchema = defineSchema({
  name: 'Organization',
  namespace: CRM_NAMESPACE,
  properties: {
    /** Company / account name. */
    name: text({ required: true, maxLength: 300 }),
    /** Primary email domain (the natural dedup key for B2B). */
    domain: text({ maxLength: 255 }),
    website: url({}),
    industry: text({ maxLength: 120 }),
    size: select({ options: ORGANIZATION_SIZES }),
    /** Annual revenue, in `currency`. */
    annualRevenue: number({ min: 0 }),
    currency: text({ maxLength: 3 }),
    phone: phone({}),
    street: text({ maxLength: 300 }),
    city: text({ maxLength: 120 }),
    region: text({ maxLength: 120 }),
    postalCode: text({ maxLength: 40 }),
    country: text({ maxLength: 120 }),
    /** Parent company — self-reference for account hierarchies. */
    parent: relation({ target: ORGANIZATION_SCHEMA_IRI }),
    /** Account owner (the rep). */
    owner: person({}),
    /** Optional link to an imported `@xnetjs/social` actor (org kind). */
    actor: relation({ target: SOCIAL_ACTOR_TARGET }),
    tags: relation({ target: TAG_TARGET, multiple: true }),
    /** Erasure-by-design: set when PII is anonymized (GDPR Art. 17). */
    piiErasedAt: date({}),
    folder: folder(),
    space: space(),
    visibility: visibility()
  },
  document: 'yjs', // Collaborative account notes
  authorization: spaceCascadeAuthorization()
})

export type Organization = InferNode<(typeof OrganizationSchema)['_properties']>

/**
 * Contact lifecycle — HubSpot's progression, modeled as a field so there is no
 * separate Lead object and no conversion flow. Personal CRM users simply leave
 * it at `lead` (or ignore it entirely).
 */
export const CONTACT_LIFECYCLE = [
  { id: 'subscriber', name: 'Subscriber', color: 'gray' },
  { id: 'lead', name: 'Lead', color: 'yellow' },
  { id: 'mql', name: 'Marketing Qualified', color: 'blue' },
  { id: 'sql', name: 'Sales Qualified', color: 'purple' },
  { id: 'opportunity', name: 'Opportunity', color: 'orange' },
  { id: 'customer', name: 'Customer', color: 'green' },
  { id: 'evangelist', name: 'Evangelist', color: 'green' },
  { id: 'churned', name: 'Churned', color: 'red' }
] as const

export type ContactLifecycle = (typeof CONTACT_LIFECYCLE)[number]['id']

export const ContactSchema = defineSchema({
  name: 'Contact',
  namespace: CRM_NAMESPACE,
  properties: {
    /** Display name — the one always-required field. */
    displayName: text({ required: true, maxLength: 200 }),
    firstName: text({ maxLength: 100 }),
    lastName: text({ maxLength: 100 }),
    /** Primary email (the natural dedup key for people). */
    email: email({}),
    /** Primary phone. */
    phone: phone({}),
    title: text({ maxLength: 200 }),
    /** Employer / account. */
    org: relation({ target: ORGANIZATION_SCHEMA_IRI }),
    /** The rep who owns this relationship. */
    owner: person({}),
    /**
     * OPTIONAL: the contact's *own* xNet identity (a DID). When set, the
     * contact can control their own half of the record — the user-owned,
     * bilateral-consent differentiator (exploration 0188).
     */
    did: person({}),
    /** Optional link to a `@xnetjs/social` actor for import/dedup. */
    actor: relation({ target: SOCIAL_ACTOR_TARGET }),
    lifecycle: select({ options: CONTACT_LIFECYCLE, default: 'lead' }),
    /** When this contact was last interacted with (drives keep-in-touch). */
    lastTouchAt: date({}),
    /** Next time to reach out — derived from `lastTouchAt` + `touchEveryDays`. */
    nextTouchAt: date({}),
    /** Keep-in-touch cadence, in days (0/empty = no cadence). */
    touchEveryDays: number({ integer: true, min: 0 }),
    /** Personal-CRM context: how the relationship started. */
    howWeMet: text({ maxLength: 2000 }),
    /** The contact who introduced you (the introducer edge). */
    introducedBy: relation({ target: CONTACT_SCHEMA_IRI }),
    tags: relation({ target: TAG_TARGET, multiple: true }),
    piiErasedAt: date({}),
    folder: folder(),
    space: space(),
    visibility: visibility()
  },
  document: 'yjs', // Running notes / journal on the person
  authorization: spaceCascadeAuthorization()
})

export type Contact = InferNode<(typeof ContactSchema)['_properties']>

/** Directed, typed Contact→Contact edge — the personal-CRM relationship graph. */
export const RELATIONSHIP_KINDS = [
  { id: 'spouse', name: 'Spouse' },
  { id: 'partner', name: 'Partner' },
  { id: 'parent', name: 'Parent' },
  { id: 'child', name: 'Child' },
  { id: 'sibling', name: 'Sibling' },
  { id: 'friend', name: 'Friend' },
  { id: 'colleague', name: 'Colleague' },
  { id: 'manager', name: 'Manager' },
  { id: 'reports-to', name: 'Reports to' },
  { id: 'introduced-by', name: 'Introduced by' },
  { id: 'knows', name: 'Knows' }
] as const

export type RelationshipKind = (typeof RELATIONSHIP_KINDS)[number]['id']

export const RelationshipSchema = defineSchema({
  name: 'Relationship',
  namespace: CRM_NAMESPACE,
  properties: {
    from: relation({ target: CONTACT_SCHEMA_IRI, required: true }),
    to: relation({ target: CONTACT_SCHEMA_IRI, required: true }),
    kind: select({ options: RELATIONSHIP_KINDS, default: 'knows' }),
    note: text({ maxLength: 1000 }),
    space: space(),
    visibility: visibility()
  },
  authorization: spaceCascadeAuthorization()
})

export type Relationship = InferNode<(typeof RelationshipSchema)['_properties']>

// ---------------------------------------------------------------------------
// Pipeline: Pipeline + Stage + Deal + DealContactRole
// ---------------------------------------------------------------------------

export const PipelineSchema = defineSchema({
  name: 'Pipeline',
  namespace: CRM_NAMESPACE,
  properties: {
    name: text({ required: true, maxLength: 200 }),
    description: text({ maxLength: 1000 }),
    sortKey: text({ maxLength: 500 }),
    /** Exactly one pipeline should be the default for new deals. */
    isDefault: checkbox({ default: false }),
    space: space(),
    visibility: visibility()
  },
  authorization: spaceCascadeAuthorization()
})

export type Pipeline = InferNode<(typeof PipelineSchema)['_properties']>

export const StageSchema = defineSchema({
  name: 'Stage',
  namespace: CRM_NAMESPACE,
  properties: {
    name: text({ required: true, maxLength: 120 }),
    pipeline: relation({ target: PIPELINE_SCHEMA_IRI, required: true }),
    /** Column order within the pipeline. */
    sortKey: text({ maxLength: 500 }),
    /** Default win probability for deals in this stage, 0–1. */
    probability: number({ min: 0, max: 1 }),
    /** Terminal flags — `isClosed` + `isWon` is the standard termination pair. */
    isClosed: checkbox({ default: false }),
    isWon: checkbox({ default: false }),
    color: text({ maxLength: 32 }),
    space: space(),
    visibility: visibility()
  },
  authorization: spaceCascadeAuthorization()
})

export type Stage = InferNode<(typeof StageSchema)['_properties']>

/** Forecast lanes — the four standard categories reps move deals between. */
export const FORECAST_CATEGORIES = [
  { id: 'pipeline', name: 'Pipeline', color: 'gray' },
  { id: 'best-case', name: 'Best Case', color: 'blue' },
  { id: 'commit', name: 'Commit', color: 'green' },
  { id: 'closed', name: 'Closed', color: 'purple' }
] as const

export type ForecastCategory = (typeof FORECAST_CATEGORIES)[number]['id']

export const DEAL_SOURCES = [
  { id: 'inbound', name: 'Inbound' },
  { id: 'outbound', name: 'Outbound' },
  { id: 'referral', name: 'Referral' },
  { id: 'partner', name: 'Partner' },
  { id: 'event', name: 'Event' },
  { id: 'other', name: 'Other' }
] as const

export type DealSource = (typeof DEAL_SOURCES)[number]['id']

export const DealSchema = defineSchema({
  name: 'Deal',
  namespace: CRM_NAMESPACE,
  properties: {
    title: text({ required: true, maxLength: 300 }),
    /** Account (company) the deal is with. */
    org: relation({ target: ORGANIZATION_SCHEMA_IRI }),
    /** Primary contact (full stakeholder set lives in DealContactRole). */
    primaryContact: relation({ target: CONTACT_SCHEMA_IRI }),
    pipeline: relation({ target: PIPELINE_SCHEMA_IRI }),
    stage: relation({ target: STAGE_SCHEMA_IRI }),
    amount: number({ min: 0 }),
    currency: text({ maxLength: 3 }),
    /** Optional override of the stage's default probability, 0–1. */
    probability: number({ min: 0, max: 1 }),
    closeDate: date({}),
    forecastCategory: select({ options: FORECAST_CATEGORIES, default: 'pipeline' }),
    source: select({ options: DEAL_SOURCES }),
    owner: person({}),
    collaborators: person({ multiple: true }),
    wonAt: date({}),
    lostAt: date({}),
    lostReason: text({ maxLength: 500 }),
    /**
     * Ledger transactions that realize this deal's revenue (quote-to-cash
     * bridge, exploration 0190). A won deal can link the booked income so
     * pipeline and books reconcile.
     */
    transactions: relation({ target: TRANSACTION_TARGET, multiple: true }),
    tags: relation({ target: TAG_TARGET, multiple: true }),
    folder: folder(),
    space: space(),
    visibility: visibility()
  },
  document: 'yjs', // Deal notes
  authorization: spaceCascadeAuthorization()
})

export type Deal = InferNode<(typeof DealSchema)['_properties']>

/** Roles played by contacts on a deal (the M:M stakeholder junction). */
export const DEAL_CONTACT_ROLES = [
  { id: 'decision-maker', name: 'Decision Maker' },
  { id: 'economic-buyer', name: 'Economic Buyer' },
  { id: 'champion', name: 'Champion' },
  { id: 'influencer', name: 'Influencer' },
  { id: 'technical-buyer', name: 'Technical Buyer' },
  { id: 'user', name: 'User' },
  { id: 'evaluator', name: 'Evaluator' },
  { id: 'other', name: 'Other' }
] as const

export type DealContactRoleKind = (typeof DEAL_CONTACT_ROLES)[number]['id']

export const DealContactRoleSchema = defineSchema({
  name: 'DealContactRole',
  namespace: CRM_NAMESPACE,
  properties: {
    deal: relation({ target: DEAL_SCHEMA_IRI, required: true }),
    contact: relation({ target: CONTACT_SCHEMA_IRI, required: true }),
    role: select({ options: DEAL_CONTACT_ROLES, default: 'other' }),
    isPrimary: checkbox({ default: false }),
    space: space(),
    visibility: visibility()
  },
  authorization: spaceCascadeAuthorization()
})

export type DealContactRole = InferNode<(typeof DealContactRoleSchema)['_properties']>

// ---------------------------------------------------------------------------
// Activity: the append-only, polymorphic engagement timeline
// ---------------------------------------------------------------------------

export const ACTIVITY_KINDS = [
  { id: 'note', name: 'Note' },
  { id: 'call', name: 'Call' },
  { id: 'email', name: 'Email' },
  { id: 'meeting', name: 'Meeting' },
  { id: 'task', name: 'Task' }
] as const

export type ActivityKind = (typeof ACTIVITY_KINDS)[number]['id']

export const ActivitySchema = defineSchema({
  name: 'Activity',
  namespace: CRM_NAMESPACE,
  properties: {
    kind: select({ options: ACTIVITY_KINDS, default: 'note' }),
    /** The *who* — Salesforce `WhoId`. */
    contact: relation({ target: CONTACT_SCHEMA_IRI }),
    /** The *what* — Salesforce `WhatId`. Untyped relation so it can point at a
     * Deal, Organization, or Contact (polymorphic). */
    about: relation({}),
    /** One-line summary shown in the timeline. */
    summary: text({ maxLength: 500 }),
    /** Full body — kept separate from the contact FK so erasure can null PII
     * while preserving the activity's existence for audit/aggregates. */
    body: text({ maxLength: 20000 }),
    direction: select({
      options: [
        { id: 'inbound', name: 'Inbound' },
        { id: 'outbound', name: 'Outbound' }
      ] as const
    }),
    occurredAt: date({ includeTime: true }),
    durationSec: number({ integer: true, min: 0 }),
    outcome: text({ maxLength: 300 }),
    /** For task-kind activities: future due date + completion. */
    dueAt: date({}),
    completed: checkbox({ default: false }),
    owner: person({}),
    space: space(),
    visibility: visibility()
  },
  authorization: spaceCascadeAuthorization()
})

export type Activity = InferNode<(typeof ActivitySchema)['_properties']>

// ---------------------------------------------------------------------------
// Catalog seed (the ERP path): Product + LineItem
// ---------------------------------------------------------------------------

export const PRODUCT_KINDS = [
  { id: 'good', name: 'Good' },
  { id: 'service', name: 'Service' },
  { id: 'subscription', name: 'Subscription' }
] as const

export type ProductKind = (typeof PRODUCT_KINDS)[number]['id']

export const ProductSchema = defineSchema({
  name: 'Product',
  namespace: CRM_NAMESPACE,
  properties: {
    name: text({ required: true, maxLength: 300 }),
    /** Stock-keeping unit / product code. */
    sku: text({ maxLength: 120 }),
    description: text({ maxLength: 2000 }),
    kind: select({ options: PRODUCT_KINDS, default: 'service' }),
    unitPrice: number({ min: 0 }),
    currency: text({ maxLength: 3 }),
    active: checkbox({ default: true }),
    space: space(),
    visibility: visibility()
  },
  authorization: spaceCascadeAuthorization()
})

export type Product = InferNode<(typeof ProductSchema)['_properties']>

export const LineItemSchema = defineSchema({
  name: 'LineItem',
  namespace: CRM_NAMESPACE,
  properties: {
    deal: relation({ target: DEAL_SCHEMA_IRI, required: true }),
    product: relation({ target: PRODUCT_SCHEMA_IRI }),
    description: text({ maxLength: 500 }),
    quantity: number({ min: 0 }),
    /** Overrides the product's `unitPrice` when set. */
    unitPrice: number({ min: 0 }),
    /** Discount fraction, 0–1. */
    discount: number({ min: 0, max: 1 }),
    space: space(),
    visibility: visibility()
  },
  authorization: spaceCascadeAuthorization()
})

export type LineItem = InferNode<(typeof LineItemSchema)['_properties']>

/** All CRM schemas, for bulk registration/iteration. */
export const crmSchemas = [
  OrganizationSchema,
  ContactSchema,
  RelationshipSchema,
  PipelineSchema,
  StageSchema,
  DealSchema,
  DealContactRoleSchema,
  ActivitySchema,
  ProductSchema,
  LineItemSchema
] as const
