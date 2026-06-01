import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PageEmbedNodeView } from './PageEmbedNodeView'

vi.mock('@tiptap/react', () => ({
  NodeViewWrapper: ({ children, ...props }: { children: ReactNode }) => (
    <div data-node-view-wrapper="" {...props}>
      {children}
    </div>
  )
}))

type PageEmbedNodeViewProps = Parameters<typeof PageEmbedNodeView>[0]

type PageEmbedNodeAttrs = {
  pageId: string | null
  title: string | null
  subtitle: string | null
  icon: string | null
  preview: string | null
}

function createProps(
  attrs: Partial<PageEmbedNodeAttrs> = {},
  onNavigate = vi.fn(),
  updateAttributes = vi.fn()
): PageEmbedNodeViewProps {
  return {
    node: {
      attrs: {
        pageId: 'default/roadmap',
        title: 'Roadmap',
        subtitle: 'Embedded page',
        icon: 'RD',
        preview: 'Launch milestones',
        ...attrs
      }
    },
    selected: false,
    updateAttributes,
    extension: {
      options: { onNavigate }
    }
  } as unknown as PageEmbedNodeViewProps
}

describe('PageEmbedNodeView', () => {
  afterEach(() => {
    cleanup()
  })

  it('navigates to the embedded page from the open control', () => {
    const onNavigate = vi.fn()

    render(<PageEmbedNodeView {...createProps({}, onNavigate)} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open Roadmap' }))

    expect(onNavigate).toHaveBeenCalledWith('default/roadmap')
  })

  it('navigates to the embedded page on double click', () => {
    const onNavigate = vi.fn()
    const { container } = render(<PageEmbedNodeView {...createProps({}, onNavigate)} />)

    fireEvent.doubleClick(container.querySelector('[data-page-embed-card=""]') as HTMLElement)

    expect(onNavigate).toHaveBeenCalledWith('default/roadmap')
  })

  it('shows an inline setup card when no page id exists', () => {
    const onNavigate = vi.fn()
    const updateAttributes = vi.fn()

    render(
      <PageEmbedNodeView
        {...createProps({ pageId: null, title: null }, onNavigate, updateAttributes)}
      />
    )

    expect(screen.getByTestId('page-embed-setup')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Open/i })).not.toBeInTheDocument()

    fireEvent.change(screen.getByRole('textbox', { name: 'Page title or ID' }), {
      target: { value: 'Launch Plan' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    expect(onNavigate).not.toHaveBeenCalled()
    expect(updateAttributes).toHaveBeenCalledWith({
      pageId: 'default/launch-plan',
      title: 'Launch Plan',
      subtitle: 'Embedded page',
      icon: 'LP'
    })
  })

  it('keeps the page setup card open until a title or ID is entered', () => {
    const updateAttributes = vi.fn()

    render(
      <PageEmbedNodeView
        {...createProps({ pageId: null, title: null }, vi.fn(), updateAttributes)}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    expect(updateAttributes).not.toHaveBeenCalled()
    expect(screen.getByText('Enter a page title or ID')).toBeInTheDocument()
  })
})
