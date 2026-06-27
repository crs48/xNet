/**
 * Roadmap content for the landing page (rendered by sections/Roadmap.astro).
 *
 * This is marketing's view of project status, kept apart from the markup so
 * promoting an item is a one-line edit. When you ship a user-facing feature,
 * move its item here and bump `updated`. Every "Built" item must map to a
 * merged PR; "Now"/"Next" items should come from real deferred-work lists,
 * not aspirations.
 */

import { testsAcrossPackages } from './siteMetrics'

export interface RoadmapPhase {
  status: 'done' | 'now' | 'next' | 'future' | 'vision'
  label: string
  color: 'emerald' | 'amber' | 'indigo' | 'purple' | 'pink'
  title: string
  description: string
  items: string[]
}

export const updated = 'June 2026'

export const phases: RoadmapPhase[] = [
  {
    status: 'done',
    label: 'Built',
    color: 'emerald',
    title: 'The Foundation',
    description: 'Core primitives for local-first apps — and an app you can live in',
    items: [
      'Hybrid post-quantum crypto (ML-DSA-65, NIST FIPS 204)',
      'Crypto identity (DID:key, Ed25519, UCAN) with passkey sign-in',
      'Schema system with 15 property types',
      'P2P sync engine (Yjs + Lamport clocks)',
      'Encryption-first authorization (roles, grants, key recovery)',
      'Workbench shell — tabs, panels, command palette, zen mode',
      'Documents, databases, infinite canvas & task manager',
      'Dashboards with pluggable, sandboxed widgets & charts',
      'Real-time chat, presence & peer-to-peer calls',
      'Notification inbox with mentions & triage',
      'Agent surface — xnet CLI, SKILL.md, files-first checkout',
      'Hub — encrypted backup, relay & full-text search',
      testsAcrossPackages
    ]
  },
  {
    status: 'now',
    label: 'Now',
    color: 'amber',
    title: 'Daily Driver',
    description: 'Make xNet an app you actually use every day',
    items: [
      'Polished desktop experience',
      'Workspace invites & sharing flows',
      'Sharing UI (useCan / useGrants in app)',
      'Managed hub hosting — xNet Cloud (signup, pricing, connect-your-hub)',
      'Push notification delivery (Web Push, Electron, mobile)',
      'Query API improvements'
    ]
  },
  {
    status: 'next',
    label: 'Next',
    color: 'indigo',
    title: 'Multiplayer at Scale',
    description: 'Bigger teams, bigger calls, more devices',
    items: [
      'Mobile app (Expo)',
      'SFU tier for larger calls',
      'End-to-end encrypted channels',
      'Hub key registry & device directory'
    ]
  },
  {
    status: 'future',
    label: 'Then',
    color: 'purple',
    title: 'Federation',
    description: 'Hubs talk to each other. Data flows freely.',
    items: [
      'Hub-to-hub federation protocol',
      'Federated queries across hubs',
      'Schema registry & discovery',
      'ERP framework & domain modules'
    ]
  },
  {
    status: 'vision',
    label: 'Vision',
    color: 'pink',
    title: 'The Decentralized Data Layer',
    description: 'A global namespace for structured knowledge',
    items: [
      'Global namespace — xnet://*',
      'Decentralized search engine',
      'Social federation (follows, feeds, reputation)',
      'Domain-specific networks (farming, science, education)',
      "Data commons — humanity's shared knowledge graph"
    ]
  }
]
