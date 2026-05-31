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
  onNavigate = vi.fn()
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

  it('does not navigate without a page id', () => {
    const onNavigate = vi.fn()

    render(<PageEmbedNodeView {...createProps({ pageId: null }, onNavigate)} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open Roadmap' }))

    expect(onNavigate).not.toHaveBeenCalled()
  })
})
