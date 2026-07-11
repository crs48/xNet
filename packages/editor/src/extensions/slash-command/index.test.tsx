import type { SlashCommandItem } from './items'
import { describe, expect, it, vi, beforeEach } from 'vitest'

const suggestionMock = vi.hoisted(() => vi.fn((options: unknown) => ({ options })))
const floatingMock = vi.hoisted(() => ({
  computePosition: vi.fn(() => Promise.resolve({ x: 10, y: 60 })),
  // Real autoUpdate invokes the update callback immediately on setup.
  autoUpdate: vi.fn((_ref: unknown, _el: unknown, update: () => void) => {
    update()
    return vi.fn()
  }),
  offset: vi.fn((value: unknown) => ({ name: 'offset', value })),
  flip: vi.fn((value: unknown) => ({ name: 'flip', value })),
  shift: vi.fn((value: unknown) => ({ name: 'shift', value }))
}))
const rendererState = vi.hoisted(() => ({
  instances: [] as Array<{
    destroy: ReturnType<typeof vi.fn>
    element: HTMLElement
    options: { props: Record<string, unknown> }
    ref: { onKeyDown: ReturnType<typeof vi.fn> }
    updateProps: ReturnType<typeof vi.fn>
  }>
}))

vi.mock('@tiptap/suggestion', () => ({
  default: suggestionMock
}))

vi.mock('@tiptap/react', () => ({
  ReactRenderer: class ReactRendererMock {
    destroy = vi.fn()
    element = document.createElement('div')
    ref = { onKeyDown: vi.fn(() => true) }
    updateProps = vi.fn((props: Record<string, unknown>) => {
      this.options.props = props
    })

    constructor(
      _component: unknown,
      public options: { props: Record<string, unknown> }
    ) {
      rendererState.instances.push(this)
    }
  }
}))

vi.mock('@floating-ui/dom', () => floatingMock)

import { SlashCommand } from './index'

type SuggestionOptions = {
  char: string
  command: (props: { editor: unknown; range: unknown; props: SlashCommandItem }) => void
  items: (props: { query: string }) => SlashCommandItem[]
  render: () => {
    onExit: () => void
    onKeyDown: (props: { event: KeyboardEvent }) => boolean
    onStart: (props: SuggestionRenderProps) => void
    onUpdate: (props: SuggestionRenderProps) => void
  }
}

type SuggestionRenderProps = {
  clientRect?: () => DOMRect
  command: (item: SlashCommandItem) => void
  editor: unknown
  items: SlashCommandItem[]
}

function createCommand(title: string, searchTerms: string[] = []): SlashCommandItem {
  return {
    title,
    description: `${title} description`,
    icon: title[0] ?? '/',
    searchTerms,
    command: vi.fn()
  }
}

function createSuggestionOptions(commands?: SlashCommandItem[]): SuggestionOptions {
  const extension = SlashCommand.configure({ char: '/', commands })
  const context = {
    editor: { isEditable: true },
    options: {
      char: '/',
      commands
    }
  }

  extension.config.addProseMirrorPlugins?.call(context)
  return suggestionMock.mock.calls.at(-1)?.[0] as SuggestionOptions
}

describe('SlashCommand extension', () => {
  beforeEach(() => {
    suggestionMock.mockClear()
    floatingMock.computePosition.mockClear()
    floatingMock.autoUpdate.mockClear()
    rendererState.instances.length = 0
    document.body.innerHTML = ''
  })

  it('registers `/` as the trigger and filters default commands by query', () => {
    const options = createSuggestionOptions()

    expect(options.char).toBe('/')
    expect(options.items({ query: '' }).length).toBeGreaterThan(0)
    expect(
      options.items({ query: 'heading' }).every((item) => item.title.includes('Heading'))
    ).toBe(true)
  })

  it('filters custom command lists by title, description, and search terms', () => {
    const commands = [
      createCommand('Database', ['Table', 'Collection']),
      createCommand('Page', ['document']),
      createCommand('Embed', ['media'])
    ]
    const options = createSuggestionOptions(commands)

    expect(options.items({ query: '' })).toEqual(commands)
    expect(options.items({ query: 'collection' })).toEqual([commands[0]])
    expect(options.items({ query: 'page description' })).toEqual([commands[1]])
    expect(options.items({ query: 'media' })).toEqual([commands[2]])
    expect(options.items({ query: 'missing' })).toEqual([])
  })

  it('opens a rendered slash menu and keeps it updated while filtering', () => {
    const commands = [createCommand('Database'), createCommand('Embed')]
    const options = createSuggestionOptions(commands)
    const menu = options.render()
    const runCommand = vi.fn()
    const clientRect = () => new DOMRect(10, 20, 30, 40)

    menu.onStart({
      clientRect,
      command: runCommand,
      editor: {},
      items: commands
    })

    expect(rendererState.instances).toHaveLength(1)
    expect(rendererState.instances[0]?.options.props.items).toEqual(commands)

    // The popup container is mounted at body level and positioned via
    // Floating UI at the caret rect, tracked across scroll/resize.
    const container = document.body.querySelector('.xnet-suggestion-popup')
    expect(container).not.toBeNull()
    expect(container?.contains(rendererState.instances[0]!.element)).toBe(true)
    expect(floatingMock.autoUpdate).toHaveBeenCalledTimes(1)
    expect(floatingMock.computePosition).toHaveBeenCalledWith(
      expect.objectContaining({ getBoundingClientRect: expect.any(Function) }),
      container,
      expect.objectContaining({ strategy: 'fixed', placement: 'bottom-start' })
    )

    const positionCallsBeforeUpdate = floatingMock.computePosition.mock.calls.length

    menu.onUpdate({
      clientRect,
      command: runCommand,
      editor: {},
      items: [commands[1]]
    })

    expect(rendererState.instances[0]?.updateProps).toHaveBeenCalledWith({
      command: expect.any(Function),
      items: [commands[1]]
    })
    expect(floatingMock.computePosition.mock.calls.length).toBeGreaterThan(
      positionCallsBeforeUpdate
    )

    const arrowDown = new KeyboardEvent('keydown', { key: 'ArrowDown' })
    expect(menu.onKeyDown({ event: arrowDown })).toBe(true)
    expect(rendererState.instances[0]?.ref.onKeyDown).toHaveBeenCalledWith(arrowDown)

    const escape = new KeyboardEvent('keydown', { key: 'Escape' })
    expect(menu.onKeyDown({ event: escape })).toBe(true)
    expect((container as HTMLElement).style.display).toBe('none')

    menu.onExit()
    expect(document.body.querySelector('.xnet-suggestion-popup')).toBeNull()
    expect(rendererState.instances[0]?.destroy).toHaveBeenCalledTimes(1)
  })

  it('runs the selected slash item command with the current editor range', () => {
    const options = createSuggestionOptions()
    const selected = createCommand('Heading 1')
    const editor = { id: 'editor' }
    const range = { from: 1, to: 2 }

    options.command({ editor, range, props: selected })

    expect(selected.command).toHaveBeenCalledWith({ editor, range })
  })
})
