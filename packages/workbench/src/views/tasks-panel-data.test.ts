import { describe, expect, it } from 'vitest'
import {
  compareByUrgency,
  isAssignedTo,
  selectFollowedProjects,
  selectTasksDashboard
} from './tasks-panel-data'

const me = 'did:key:z6Mkme'
const other = 'did:key:z6Mkother'

let nextId = 0
function task(overrides: Record<string, unknown> = {}) {
  nextId += 1
  return {
    id: `task_${nextId}`,
    completed: false,
    status: 'todo',
    priority: 'medium',
    assignees: [me],
    updatedAt: 100,
    ...overrides
  }
}

describe('compareByUrgency', () => {
  it('orders by priority, then due date, then recency', () => {
    const urgent = task({ priority: 'urgent' })
    const dueSoon = task({ priority: 'high', dueDate: 10 })
    const dueLater = task({ priority: 'high', dueDate: 20 })
    const undated = task({ priority: 'high' })
    const fresh = task({ priority: 'low', updatedAt: 200 })
    const stale = task({ priority: 'low', updatedAt: 50 })

    const sorted = [stale, undated, dueLater, fresh, dueSoon, urgent].sort(compareByUrgency)
    expect(sorted).toEqual([urgent, dueSoon, dueLater, undated, fresh, stale])
  })
})

describe('isAssignedTo', () => {
  it('matches the legacy single assignee and the assignees list', () => {
    expect(isAssignedTo(task({ assignees: [], assignee: me }), me)).toBe(true)
    expect(isAssignedTo(task({ assignees: [other, me] }), me)).toBe(true)
    expect(isAssignedTo(task({ assignees: [other] }), me)).toBe(false)
    expect(isAssignedTo(task(), null)).toBe(false)
  })
})

describe('selectTasksDashboard', () => {
  it('buckets pinned, in-flight, and remaining assignments exclusively', () => {
    const pinnedDone = task({ completed: true, status: 'done' })
    const pinnedOther = task({ assignees: [other] })
    const inProgress = task({ status: 'in-progress' })
    const inReview = task({ status: 'in-review' })
    const todo = task({ status: 'todo' })
    const someoneElses = task({ assignees: [other] })
    const finished = task({ completed: true, status: 'done' })

    const selection = selectTasksDashboard(
      [pinnedDone, pinnedOther, inProgress, inReview, todo, someoneElses, finished],
      me,
      [pinnedDone.id, pinnedOther.id]
    )

    expect(selection.pinned.map((t) => t.id).sort()).toEqual([pinnedDone.id, pinnedOther.id].sort())
    expect(selection.inProgress.map((t) => t.id).sort()).toEqual(
      [inProgress.id, inReview.id].sort()
    )
    expect(selection.assigned.map((t) => t.id)).toEqual([todo.id])
  })

  it('sorts each bucket by urgency', () => {
    const low = task({ priority: 'low' })
    const urgent = task({ priority: 'urgent' })
    const selection = selectTasksDashboard([low, urgent], me, [])
    expect(selection.assigned.map((t) => t.priority)).toEqual(['urgent', 'low'])
  })
})

describe('selectFollowedProjects', () => {
  it('follows pinned, led, and my-task projects with open counts', () => {
    const pinnedProject = { id: 'proj_pinned' }
    const ledProject = { id: 'proj_led', lead: me }
    const taskProject = { id: 'proj_tasks' }
    const unrelated = { id: 'proj_unrelated' }

    const tasks = [
      task({ project: taskProject.id }),
      task({ project: taskProject.id, assignees: [other] }),
      task({ project: taskProject.id, completed: true }),
      task({ project: unrelated.id, assignees: [other] })
    ]

    const followed = selectFollowedProjects(
      [pinnedProject, ledProject, taskProject, unrelated],
      tasks,
      me,
      [pinnedProject.id]
    )

    expect(followed.map((f) => f.project.id)).toEqual([
      taskProject.id, // 2 open tasks, sorted first
      pinnedProject.id,
      ledProject.id
    ])
    expect(followed[0]?.openCount).toBe(2)
  })
})
