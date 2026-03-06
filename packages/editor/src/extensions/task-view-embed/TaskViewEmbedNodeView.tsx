import type {
  TaskViewEmbedOptions,
  TaskViewConfig,
  TaskViewDueDateFilter,
  TaskViewScope,
  TaskViewStatusFilter,
  TaskViewAssigneeFilter
} from './TaskViewEmbedExtension'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import * as React from 'react'
import { cn } from '../../utils'

const SCOPE_OPTIONS: Array<{ value: TaskViewScope; label: string }> = [
  { value: 'current-page', label: 'This page' },
  { value: 'all', label: 'All tasks' }
]

const ASSIGNEE_OPTIONS: Array<{ value: TaskViewAssigneeFilter; label: string }> = [
  { value: 'any', label: 'Anyone' },
  { value: 'me', label: 'Assigned to me' }
]

const STATUS_OPTIONS: Array<{ value: TaskViewStatusFilter; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'all', label: 'All statuses' },
  { value: 'done', label: 'Done' }
]

const DUE_DATE_OPTIONS: Array<{ value: TaskViewDueDateFilter; label: string }> = [
  { value: 'any', label: 'Any due date' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Due today' },
  { value: 'next-7-days', label: 'Next 7 days' },
  { value: 'none', label: 'No due date' }
]

function getConfig(node: NodeViewProps['node']): TaskViewConfig {
  const raw = node.attrs.viewConfig as Partial<TaskViewConfig> | undefined
  return {
    scope: raw?.scope === 'all' ? 'all' : 'current-page',
    assignee: raw?.assignee === 'me' ? 'me' : 'any',
    dueDate:
      raw?.dueDate === 'overdue' ||
      raw?.dueDate === 'today' ||
      raw?.dueDate === 'next-7-days' ||
      raw?.dueDate === 'none'
        ? raw.dueDate
        : 'any',
    status: raw?.status === 'all' || raw?.status === 'done' ? raw.status : 'open',
    showHierarchy: raw?.showHierarchy !== false
  }
}

function FilterSelect<T extends string>({
  ariaLabel,
  value,
  options,
  onChange
}: {
  ariaLabel: string
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
}): React.JSX.Element {
  return (
    <label className="text-[11px] text-gray-500 dark:text-gray-400">
      <span className="sr-only">{ariaLabel}</span>
      <select
        aria-label={ariaLabel}
        className={cn(
          'rounded border px-2 py-1 text-[11px]',
          'border-gray-200 bg-white text-gray-700',
          'dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'
        )}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function TaskViewEmbedNodeView({
  node,
  selected,
  updateAttributes,
  extension
}: NodeViewProps): React.JSX.Element {
  const { viewType, showTitle, maxHeight } = node.attrs
  const viewConfig = getConfig(node)
  const options = extension.options as TaskViewEmbedOptions

  const updateViewConfig = React.useCallback(
    (patch: Partial<TaskViewConfig>) => {
      updateAttributes({
        viewConfig: {
          ...viewConfig,
          ...patch
        }
      })
    },
    [updateAttributes, viewConfig]
  )

  return (
    <NodeViewWrapper>
      <div
        className={cn(
          'my-3 overflow-hidden rounded-xl border bg-white dark:bg-gray-950',
          'border-gray-200 dark:border-gray-800',
          selected && 'ring-2 ring-blue-500 ring-offset-2'
        )}
        data-drag-handle
      >
        <div
          className={cn(
            'flex flex-wrap items-center justify-between gap-3 px-4 py-3',
            'border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900'
          )}
        >
          <div className="flex items-center gap-2">
            {showTitle && (
              <div className="text-sm font-medium text-gray-700 dark:text-gray-200">Task View</div>
            )}
            <span className="rounded-full bg-white px-2 py-0.5 text-[11px] text-gray-500 ring-1 ring-gray-200 dark:bg-gray-950 dark:text-gray-400 dark:ring-gray-800">
              {viewType}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <FilterSelect
              ariaLabel="Task scope"
              value={viewConfig.scope}
              options={SCOPE_OPTIONS}
              onChange={(scope) => updateViewConfig({ scope })}
            />
            <FilterSelect
              ariaLabel="Task assignee filter"
              value={viewConfig.assignee}
              options={ASSIGNEE_OPTIONS}
              onChange={(assignee) => updateViewConfig({ assignee })}
            />
            <FilterSelect
              ariaLabel="Task status filter"
              value={viewConfig.status}
              options={STATUS_OPTIONS}
              onChange={(status) => updateViewConfig({ status })}
            />
            <FilterSelect
              ariaLabel="Task due date filter"
              value={viewConfig.dueDate}
              options={DUE_DATE_OPTIONS}
              onChange={(dueDate) => updateViewConfig({ dueDate })}
            />
            <button
              type="button"
              className={cn(
                'rounded border px-2 py-1 text-[11px] transition-colors',
                viewConfig.showHierarchy
                  ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/60 dark:text-blue-300'
                  : 'border-gray-200 bg-white text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400'
              )}
              onClick={() => updateViewConfig({ showHierarchy: !viewConfig.showHierarchy })}
            >
              {viewConfig.showHierarchy ? 'Nested' : 'Flat'}
            </button>
          </div>
        </div>

        <div className="overflow-auto" style={{ maxHeight: maxHeight || 360 }}>
          {options.renderView ? (
            options.renderView({
              viewType: viewType as 'list',
              viewConfig
            })
          ) : (
            <div className="p-6 text-sm text-gray-500 dark:text-gray-400">
              Connect a task view renderer to display embedded task results.
            </div>
          )}
        </div>
      </div>
    </NodeViewWrapper>
  )
}
