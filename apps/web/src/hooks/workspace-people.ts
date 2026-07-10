/**
 * Pure aggregation behind useWorkspacePeople: collaborators are visible
 * through the data they touch (task assignments, project leads) — there
 * is no member registry in a local-first workspace. Display metadata
 * (name, @handle) resolves through Profile nodes when present (0172).
 */
import type { TaskPersonOption } from '@xnetjs/ui'

interface AssignedLike {
  assignee?: unknown
  assignees?: unknown
}

interface LeadLike {
  lead?: unknown
}

interface ProfileLike {
  did: string
  name?: string
  handle?: string
}

function addDid(dids: Set<string>, candidate: unknown): void {
  if (typeof candidate === 'string' && candidate) dids.add(candidate)
}

export function collectWorkspacePeople(
  did: string | null,
  tasks: readonly AssignedLike[],
  projects: readonly LeadLike[],
  profiles: readonly ProfileLike[] = []
): TaskPersonOption[] {
  const dids = new Set<string>()
  if (did) dids.add(did)

  for (const task of tasks) {
    addDid(dids, task.assignee)
    if (Array.isArray(task.assignees)) {
      for (const assignee of task.assignees) addDid(dids, String(assignee))
    }
  }
  for (const project of projects) {
    addDid(dids, project.lead)
  }
  // People with a profile are part of the workspace directory even before
  // they touch a task or project.
  for (const profile of profiles) {
    addDid(dids, profile.did)
  }

  const profileByDid = new Map(profiles.map((profile) => [profile.did, profile]))
  return [...dids].map((candidate) => {
    const profile = profileByDid.get(candidate)
    return {
      did: candidate,
      ...(profile?.name ? { name: profile.name } : {}),
      ...(profile?.handle ? { handle: profile.handle } : {}),
      ...(candidate === did ? { isSelf: true, ...(profile?.name ? {} : { name: 'Me' }) } : {})
    }
  })
}
