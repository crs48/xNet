/**
 * Shared authorization blocks for the Space cascade (exploration 0181).
 *
 * A Space is the people-container / security boundary; Pages, Projects, Tasks,
 * Milestones, etc. are work-content that *inherit* their access from the Space
 * they live in. The cascade is expressed declaratively with the built-in
 * authorization DSL — the OpenFGA/SpiceDB `relation = own ∪ relation-from-parent`
 * idiom — so it is honored by every engine that reads the schema (the P2P
 * `YjsAuthGate` evaluator and the E2E `computeRecipients` path).
 *
 * - `spaceOwnAuthorization()` — for the Space node itself. Members resolve from
 *   `SpaceMembership` edges via `role.members`, which walks the Space's `parent`
 *   chain so an org member inherits access to every nested team/project.
 * - `spaceCascadeAuthorization()` — for content. Each rung is inherited from the
 *   content's `space` relation via `role.relation`, so the content's roles are
 *   exactly the Space's resolved roles.
 * - `spaceContributorAuthorization()` — for author-owned content (chat
 *   messages, comments): members may *add*, but only the author (or space
 *   admins) may *modify*, via the create/update refinements (exploration 0304).
 *
 * The role ladder is kept local here to avoid an import cycle with `space.ts`;
 * it mirrors `SPACE_ROLES` (least → most privileged).
 */

import type { AuthorizationDefinition } from '../../auth'
import { allow, role } from '../../auth'
import { SPACE_MEMBERSHIP_SCHEMA_IRI } from './space-membership'

/** Mirrors `SPACE_ROLES` — least → most privileged. */
const ROLE_ORDER = ['viewer', 'commenter', 'member', 'admin', 'owner'] as const

const membersAtLeast = (minRole: (typeof ROLE_ORDER)[number]) =>
  role.members({
    edgeSchema: SPACE_MEMBERSHIP_SCHEMA_IRI,
    containerProp: 'space',
    memberProp: 'member',
    roleProp: 'role',
    minRole,
    roleOrder: ROLE_ORDER,
    parentProp: 'parent'
  })

/**
 * Authorization for the Space node itself. `owners` get manager (admin-level)
 * rights; everyone else resolves through membership edges, cascading down the
 * `parent` chain.
 */
export function spaceOwnAuthorization(): AuthorizationDefinition {
  return {
    roles: {
      owner: role.creator(),
      spaceManager: role.property('owners'),
      spaceOwner: membersAtLeast('owner'),
      spaceAdmin: membersAtLeast('admin'),
      spaceMember: membersAtLeast('member'),
      spaceCommenter: membersAtLeast('commenter'),
      spaceViewer: membersAtLeast('viewer')
    },
    actions: {
      // commenters/viewers fold into read; write needs member+; manage needs admin+
      read: allow(
        'owner',
        'spaceManager',
        'spaceOwner',
        'spaceAdmin',
        'spaceMember',
        'spaceCommenter',
        'spaceViewer'
      ),
      write: allow('owner', 'spaceManager', 'spaceOwner', 'spaceAdmin', 'spaceMember'),
      delete: allow('owner', 'spaceManager', 'spaceOwner', 'spaceAdmin'),
      share: allow('owner', 'spaceManager', 'spaceOwner', 'spaceAdmin'),
      admin: allow('owner', 'spaceManager', 'spaceOwner', 'spaceAdmin')
    }
  }
}

/**
 * Authorization for content that lives inside a Space. The creator is `owner`;
 * every other role is inherited from the content's `space` relation, so the
 * content's effective access is exactly its Space's (most-permissive across the
 * nesting). Content with no `space` set resolves to owner-only (private).
 *
 * @param relationName - the relation that points at the home Space (default `space`).
 */
export function spaceCascadeAuthorization(relationName = 'space'): AuthorizationDefinition {
  return {
    roles: {
      owner: role.creator(),
      spaceOwner: role.relation(relationName, 'spaceOwner'),
      spaceAdmin: role.relation(relationName, 'spaceAdmin'),
      spaceMember: role.relation(relationName, 'spaceMember'),
      spaceCommenter: role.relation(relationName, 'spaceCommenter'),
      spaceViewer: role.relation(relationName, 'spaceViewer')
    },
    actions: {
      read: allow(
        'owner',
        'spaceOwner',
        'spaceAdmin',
        'spaceMember',
        'spaceCommenter',
        'spaceViewer'
      ),
      write: allow('owner', 'spaceOwner', 'spaceAdmin', 'spaceMember'),
      delete: allow('owner', 'spaceOwner', 'spaceAdmin'),
      share: allow('owner', 'spaceOwner', 'spaceAdmin')
    }
  }
}

/**
 * Authorization for **author-owned** content inside a Space — chat messages,
 * comments, and anything else with "anyone here may post; only the author may
 * edit" semantics (exploration 0304).
 *
 * Same role ladder as `spaceCascadeAuthorization`, but the mutation policy is
 * split with the create/update refinements:
 *
 * - `create` — members and up may add new nodes. Create checks evaluate
 *   against the draft node, whose `relationName` relation resolves the space
 *   membership, so this genuinely gates admission into the Space. The creator
 *   role is deliberately absent: on a draft it always matches (createdBy is
 *   the caller), so including it would make creation self-authorized and the
 *   admission gate vacuous.
 * - `update` — only the author and space admins may modify an existing node.
 * - `write` stays declared as the coarse fallback so legacy engines that
 *   don't know the refinements keep today's member-editable behavior instead
 *   of failing closed.
 *
 * @param relationName - the relation that points at the home Space (default `space`).
 */
export function spaceContributorAuthorization(relationName = 'space'): AuthorizationDefinition {
  const cascade = spaceCascadeAuthorization(relationName)
  return {
    ...cascade,
    actions: {
      ...cascade.actions,
      create: allow('spaceOwner', 'spaceAdmin', 'spaceMember'),
      update: allow('owner', 'spaceOwner', 'spaceAdmin')
    }
  }
}
