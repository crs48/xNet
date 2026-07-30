/**
 * Database seeder — two FULLY-POPULATED Notion-style databases (columns of every
 * type, select options, many rows with real cell values, multiple views), plus a
 * cross-database relation cell (a CRM row references a task row).
 */

import type { SeederModule } from '../types'
import type { DeterministicNodeImportDraft } from '@xnetjs/data'
import { int, pick } from '../seed-ids'
import {
  DATABASE_SCHEMA_IDS,
  databaseDrafts,
  dbFieldId,
  dbRowId,
  type DatabaseSpec,
  type FieldSpec
} from './database-drafts'

const DAY = 86_400_000
const BASE_TS = 1_750_000_000_000
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10)

const TASKS_SLUG = 'tracker'
const CRM_SLUG = 'accounts'

const TASK_FIELDS: FieldSpec[] = [
  { key: 'title', name: 'Task', type: 'text', isTitle: true, width: 260 },
  {
    key: 'status',
    name: 'Status',
    type: 'select',
    options: [
      { key: 'todo', name: 'To Do', color: 'gray' },
      { key: 'doing', name: 'In Progress', color: 'blue' },
      { key: 'done', name: 'Done', color: 'green' }
    ]
  },
  {
    key: 'priority',
    name: 'Priority',
    type: 'select',
    options: [
      { key: 'low', name: 'Low', color: 'gray' },
      { key: 'med', name: 'Medium', color: 'yellow' },
      { key: 'high', name: 'High', color: 'red' }
    ]
  },
  {
    key: 'labels',
    name: 'Labels',
    type: 'multiSelect',
    options: [
      { key: 'bug', name: 'bug', color: 'red' },
      { key: 'feat', name: 'feature', color: 'green' },
      { key: 'chore', name: 'chore', color: 'gray' }
    ]
  },
  { key: 'assignee', name: 'Assignee', type: 'person' },
  { key: 'start', name: 'Start', type: 'date' },
  { key: 'due', name: 'Due', type: 'date' },
  { key: 'span', name: 'Sprint window', type: 'dateRange' },
  { key: 'estimate', name: 'Estimate (h)', type: 'number' },
  {
    key: 'effort2x',
    name: 'Effort ×2',
    type: 'formula',
    config: { expression: `{{${dbFieldId('tracker', 'estimate')}}} * 2`, resultType: 'number' }
  },
  { key: 'done', name: 'Done', type: 'checkbox' },
  { key: 'link', name: 'Link', type: 'url' },
  { key: 'cover', name: 'Cover', type: 'file' },
  { key: 'createdAt', name: 'Created', type: 'created' },
  { key: 'createdBy', name: 'Created by', type: 'createdBy' }
]

const CRM_FIELDS = (tasksDbId: string): FieldSpec[] => [
  { key: 'company', name: 'Company', type: 'text', isTitle: true, width: 220 },
  {
    key: 'stage',
    name: 'Stage',
    type: 'select',
    options: [
      { key: 'lead', name: 'Lead', color: 'gray' },
      { key: 'demo', name: 'Demo', color: 'blue' },
      { key: 'won', name: 'Won', color: 'green' },
      { key: 'lost', name: 'Lost', color: 'red' }
    ]
  },
  { key: 'mrr', name: 'MRR', type: 'number' },
  { key: 'owner', name: 'Owner', type: 'person' },
  { key: 'website', name: 'Website', type: 'url' },
  { key: 'email', name: 'Contact email', type: 'email' },
  { key: 'phone', name: 'Phone', type: 'phone' },
  { key: 'renews', name: 'Renews', type: 'date' },
  { key: 'lat', name: 'lat', type: 'number' },
  { key: 'lng', name: 'lng', type: 'number' },
  // Cross-database relation → a row in the Tasks tracker database.
  {
    key: 'leadTask',
    name: 'Lead task',
    type: 'relation',
    config: { targetDatabase: tasksDbId, allowMultiple: true }
  },
  // Rollup over the relation → count of linked tracker rows.
  {
    key: 'taskCount',
    name: 'Linked tasks',
    type: 'rollup',
    config: {
      relationColumn: dbFieldId('accounts', 'leadTask'),
      targetColumn: dbFieldId('tracker', 'estimate'),
      aggregation: 'count'
    }
  }
]

