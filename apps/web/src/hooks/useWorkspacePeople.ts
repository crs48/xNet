/**
 * useWorkspacePeople - best-effort directory of people in this workspace.
 *
 * There is no member registry in a local-first workspace; collaborators
 * are visible through the data they touch. We aggregate DIDs from task
 * assignments and project leads, with the local identity always first,
 * and feed the result to assignee pickers and @mention menus.
 */
import type { TaskPersonOption } from '@xnetjs/ui'
import { ProjectSchema, TaskSchema } from '@xnetjs/data'
import { useIdentity, useQuery } from '@xnetjs/react'
import { useMemo } from 'react'

export function useWorkspacePeople(): TaskPersonOption[] {
  const { did } = useIdentity()
  const { data: tasks } = useQuery(TaskSchema)
  const { data: projects } = useQuery(ProjectSchema)

  return useMemo(() => {
    const dids = new Set<string>()
    if (did) dids.add(did)

    for (const task of tasks) {
      if (typeof task.assignee === 'string' && task.assignee) dids.add(task.assignee)
      if (Array.isArray(task.assignees)) {
        for (const assignee of task.assignees) dids.add(String(assignee))
      }
    }
    for (const project of projects) {
      if (typeof project.lead === 'string' && project.lead) dids.add(project.lead)
    }

    return [...dids].map((candidate) => ({
      did: candidate,
      ...(candidate === did ? { isSelf: true, name: 'Me' } : {})
    }))
  }, [did, projects, tasks])
}
