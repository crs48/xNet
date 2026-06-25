/**
 * Work seeder — Projects, Milestones and Tasks, richly cross-linked. Tasks link
 * to their project + milestone, take deterministic-but-varied status/priority,
 * and (for the first task of each project) link to the seeded spec Page.
 */

import type { SeederModule } from '../types'
import type { DeterministicNodeImportDraft } from '@xnetjs/data'
import { MilestoneSchema, ProjectSchema, TaskSchema } from '@xnetjs/data'
import { pick, PROJECT_NAMES, seedId, TASK_VERBS } from '../seed-ids'
import { pageId } from './docs'
import { tagId } from './spaces'

const PROJECT_STATUS = ['planned', 'in-progress', 'paused', 'completed'] as const
const PROJECT_ICONS = ['🚀', '🛠️', '📱', '💳', '🔎', '✨'] as const
const TASK_STATUS = ['triage', 'backlog', 'todo', 'in-progress', 'in-review', 'done'] as const
const TASK_PRIORITY = ['low', 'medium', 'high', 'urgent'] as const
const MILESTONE_STATUS = ['upcoming', 'active', 'done'] as const

const DAY = 86_400_000
/** Fixed base instant so dates are deterministic (2025-06-15T00:00:00Z). */
const BASE_TS = 1_750_000_000_000

/** Stable project node id (referenced by other seeders). */
export const projectId = (name: string): string => seedId('project', name)
/** Stable task node id (referenced by other seeders). */
export const taskId = (name: string, i: number): string => seedId('task', name, i)

export const workSeeder: SeederModule = {
  domain: 'work',
  label: 'Projects & tasks',
  schemaIds: [ProjectSchema._schemaId, MilestoneSchema._schemaId, TaskSchema._schemaId],
  seed: ({ space, people, scale, rng }) => {
    const drafts: DeterministicNodeImportDraft[] = []
    const names = PROJECT_NAMES.slice(0, scale.projects)

    names.forEach((name, pIndex) => {
      const project = projectId(name)
      drafts.push({
        id: project,
        schemaId: ProjectSchema._schemaId,
        properties: {
          name,
          icon: PROJECT_ICONS[pIndex % PROJECT_ICONS.length],
          status: PROJECT_STATUS[pIndex % PROJECT_STATUS.length],
          lead: pick(rng, people).did,
          targetDate: BASE_TS + (pIndex + 4) * 7 * DAY,
          space,
          tags: [tagId('backend'), tagId('urgent')]
        }
      })

      const milestone = seedId('milestone', name, 'v1')
      drafts.push({
        id: milestone,
        schemaId: MilestoneSchema._schemaId,
        properties: {
          name: `${name} — v1`,
          status: MILESTONE_STATUS[pIndex % MILESTONE_STATUS.length],
          targetDate: BASE_TS + (pIndex + 6) * 7 * DAY,
          project,
          space
        }
      })

      for (let i = 0; i < scale.tasksPerProject; i++) {
        const verb = TASK_VERBS[i % TASK_VERBS.length]
        const status = TASK_STATUS[(pIndex + i) % TASK_STATUS.length]
        drafts.push({
          id: taskId(name, i),
          schemaId: TaskSchema._schemaId,
          properties: {
            title: `${verb} — ${name}`,
            status,
            completed: status === 'done',
            priority: pick(rng, TASK_PRIORITY),
            dueDate: BASE_TS + (i + 1) * 2 * DAY,
            assignee: pick(rng, people).did,
            project,
            milestone,
            // Link the first task of each project to its spec page.
            ...(i === 0 ? { page: pageId('spec', name) } : {}),
            space,
            tags: [tagId(i % 2 === 0 ? 'backend' : 'frontend')]
          }
        })
      }
    })

    return { drafts }
  }
}
