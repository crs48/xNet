import type { DatabaseViewType } from './DatabaseEmbedExtension'
import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DatabaseEmbedNodeView } from './DatabaseEmbedNodeView'

vi.mock('@tiptap/react', () => ({
  NodeViewWrapper: ({ children, ...props }: { children: ReactNode }) => (
    <div data-node-view-wrapper="" {...props}>
      {children}
    </div>
  )
}))

type DatabaseEmbedNodeViewProps = Parameters<typeof DatabaseEmbedNodeView>[0]

type DatabaseEmbedNodeAttrs = {
  databaseId: string | null
  viewType: DatabaseViewType
  viewConfig: Record<string, unknown>
  showTitle: boolean
  maxHeight: number
}

const VIEW_LABELS = ['Table', 'Board', 'List', 'Calendar', 'Gallery', 'Timeline']

function createProps(
  attrs: Partial<DatabaseEmbedNodeAttrs> = {},
  options: Record<string, unknown> = {}
): DatabaseEmbedNodeViewProps {
  return {
    node: {
      attrs: {
        databaseId: 'db-roadmap',
        viewType: 'table',
        viewConfig: {},
        showTitle: false,
        maxHeight: 400,
        ...attrs
      }
    },
    selected: false,
    updateAttributes: vi.fn(),
    extension: {
      options
    }
  } as unknown as DatabaseEmbedNodeViewProps
}

describe('DatabaseEmbedNodeView', () => {
  afterEach(() => {
    cleanup()
  })

  it('exposes every supported database view mode in the picker', () => {
    render(<DatabaseEmbedNodeView {...createProps()} />)

    fireEvent.click(screen.getByLabelText('Change view type'))

    const menu = document.querySelector('[data-database-embed-menu="view-type"]')
    expect(menu).toBeInTheDocument()
    for (const label of VIEW_LABELS) {
      expect(within(menu as HTMLElement).getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  it('updates the embed view type when a picker option is selected', () => {
    const props = createProps()
    render(<DatabaseEmbedNodeView {...props} />)

    fireEvent.click(screen.getByLabelText('Change view type'))
    fireEvent.click(screen.getByRole('button', { name: 'Board' }))

    expect(props.updateAttributes).toHaveBeenCalledWith({ viewType: 'board' })
    expect(document.querySelector('[data-database-embed-menu="view-type"]')).not.toBeInTheDocument()
  })

  it('passes the selected view type and config to the host renderer', () => {
    const renderView = vi.fn(({ viewType }: { viewType: DatabaseViewType }) => (
      <div data-testid="database-renderer">{viewType}</div>
    ))
    const viewConfig = { groupBy: 'status', visibleFields: ['title', 'owner'] }

    render(
      <DatabaseEmbedNodeView
        {...createProps(
          {
            viewType: 'calendar',
            viewConfig
          },
          { renderView }
        )}
      />
    )

    expect(screen.getByTestId('database-renderer')).toHaveTextContent('calendar')
    expect(renderView).toHaveBeenCalledWith({
      databaseId: 'db-roadmap',
      viewType: 'calendar',
      viewConfig
    })
  })
})
