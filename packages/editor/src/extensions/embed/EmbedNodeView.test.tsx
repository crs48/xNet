import type { ReactNode } from 'react'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EmbedNodeView } from './EmbedNodeView'

vi.mock('@tiptap/react', () => ({
  NodeViewWrapper: ({ children, ...props }: { children: ReactNode }) => (
    <div data-node-view-wrapper="" {...props}>
      {children}
    </div>
  )
}))

type EmbedNodeViewProps = Parameters<typeof EmbedNodeView>[0]

type EmbedNodeAttrs = {
  url: string | null
  provider: string | null
  embedUrl: string | null
  title: string | null
  width: number | null
  alignment: 'left' | 'center' | 'right' | null
}

function createProps(attrs: Partial<EmbedNodeAttrs> = {}): EmbedNodeViewProps {
  const editor = {
    chain: vi.fn(() => ({
      focus: vi.fn(() => ({
        deleteRange: vi.fn(() => ({
          insertContent: vi.fn(() => ({
            run: vi.fn()
          }))
        }))
      }))
    }))
  }

  return {
    node: {
      attrs: {
        url: null,
        provider: null,
        embedUrl: null,
        title: null,
        width: 560,
        alignment: 'left',
        ...attrs
      },
      nodeSize: 1
    },
    selected: false,
    updateAttributes: vi.fn(),
    deleteNode: vi.fn(),
    editor,
    getPos: vi.fn(() => 1)
  } as unknown as EmbedNodeViewProps
}

describe('EmbedNodeView', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('labels empty embed controls for screen readers', () => {
    render(<EmbedNodeView {...createProps()} />)

    expect(screen.getByLabelText('Embed URL')).toBeInTheDocument()
    expect(screen.getByLabelText('Create embed')).toBeInTheDocument()
  })

  it.each([
    {
      provider: 'figma',
      url: 'https://www.figma.com/file/abc123/design-spec',
      embedUrl:
        'https://www.figma.com/embed?embed_host=share&url=https%3A%2F%2Fwww.figma.com%2Ffile%2Fabc123%2Fdesign-spec',
      allow: 'fullscreen'
    },
    {
      provider: 'codesandbox',
      url: 'https://codesandbox.io/s/my-sandbox-abc123',
      embedUrl: 'https://codesandbox.io/embed/my-sandbox-abc123',
      allow: 'clipboard-read; clipboard-write; fullscreen'
    },
    {
      provider: 'loom',
      url: 'https://www.loom.com/share/abc123def456',
      embedUrl: 'https://www.loom.com/embed/abc123def456',
      allow: 'autoplay; encrypted-media; fullscreen; picture-in-picture'
    }
  ])(
    'applies shared iframe policy attributes to $provider embeds',
    ({ provider, url, embedUrl, allow }) => {
      const { container } = render(
        <EmbedNodeView
          {...createProps({
            provider,
            url,
            embedUrl
          })}
        />
      )

      const iframe = container.querySelector('iframe')
      expect(iframe).toBeInTheDocument()
      expect(iframe).toHaveAttribute(
        'sandbox',
        'allow-scripts allow-same-origin allow-presentation'
      )
      expect(iframe).toHaveAttribute('allow', allow)
      expect(iframe).toHaveAttribute('referrerpolicy', 'strict-origin-when-cross-origin')
      expect(iframe).toHaveAttribute('loading', 'lazy')
      expect(screen.queryByLabelText('Embed unavailable')).not.toBeInTheDocument()
    }
  )

  it('does not mount heavy iframes until the embed is near the viewport', async () => {
    const observers: MockIntersectionObserver[] = []

    class MockIntersectionObserver implements IntersectionObserver {
      readonly root: Element | Document | null = null
      readonly rootMargin = '600px 0px'
      readonly thresholds = [0.01]
      readonly observe = vi.fn()
      readonly unobserve = vi.fn()
      readonly disconnect = vi.fn()
      readonly takeRecords = vi.fn((): IntersectionObserverEntry[] => [])

      constructor(private readonly callback: IntersectionObserverCallback) {
        observers.push(this)
      }

      trigger(entries: Partial<IntersectionObserverEntry>[]): void {
        this.callback(
          entries.map((entry) => createIntersectionObserverEntry(entry)),
          this
        )
      }
    }

    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)

    const { container } = render(
      <EmbedNodeView
        {...createProps({
          provider: 'youtube',
          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
          title: 'Demo'
        })}
      />
    )

    expect(container.querySelector('iframe')).not.toBeInTheDocument()
    expect(container.querySelector('[data-embed-lazy-placeholder="true"]')).toBeInTheDocument()
    expect(container.querySelector('[data-embed-iframe-mounted="false"]')).toBeInTheDocument()
    expect(observers).toHaveLength(1)

    act(() => {
      observers[0].trigger([{ isIntersecting: true, intersectionRatio: 1 }])
    })

    await waitFor(() => {
      expect(container.querySelector('[data-embed-iframe="true"]')).toBeInTheDocument()
    })
    expect(container.querySelector('[data-embed-iframe-mounted="true"]')).toBeInTheDocument()
    expect(observers[0].disconnect).toHaveBeenCalled()
  })

  it('renders a non-live placeholder for spoofed provider embed URLs', () => {
    const { container } = render(
      <EmbedNodeView
        {...createProps({
          provider: 'youtube',
          url: 'https://youtube.com/watch?v=dQw4w9WgXcQ',
          embedUrl: 'https://evil.example.com/embed/dQw4w9WgXcQ'
        })}
      />
    )

    const placeholder = screen.getByLabelText('Embed unavailable')
    expect(container.querySelector('iframe')).not.toBeInTheDocument()
    expect(placeholder).toHaveAttribute('data-embed-policy', 'blocked')
    expect(placeholder).toHaveAttribute(
      'data-embed-policy-reason',
      "Embed host 'evil.example.com' is not allowed for youtube."
    )
    expect(
      screen.getByText("Embed host 'evil.example.com' is not allowed for youtube.")
    ).toBeInTheDocument()
  })
})

function createIntersectionObserverEntry(
  entry: Partial<IntersectionObserverEntry>
): IntersectionObserverEntry {
  return {
    boundingClientRect: DOMRectReadOnly.fromRect(),
    intersectionRatio: 0,
    intersectionRect: DOMRectReadOnly.fromRect(),
    isIntersecting: false,
    rootBounds: null,
    target: document.createElement('div'),
    time: 0,
    ...entry
  }
}
