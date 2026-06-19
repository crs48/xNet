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
    anchor: '[data-coach="rail.crm"]',
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
  }
]

contributeTips(CORE_TIPS)
