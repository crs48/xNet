/**
 * useWorkspacePeople - best-effort directory of people in this workspace,
 * fed to assignee pickers and @mention menus. Aggregation logic lives in
 * workspace-people.ts (pure, tested).
 */
import type { TaskPersonOption } from '@xnetjs/ui'
import { ProjectSchema, TaskSchema } from '@xnetjs/data'
import { useIdentity, useQuery } from '@xnetjs/react'
import { useMemo } from 'react'
import { collectWorkspacePeople } from './workspace-people'

export function useWorkspacePeople(): TaskPersonOption[] {
  const { did } = useIdentity()
  const { data: tasks } = useQuery(TaskSchema)
  const { data: projects } = useQuery(ProjectSchema)

  return useMemo(() => collectWorkspacePeople(did, tasks, projects), [did, projects, tasks])
}
