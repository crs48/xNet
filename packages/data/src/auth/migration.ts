import type { Schema } from '../schema/types'
import type { NodeState } from '../store'
import {
  type Recipient,
  type RecipientDependencies,
  computeRecipients,
  hasRecipientsChanged
} from './recipients'

export interface AuthMigrationDependencies extends RecipientDependencies {
  encryptExistingNode: (node: NodeState, schema: Schema) => Promise<void>
  rotateContentKeyForNode: (nodeId: string, recipients: Recipient[]) => Promise<void>
}

export async function handleAuthMigration(
  oldSchema: Schema,
  newSchema: Schema,
  node: NodeState,
  dependencies: AuthMigrationDependencies
): Promise<void> {
  const oldAuth = oldSchema.authorization
  const newAuth = newSchema.authorization

  if (!oldAuth && newAuth) {
    await dependencies.encryptExistingNode(node, newSchema)
    return
  }

  if (oldAuth && !newAuth) {
    console.warn(
      `[xnet:auth] Schema '${newSchema.name}' removed authorization block. ` +
        'Existing nodes remain encrypted until manually migrated.'
    )
    return
  }

  if (!oldAuth || !newAuth) {
    return
  }

  const oldRecipients = await computeRecipients(oldSchema, node, dependencies)
  const newRecipients = await computeRecipients(newSchema, node, dependencies)

  if (!hasRecipientsChanged(oldRecipients, newRecipients)) {
    return
  }

  await dependencies.rotateContentKeyForNode(node.id, newRecipients)
}
