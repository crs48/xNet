/**
 * Work seeder — Projects, Milestones and Tasks, richly cross-linked: tasks link
 * to project + milestone, carry multiple assignees, and the first task of each
 * project gets SUBTASKS (parent) plus links to its spec Page and a Canvas.
 * Scoped into the Engineering team space and filed under work/engineering.
 */

import type { SeedDoc, SeederModule } from '../types'
import type { DeterministicNodeImportDraft } from '@xnetjs/data'
import { MilestoneSchema, ProjectSchema, TaskSchema } from '@xnetjs/data'
import { milestoneNotesDoc, projectBriefDoc, taskDescriptionDoc } from '../docs/page-builders'
import { pick, PROJECT_NAMES, seedId, TASK_VERBS } from '../seed-ids'
import { pageId } from './docs'
import { canvasId } from './viz'

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
  seed: ({ fixtures, people, scale, rng }) => {
    const drafts: DeterministicNodeImportDraft[] = []
    const docs: SeedDoc[] = []
    const names = PROJECT_NAMES.slice(0, scale.projects)
    const space = fixtures.spaces.engineering
    const folder = fixtures.folder('work/engineering')

    names.forEach((name, pIndex) => {
      const project = projectId(name)
      drafts.push({
        id: project,
        schemaId: ProjectSchema._schemaId,
        properties: {
          name,
          icon: PROJECT_ICONS[pIndex % PROJECT_ICONS.length],
          status: PROJECT_STATUS[pIndex % PROJECT_STATUS.length],
          lead: people[pIndex % people.length].did,
          targetDate: BASE_TS + (pIndex + 4) * 7 * DAY,
          space,
          tags: [fixtures.tag('roadmap'), fixtures.tag('urgent')]
        }
      })
      docs.push({
        nodeId: project,
        build: () => projectBriefDoc(project, ProjectSchema._schemaId, name)
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
      docs.push({
        nodeId: milestone,
        build: () => milestoneNotesDoc(milestone, MilestoneSchema._schemaId, `${name} — v1`)
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
            assignee: people[i % people.length].did,
            assignees: [people[i % people.length].did, people[(i + 1) % people.length].did],
            project,
            milestone,
            folder,
            // First task of each project links to its spec page + a canvas.
            ...(i === 0 ? { page: pageId('spec', name), canvas: canvasId('roadmap') } : {}),
            space,
            tags: [fixtures.tag(i % 2 === 0 ? 'backend' : 'frontend')]
          }
        })
        if (i === 0) {
          docs.push({
            nodeId: taskId(name, 0),
            build: () =>
              taskDescriptionDoc(taskId(name, 0), TaskSchema._schemaId, `${verb} — ${name}`)
          })
        }
      }

      // Subtasks under the first task of each project (parent → self-ref tree).
      const parentTask = taskId(name, 0)
      for (let s = 0; s < 2; s++) {
        drafts.push({
          id: seedId('task', name, 0, 'sub', s),
          schemaId: TaskSchema._schemaId,
          properties: {
            title: `Subtask ${s + 1} — ${name}`,
            status: pick(rng, TASK_STATUS),
            priority: pick(rng, TASK_PRIORITY),
            parent: parentTask,
            project,
            assignee: people[(pIndex + s) % people.length].did,
            space,
            folder,
            tags: [fixtures.tag('backend')]
          }
        })
      }
    })

    return { drafts, docs }
  }
}
