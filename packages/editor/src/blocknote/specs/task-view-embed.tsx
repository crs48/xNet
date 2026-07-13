/**
 * Task view embed block — an embedded task collection (list/board),
 * host-rendered via renderTaskView. Replaces TaskViewEmbedExtension.
 */
import { createReactBlockSpec } from '@blocknote/react'
import * as React from 'react'
import { useEditorHost, type TaskViewConfig, type TaskViewEmbedType } from '../host-context'

/** config travels as a JSON string (BlockNote props are scalars only). */
export function parseTaskViewConfig(raw: string): TaskViewConfig {
  const fallback: TaskViewConfig = { scope: 'page' }
  if (!raw) return fallback
  try {
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null && 'scope' in parsed
      ? (parsed as TaskViewConfig)
      : fallback
  } catch {
    return fallback
  }
}

function TaskViewEmbedCard({
  viewType,
  config
}: {
  viewType: string
  config: string
}): React.JSX.Element {
  const host = useEditorHost()
  const viewConfig = React.useMemo(() => parseTaskViewConfig(config), [config])
  const kind: TaskViewEmbedType = viewType === 'board' ? 'board' : 'list'

  return (
    <div data-task-view-embed={kind} className="xnet-task-view-embed">
      {host.renderTaskView ? (
        host.renderTaskView({
          viewType: kind,
          viewConfig,
          currentPageId: host.taskViewPageId
        })
      ) : (
        <div className="xnet-task-view-embed-placeholder">Task view</div>
      )}
    </div>
  )
}

export const TaskViewEmbedBlockSpec = createReactBlockSpec(
  {
    type: 'taskViewEmbed',
    propSchema: {
      viewType: { default: 'list' },
      config: { default: '' }
    },
    content: 'none'
  },
  {
    render: ({ block }) => (
      <TaskViewEmbedCard viewType={block.props.viewType} config={block.props.config} />
    )
  }
)
