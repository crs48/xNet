/**
 * 10k-task performance budgets (exploration 0161 validation targets:
 * board group-by-status < 150 ms, palette-style search < 50 ms).
 *
 * These exercise the exact code paths TaskBoard/TaskListGrouped run per
 * render. Browser-level render timing is validated separately; these
 * budgets catch algorithmic regressions in CI.
 */
import { performance } from 'node:perf_hooks'
import { describe, expect, it } from 'vitest'
import { TASK_WORKFLOW_ORDER, groupTasksByStatus, sortTasksBySortKey } from './grouping'

const STATUSES = TASK_WORKFLOW_ORDER

function makeTasks(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `task_${index}`,
    title: `Task ${index} ${index % 7 === 0 ? 'grid polish' : 'misc work'}`,
    completed: index % 5 === 0,
    status: STATUSES[index % STATUSES.length],
    sortKey: String(index % 997).padStart(4, '0')
  }))
}

describe('10k-task perf budgets', () => {
  const tasks = makeTasks(10_000)

  it('groups 10k tasks by status under 150ms', () => {
    // Warm up JIT before timing.
    groupTasksByStatus(tasks, STATUSES)

    const start = performance.now()
    const groups = groupTasksByStatus(tasks, STATUSES)
    const elapsed = performance.now() - start

    expect(groups.reduce((total, group) => total + group.tasks.length, 0)).toBe(10_000)
    console.info(`[perf] groupTasksByStatus(10k): ${elapsed.toFixed(2)}ms`)
    expect(elapsed).toBeLessThan(150)
  })

  it('sorts the largest column under 150ms', () => {
    const groups = groupTasksByStatus(tasks, STATUSES)
    const largest = groups.reduce((a, b) => (a.tasks.length >= b.tasks.length ? a : b))
    sortTasksBySortKey(largest.tasks)

    const start = performance.now()
    sortTasksBySortKey(largest.tasks)
    const elapsed = performance.now() - start

    console.info(`[perf] sortTasksBySortKey(${largest.tasks.length}): ${elapsed.toFixed(2)}ms`)
    expect(elapsed).toBeLessThan(150)
  })

  it('filters 10k task titles (palette search) under 50ms', () => {
    const needle = 'grid polish'
    tasks.filter((task) => task.title.toLowerCase().includes(needle))

    const start = performance.now()
    const matches = tasks.filter((task) => task.title.toLowerCase().includes(needle))
    const elapsed = performance.now() - start

    expect(matches.length).toBeGreaterThan(0)
    console.info(`[perf] title filter(10k): ${elapsed.toFixed(2)}ms`)
    expect(elapsed).toBeLessThan(50)
  })
})
