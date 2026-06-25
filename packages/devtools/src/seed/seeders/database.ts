/**
 * Database seeder — Notion-style Database nodes. The v2 column/row internals live
 * inside the node's Yjs doc; here we create the Database nodes themselves (the
 * DatabaseField / DatabaseView / DatabaseRow schemas get representative coverage
 * from the Tier-2 auto-generator).
 */

import { DatabaseSchema } from '@xnetjs/data'
import type { DeterministicNodeImportDraft } from '@xnetjs/data'
import type { SeederModule } from '../types'
import { seedId } from '../seed-ids'
import { folderId, tagId } from './spaces'

export const databaseId = (slug: string): string => seedId('database', slug)

const DATABASES = [
  { slug: 'projects', title: 'Projects Tracker', icon: '📁', defaultView: 'board' },
  { slug: 'tasks', title: 'Tasks Board', icon: '✅', defaultView: 'table' }
] as const

export const databaseSeeder: SeederModule = {
  domain: 'database',
  label: 'Databases',
  schemaIds: [DatabaseSchema._schemaId],
  seed: ({ space }) => {
    const drafts: DeterministicNodeImportDraft[] = DATABASES.map((d) => ({
      id: databaseId(d.slug),
      schemaId: DatabaseSchema._schemaId,
      properties: {
        title: d.title,
        icon: d.icon,
        defaultView: d.defaultView,
        space,
        folder: folderId('work'),
        tags: [tagId('backend')]
      }
    }))

    return { drafts }
  }
}
