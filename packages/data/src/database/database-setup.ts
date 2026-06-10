/**
 * New-database setup for the V2 node model.
 *
 * Replaces the Y.Doc-based setupNewDatabase (database-doc.ts): a fresh
 * database gets a title field and a default table view as nodes.
 */

import type { FieldNode } from './field-types'
import type { ViewNode } from './view-node-operations'
import type { NodeStore } from '../store/store'
import { createField, getFields } from './field-operations'
import { createView, getViews } from './view-node-operations'

export interface SetupDatabaseResult {
  titleFieldId: string
  defaultViewId: string
}

/**
 * Initialize a freshly created database with its default structure:
 * a "Name" title field and a "Table" view.
 *
 * Idempotent: skips creation when a title field / view already exists
 * (e.g. when two clients race to initialize a synced database).
 */
export async function setupDatabase(
  store: NodeStore,
  databaseId: string
): Promise<SetupDatabaseResult> {
  const [fields, views] = await Promise.all([
    getFields(store, databaseId),
    getViews(store, databaseId)
  ])

  const titleField: FieldNode | undefined = fields.find((f) => f.isTitle)
  let titleFieldId = titleField?.id
  if (!titleFieldId) {
    titleFieldId = await createField(store, {
      databaseId,
      name: 'Name',
      type: 'text',
      isTitle: true,
      width: 240
    })
  }

  const defaultView: ViewNode | undefined = views[0]
  let defaultViewId = defaultView?.id
  if (!defaultViewId) {
    defaultViewId = await createView(store, {
      databaseId,
      name: 'Table',
      type: 'table'
    })
  }

  return { titleFieldId, defaultViewId }
}
