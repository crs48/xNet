/**
 * useWorkspacePeople - best-effort directory of people in this workspace,
 * fed to assignee pickers and @mention menus. Aggregation logic lives in
 * workspace-people.ts (pure, tested).
 */
import type { TaskPersonOption } from '@xnetjs/ui'
import { ProjectSchema, TaskSchema } from '@xnetjs/data'
import { useIdentity, useQuery } from '@xnetjs/react'
import { useMemo } from 'react'
import { useProfiles } from '../comms/hooks'
import { collectWorkspacePeople } from './workspace-people'

export function useWorkspacePeople(): TaskPersonOption[] {
  const { did } = useIdentity()
  const { data: tasks } = useQuery(TaskSchema)
  const { data: projects } = useQuery(ProjectSchema)
  const profiles = useProfiles()

  return useMemo(
    () => collectWorkspacePeople(did, tasks, projects, profiles),
    [did, projects, tasks, profiles]
  )
}