export const databaseSeeder: SeederModule = {
  domain: 'database',
  label: 'Databases',
  schemaIds: DATABASE_SCHEMA_IDS,
  seed: ({ fixtures, scale, rng }) => {
    const drafts: DeterministicNodeImportDraft[] = []
    const person = (i: number) => fixtures.person(i)

    // ─── Tasks tracker database ──────────────────────────────────────────
    const taskRows = Array.from({ length: scale.dbRows }, (_, i) => {
      const status = pick(rng, ['todo', 'doing', 'done'])
      return {
        title: `Tracker task ${i + 1}`,
        status,
        priority: pick(rng, ['low', 'med', 'high']),
        labels: i % 3 === 0 ? ['bug', 'chore'] : ['feat'],
        assignee: person(i),
        start: iso(BASE_TS + i * DAY),
        due: iso(BASE_TS + (i + 1) * 2 * DAY),
        span: { start: iso(BASE_TS + i * DAY), end: iso(BASE_TS + (i + 3) * DAY) },
        estimate: int(rng, 1, 16),
        done: status === 'done',
        link: 'https://example.com/task/' + (i + 1),
        cover: {
          cid: `bafycover${i}`,
          name: `cover-${i + 1}.png`,
          mimeType: 'image/png',
          size: 50_000 + i * 100
        }
      }
    })
    const tasksSpec: DatabaseSpec = {
      slug: TASKS_SLUG,
      title: 'Tasks Tracker',
      icon: '✅',
      space: fixtures.spaces.engineering,
      folder: fixtures.folder('work/engineering'),
      tags: [fixtures.tag('backend')],
      defaultView: 'board',
      fields: TASK_FIELDS,
      rows: taskRows,
      views: [
        {
          slug: 'table',
          name: 'All tasks',
          type: 'table',
          filters: [{ key: 'status', operator: 'isNotEmpty' }],
          sorts: [{ key: 'due', direction: 'asc' }],
          summaries: { estimate: 'sum', done: 'checked' },
          rowHeight: 'medium'
        },
        {
          slug: 'board',
          name: 'By status',
          type: 'board',
          groupByKey: 'status',
          colorByKey: 'priority'
        },
        { slug: 'list', name: 'List', type: 'list', groupByKey: 'priority' },
        {
          slug: 'gallery',
          name: 'Gallery',
          type: 'gallery',
          coverKey: 'cover',
          cardSize: 'medium'
        },
        { slug: 'cal', name: 'Calendar', type: 'calendar', dateKey: 'due' },
        {
          slug: 'timeline',
          name: 'Timeline',
          type: 'timeline',
          dateKey: 'start',
          endDateKey: 'due'
        },
        // Form view (exploration 0278): request intake with a show-if rule.
        {
          slug: 'intake',
          name: 'Intake',
          type: 'form',
          form: {
            title: 'Task intake',
            description: 'Request work from the engineering tracker.',
            submitLabel: 'Request',
            confirmation: { title: 'Request received', body: 'We triage intake every morning.' },
            questions: [
              { key: 'title', label: 'What do you need?', required: true },
              { key: 'priority', label: 'How urgent is it?' },
              { key: 'due', label: 'Deadline', description: 'Only if urgent' },
              { key: 'link', label: 'Related link' }
            ],
            rules: {
              due: { whenKey: 'priority', operator: 'equals', value: 'high' }
            }
          }
        }
      ]
    }
    const tasksDbId = `seed/database/${TASKS_SLUG}`
    drafts.push(...databaseDrafts(tasksSpec))

    // Two tracker rows arrived through the intake form: stamp submission
    // provenance so the demo shows what a drained public submission looks like.
    const intakeViewId = 'seed/dbview/tracker/intake'
    for (const formRowIndex of [0, 1]) {
      const rowDraft = drafts.find((d) => d.id === dbRowId(TASKS_SLUG, formRowIndex))
      if (rowDraft) {
        rowDraft.properties.submissionMeta = {
          via: 'form',
          viewId: intakeViewId,
          nonce: `seed-nonce-${formRowIndex}`,
          submittedAt: BASE_TS + formRowIndex * DAY
        }
      }
    }

    // ─── CRM accounts database (relates to tracker rows) ─────────────────
    const crmRows = Array.from({ length: Math.max(3, Math.floor(scale.dbRows / 2)) }, (_, i) => {
      const stage = pick(rng, ['lead', 'demo', 'won', 'lost'])
      return {
        company: `Account ${String.fromCharCode(65 + (i % 26))}${i + 1}`,
        stage,
        mrr: int(rng, 1, 50) * 100,
        owner: person(i + 1),
        website: 'https://account' + (i + 1) + '.example.com',
        email: `hello@account${i + 1}.example.com`,
        phone: '+1 (555) 0' + String(100 + i),
        renews: iso(BASE_TS + (i + 30) * DAY),
        // HQ coordinates spread across a plausible lat/lng band (map view)
        lat: Number((25 + ((i * 7) % 40) + (i % 3) * 0.37).toFixed(4)),
        lng: Number((-120 + ((i * 23) % 140) + (i % 5) * 0.51).toFixed(4)),
        // Relation cell → a real tracker row id.
        leadTask: [dbRowId(TASKS_SLUG, i % scale.dbRows)]
      }
    })
    drafts.push(
      ...databaseDrafts({
        slug: CRM_SLUG,
        title: 'CRM Accounts',
        icon: '🏢',
        space: fixtures.spaces.sales,
        folder: fixtures.folder('work/sales'),
        tags: [fixtures.tag('sales')],
        fields: CRM_FIELDS(tasksDbId),
        rows: crmRows,
        views: [
          { slug: 'table', name: 'All accounts', type: 'table' },
          { slug: 'board', name: 'By stage', type: 'board', groupByKey: 'stage' },
          { slug: 'map', name: 'Map', type: 'map', latKey: 'lat', lngKey: 'lng' }
        ]
      })
    )

    return { drafts }
  }
}
