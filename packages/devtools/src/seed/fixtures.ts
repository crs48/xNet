/**
 * Shared, deterministic workspace fixtures: the Space tree, the nested Folder
 * tree, and the helpers seeders use to cross-link. The `spaces` seeder CREATES
 * these nodes; everything here is pure id derivation so any seeder can reference
 * them without ordering concerns (local writes aren't authz-gated — the hub is
 * the enforcement point).
 */

import type { SeedFixtures } from './types'
import { DEMO_PEOPLE, seedId } from './seed-ids'

/** Org space keeps the original `seed/space/demo` id so prior seeds converge. */
export const ORG_SPACE_ID = seedId('space', 'demo')

export const SPACE_IDS = {
  org: ORG_SPACE_ID,
  engineering: seedId('space', 'demo', 'engineering'),
  design: seedId('space', 'demo', 'design'),
  sales: seedId('space', 'demo', 'sales'),
  personal: seedId('space', 'personal')
} as const

/** The team sub-spaces, declared under the org space. */
export const TEAM_SPACES = [
  { key: 'engineering', id: SPACE_IDS.engineering, name: 'Engineering', icon: '⚙️' },
  { key: 'design', id: SPACE_IDS.design, name: 'Design', icon: '🎨' },
  { key: 'sales', id: SPACE_IDS.sales, name: 'Sales', icon: '💼' }
] as const

/** Folder id for a nested path, e.g. `folderPath('work/engineering')`. */
export const folderPath = (path: string): string => seedId('folder', ...path.split('/'))

/**
 * Nested folder tree (depth ≥3). `parent` is the path of the containing folder.
 * Order matters only for readability — relations are plain ids.
 */
export const FOLDER_TREE: ReadonlyArray<{ path: string; name: string; icon: string }> = [
  { path: 'work', name: 'Work', icon: '💼' },
  { path: 'work/engineering', name: 'Engineering', icon: '⚙️' },
  { path: 'work/engineering/backend', name: 'Backend', icon: '🛠️' },
  { path: 'work/engineering/frontend', name: 'Frontend', icon: '🖥️' },
  { path: 'work/design', name: 'Design', icon: '🎨' },
  { path: 'work/sales', name: 'Sales', icon: '📈' },
  { path: 'personal', name: 'Personal', icon: '🏠' },
  { path: 'personal/finance', name: 'Finance', icon: '💰' },
  { path: 'notes', name: 'Notes', icon: '🗒️' }
]

/** The shared tag palette applied across taggable schemas. */
export const TAG_PALETTE: ReadonlyArray<{ slug: string; name: string; color: string }> = [
  { slug: 'backend', name: 'backend', color: 'blue' },
  { slug: 'frontend', name: 'frontend', color: 'green' },
  { slug: 'urgent', name: 'urgent', color: 'red' },
  { slug: 'design', name: 'design', color: 'purple' },
  { slug: 'docs', name: 'docs', color: 'gray' },
  { slug: 'sales', name: 'sales', color: 'orange' },
  { slug: 'finance', name: 'finance', color: 'yellow' },
  { slug: 'roadmap', name: 'roadmap', color: 'pink' }
]

export const tagId = (slug: string): string => seedId('tag', slug)

/** Build the pure fixture handles passed to every seeder. */
export function buildFixtures(): SeedFixtures {
  return {
    spaces: SPACE_IDS,
    folder: folderPath,
    tag: tagId,
    person: (i: number) =>
      DEMO_PEOPLE[((i % DEMO_PEOPLE.length) + DEMO_PEOPLE.length) % DEMO_PEOPLE.length].did
  }
}
