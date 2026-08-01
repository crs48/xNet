/**
 * Core seed coachmarks (exploration 0206).
 *
 * Registered at module load — the way `registerBuiltinPanelViews()` seeds the
 * panel registry. Each tip points at a stable Rail anchor (`data-coach="…"`)
 * and shows the first time the user lands on the matching view. Features and
 * bundled plugins add their own tips by calling `contributeTips()` elsewhere;
 * the engine never changes.
 *
 * Keep these few, short, and lovely. Bump a tip's `@n` to re-surface it once
 * after a copy change.
 */
import { contributeTips, type CoachTip } from './registry'

const CORE_TIPS: CoachTip[] = [
  {
    id: 'home:command-palette@1',
    view: 'home',
    anchor: '[data-coach="rail.search"]',
    title: 'Find or do anything',
    body: 'Press ⌘K to jump to any doc, person, or command — your fastest way around xNet.',
    side: 'right'
  },
  {
    id: 'crm:overview@1',
    view: 'crm',
    // `rail.people`, not `rail.crm`: the unified nav (0353) is the default
    // path and names this section `people`. The legacy surface id `crm` only
    // renders when tabs are on, so anchoring there hid the tip from almost
    // everyone (0428).
    anchor: '[data-coach="rail.people"]',
    title: 'Your CRM',
    body: 'Contacts, deals, and organizations live here. Drag a deal between lanes to update its stage.',
    side: 'right'
  },
  {
    id: 'tasks:overview@1',
    view: 'tasks',
    anchor: '[data-coach="rail.tasks"]',
    title: 'Track your work',
    body: 'Group, filter, and peek at tasks. Press Space on any task to open it in a slide-over.',
    side: 'right'
  },
  {
    id: 'discover:overview@1',
    view: 'discover',
    anchor: '[data-coach="rail.discover"]',
    title: 'Find your people',
    body: 'Discover others who share your interests. You stay invisible until you opt in.',
    side: 'right'
  },
  // The three unsignposted route surfaces (0428). The exploration named
  // canvas, database and dashboard — none of those is a rail surface, so none
  // has an anchor to point at, and a tip with no anchor renders nothing at
  // all. These are the three a first-time visitor arrives at cold and that the
  // rail can anchor today.
  {
    id: 'finance:overview@1',
    view: 'finance',
    anchor: '[data-coach="rail.finance"]',
    title: 'Money, in your own store',
    body: 'Accounts and transactions are nodes like anything else — query them, or drop one on a canvas.',
    side: 'right'
  },
  {
    id: 'analytics:overview@1',
    view: 'analytics',
    anchor: '[data-coach="rail.analytics"]',
    title: 'Charts over your own data',
    body: 'Every chart reads the local store directly. Nothing is precomputed, so nothing goes stale.',
    side: 'right'
  },
  {
    id: 'meetings:overview@1',
    view: 'meetings',
    anchor: '[data-coach="rail.meetings"]',
    title: 'Meetings stay on your device',
    body: 'Recording and transcription run locally. Audio never leaves unless you send it somewhere.',
    side: 'right'
  }
]

contributeTips(CORE_TIPS)
