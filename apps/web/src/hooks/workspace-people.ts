/**
 * Pure aggregation behind useWorkspacePeople: collaborators are visible
 * through the data they touch (task assignments, project leads) — there
 * is no member registry in a local-first workspace.
 */
import type { TaskPersonOption } from '@xnetjs/ui'

interface AssignedLike {
  assignee?: unknown
  assignees?: unknown
}

interface LeadLike {
  lead?: unknown
}

function addDid(dids: Set<string>, candidate: unknown): void {
  if (typeof candidate === 'string' && candidate) dids.add(candidate)
}

export function collectWorkspacePeople(
  did: string | null,
  tasks: readonly AssignedLike[],
  projects: readonly LeadLike[]
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

  return [...dids].map((candidate) => ({
    did: candidate,
    ...(candidate === did ? { isSelf: true, name: 'Me' } : {})
  }))
}
