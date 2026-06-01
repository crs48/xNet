import type { SlashCommandItem } from './items'
import { describe, expect, it, vi, beforeEach } from 'vitest'

const suggestionMock = vi.hoisted(() => vi.fn((options: unknown) => ({ options })))
const tippyInstanceMock = vi.hoisted(() => ({
  destroy: vi.fn(),
  hide: vi.fn(),
  setProps: vi.fn()
}))
const tippyMock = vi.hoisted(() => vi.fn(() => [tippyInstanceMock]))
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

vi.mock('tippy.js', () => ({
  default: tippyMock
}))

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
    tippyMock.mockClear()
    tippyInstanceMock.destroy.mockClear()
    tippyInstanceMock.hide.mockClear()
    tippyInstanceMock.setProps.mockClear()
    rendererState.instances.length = 0
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
    expect(tippyMock).toHaveBeenCalledWith(
      'body',
      expect.objectContaining({
        getReferenceClientRect: clientRect,
        interactive: true,
        placement: 'bottom-start',
        showOnCreate: true,
        trigger: 'manual'
      })
    )

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
    expect(tippyInstanceMock.setProps).toHaveBeenCalledWith({
      getReferenceClientRect: clientRect
    })

    const arrowDown = new KeyboardEvent('keydown', { key: 'ArrowDown' })
    expect(menu.onKeyDown({ event: arrowDown })).toBe(true)
    expect(rendererState.instances[0]?.ref.onKeyDown).toHaveBeenCalledWith(arrowDown)

    const escape = new KeyboardEvent('keydown', { key: 'Escape' })
    expect(menu.onKeyDown({ event: escape })).toBe(true)
    expect(tippyInstanceMock.hide).toHaveBeenCalledTimes(1)

    menu.onExit()
    expect(tippyInstanceMock.destroy).toHaveBeenCalledTimes(1)
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
