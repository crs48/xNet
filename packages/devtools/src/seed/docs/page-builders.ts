/**
 * Domain narrative builders — rich `.document` content for non-Page nodes that
 * carry a Yjs document (Task description, Project brief, Milestone notes, CRM
 * Organization/Contact/Deal notes, Experiment protocol). All reuse the Page
 * block vocabulary so the same editor renders them.
 */

import type { SchemaIRI } from '@xnetjs/data'
import type * as Y from 'yjs'
import { buildRichPageDoc } from './rich-pages'

export function taskDescriptionDoc(id: string, schemaId: SchemaIRI, title: string): Y.Doc {
  return buildRichPageDoc(id, schemaId, title, '✅', [
    { kind: 'p', text: `Context and scope for **${title}**.` },
    { kind: 'h', level: 3, text: 'Acceptance criteria' },
    {
      kind: 'tasks',
      items: [
        { text: 'Implementation complete', checked: true },
        { text: 'Unit tests added', checked: false },
        { text: 'Reviewed + merged', checked: false }
      ]
    },
    { kind: 'callout', type: 'tip', text: 'See the linked spec page for full requirements.' }
  ])
}

export function projectBriefDoc(id: string, schemaId: SchemaIRI, name: string): Y.Doc {
  return buildRichPageDoc(id, schemaId, name, '🚀', [
    { kind: 'h', level: 1, text: `${name} — Brief` },
    { kind: 'p', text: `One-line: ship ${name} with confidence.` },
    { kind: 'h', level: 2, text: 'Goals' },
    { kind: 'bullets', items: ['Define the MVP', 'Hit the launch date', 'Keep quality high'] },
    { kind: 'h', level: 2, text: 'Tech stack' },
    { kind: 'code', lang: 'json', text: '{\n  "runtime": "local-first",\n  "sync": "crdt"\n}' },
    { kind: 'callout', type: 'info', text: 'Owner: Engineering. Status: in progress.' }
  ])
}

export function milestoneNotesDoc(id: string, schemaId: SchemaIRI, name: string): Y.Doc {
  return buildRichPageDoc(id, schemaId, name, '🏁', [
    { kind: 'h', level: 2, text: `${name} — Deliverables` },
    { kind: 'bullets', items: ['Spec signed off', 'Implementation merged', 'Docs updated'] },
    { kind: 'quote', text: 'Target date is firm; scope is flexible.' }
  ])
}

export function accountNotesDoc(id: string, schemaId: SchemaIRI, name: string): Y.Doc {
  return buildRichPageDoc(id, schemaId, name, '🏢', [
    { kind: 'h', level: 2, text: `${name} — Account notes` },
    { kind: 'p', text: 'Background: mid-market SaaS, growing fast.' },
    { kind: 'callout', type: 'note', text: 'Champion is the VP of Engineering.' },
    { kind: 'bullets', items: ['Renewal in Q3', 'Expansion opportunity: analytics add-on'] }
  ])
}

export function contactNotesDoc(id: string, schemaId: SchemaIRI, name: string): Y.Doc {
  return buildRichPageDoc(id, schemaId, name, '👤', [
    { kind: 'h', level: 2, text: `${name} — Notes` },
    { kind: 'p', text: 'How we met: introduced at a conference.' },
    { kind: 'bullets', items: ['Prefers email', 'Interested in performance', 'Decision maker'] }
  ])
}

export function dealNotesDoc(id: string, schemaId: SchemaIRI, name: string): Y.Doc {
  return buildRichPageDoc(id, schemaId, name, '💰', [
    { kind: 'h', level: 2, text: `${name} — Deal notes` },
    { kind: 'callout', type: 'warning', text: 'Competitor is also in the evaluation.' },
    { kind: 'h', level: 3, text: 'Pain points' },
    { kind: 'bullets', items: ['Current tool is slow', 'Needs better collaboration'] },
    {
      kind: 'tasks',
      items: [
        { text: 'Send proposal', checked: true },
        { text: 'Schedule demo', checked: false }
      ]
    }
  ])
}

export function experimentProtocolDoc(id: string, schemaId: SchemaIRI, title: string): Y.Doc {
  return buildRichPageDoc(id, schemaId, title, '🧪', [
    { kind: 'h', level: 1, text: `${title} — Protocol` },
    { kind: 'callout', type: 'info', text: 'Design: AB (baseline → intervention).' },
    { kind: 'h', level: 2, text: 'Hypothesis' },
    { kind: 'p', text: 'The intervention reduces p95 latency without regressions.' },
    { kind: 'h', level: 2, text: 'Method' },
    {
      kind: 'tasks',
      items: [
        { text: 'Collect baseline (2 weeks)', checked: true },
        { text: 'Apply intervention', checked: false },
        { text: 'Analyze + conclude', checked: false }
      ]
    },
    { kind: 'mermaid', code: 'graph LR; Baseline --> Intervention --> Analysis;' }
  ])
}

/** All builders, for tests/iteration. */
export const PAGE_BUILDERS = {
  taskDescriptionDoc,
  projectBriefDoc,
  milestoneNotesDoc,
  accountNotesDoc,
  contactNotesDoc,
  dealNotesDoc,
  experimentProtocolDoc
} as const
