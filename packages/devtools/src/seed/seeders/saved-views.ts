/**
 * Saved views seeder — the Set primitive, as real content (exploration 0388).
 *
 * `SavedView` was only ever covered by the Tier-2 auto-generator, which the
 * landing demo profile skips (`includeAuto: false`). The result: the Views
 * section of the left nav read "Nothing here yet." in every demo and every
 * fresh workspace — the worst possible first impression of a primitive whose
 * whole point is that you accumulate them.
 *
 * These are ordinary saved queries over already-seeded schemas: descriptors are
 * built with `defineSavedViewDescriptor` so they validate the same way a
 * user-authored view does, and serialized to the `descriptor` text property.
 */

import type { SeederModule } from '../types'
import type { DeterministicNodeImportDraft } from '@xnetjs/data'
import {
  PageSchema,
  SavedViewSchema,
  TaskSchema,
  defineNodeQueryAST,
  defineSavedViewDescriptor
} from '@xnetjs/data'
import { seedId } from '../seed-ids'

export const savedViewId = (slug: string): string => seedId('saved-view', slug)

/**
 * Serialize a saved view exactly as the runtime writes it, so the row is
 * executable rather than merely shaped like a view.
 *
 * The descriptor is built per view rather than mapped over a list of schemas:
 * `defineNodeQueryAST` is generic in the schema's property map, and a
 * heterogeneous array collapses that to a union it can't accept.
 */
const descriptorFor = (title: string, query: ReturnType<typeof defineNodeQueryAST>): string =>
  JSON.stringify(defineSavedViewDescriptor({ title, scope: 'workspace', query }))

const VIEWS = [
  {
    slug: 'my-open-work',
    title: 'My open work',
    description: 'Everything still in flight, newest first.',
    descriptor: () => descriptorFor('My open work', defineNodeQueryAST(TaskSchema))
  },
  {
    slug: 'recently-edited',
    title: 'Recently edited',
    description: 'Pages touched in the last stretch of work.',
    descriptor: () => descriptorFor('Recently edited', defineNodeQueryAST(PageSchema))
  }
] as const

export const savedViewsSeeder: SeederModule = {
  domain: 'saved-views',
  label: 'Saved views',
  schemaIds: [SavedViewSchema._schemaId],
  seed: ({ space }) => {
    const drafts: DeterministicNodeImportDraft[] = VIEWS.map((view) => ({
      id: savedViewId(view.slug),
      schemaId: SavedViewSchema._schemaId,
      properties: {
        title: view.title,
        description: view.description,
        scope: 'workspace',
        descriptor: view.descriptor(),
        space
      }
    }))

    return { drafts }
  }
}
