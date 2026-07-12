/**
 * Derive the hub's grant-action expectations from a schema's authorization
 * block (exploration 0192).
 *
 * The hub enforces access with a grant model whose vocabulary is
 * `read | comment | write | share | admin` (see `spaceRoleGrantActions`). The
 * schema authorization DSL speaks `read | write | delete | share`. These two
 * have historically been maintained by hand in separate places and were free
 * to drift. `schemaToHubPolicy` projects a schema's declared per-action role
 * sets onto the hub vocabulary so the relationship can be asserted in CI
 * (`hub-policy.test.ts`) — the schema authorization block becomes the single
 * declarative source the hub mapping is checked against.
 *
 * Correspondence:
 *   read   → read     write → write     share → share     delete → admin
 *   create → write    update → write
 *
 * `comment` is a hub-only refinement of `read` (a commenter may annotate but
 * not edit). The Space cascade folds commenters into `read` and does not model
 * a distinct `comment` action, so it is intentionally absent here.
 *
 * The schema-side `create`/`update` refinements (exploration 0304) both
 * project onto hub `write` for now — the hub grant model stays coarse; roles
 * that may only add or only modify still need the write relay capability.
 */
import type { Schema } from '../schema/types'
import { deserializeAuthorization } from './serialize'
import { extractRoleRefs, hasPublicAccess } from './validate'

/** Maps a schema authorization action onto the hub grant-action vocabulary. */
const SCHEMA_ACTION_TO_HUB: Readonly<Record<string, string>> = {
  read: 'read',
  create: 'write',
  update: 'write',
  write: 'write',
  share: 'share',
  delete: 'admin'
}

export interface HubPolicy {
  /** For each role declared by the schema, the hub grant actions it implies. */
  roleActions: Record<string, string[]>
  /** True when the schema's `read` action grants PUBLIC. */
  public: boolean
}

/** Project a schema's authorization block onto the hub grant-action model. */
export function schemaToHubPolicy(schema: Schema): HubPolicy {
  if (!schema.authorization) {
    return { roleActions: {}, public: false }
  }

  const auth = deserializeAuthorization(schema.authorization)
  const roleActions: Record<string, Set<string>> = {}
  let isPublic = false

  for (const [action, expr] of Object.entries(auth.actions)) {
    if (!expr) continue
    if (action === 'read' && hasPublicAccess(expr)) {
      isPublic = true
    }
    const hubAction = SCHEMA_ACTION_TO_HUB[action]
    if (!hubAction) continue
    for (const roleName of extractRoleRefs(expr)) {
      const actions = (roleActions[roleName] ??= new Set<string>())
      actions.add(hubAction)
    }
  }

  return {
    roleActions: Object.fromEntries(
      Object.entries(roleActions).map(([role, actions]) => [role, [...actions].sort()])
    ),
    public: isPublic
  }
}

/** Capitalize the first letter — `viewer` → `Viewer`. */
function capitalize(value: string): string {
  return value.length === 0 ? value : `${value[0].toUpperCase()}${value.slice(1)}`
}

/**
 * Hub grant actions a Space *member* with the given Space role inherits on a
 * node governed by the Space cascade, derived purely from the schema. A member
 * with role `R` resolves to the cascade role `spaceR` (e.g. `viewer` →
 * `spaceViewer`), so this looks up that role's projected hub actions.
 *
 * Used by the parity test to prove the cascade and `spaceRoleGrantActions`
 * agree, so neither can change without the other.
 */
export function hubActionsForSpaceRole(schema: Schema, spaceRole: string): string[] {
  const cascadeRole = `space${capitalize(spaceRole)}`
  return schemaToHubPolicy(schema).roleActions[cascadeRole] ?? []
}
