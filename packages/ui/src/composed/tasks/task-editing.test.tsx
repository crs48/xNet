import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { MentionTextInput, findActiveMention, interpretMentionKey } from './MentionTextInput'
import { filterTaskPeople, taskPersonLabel } from './people'
import { TaskDetailForm } from './TaskDetailForm'

const people = [
  { did: 'did:key:z6MkaliceXXXXXXXX', name: 'Alice' },
  { did: 'did:key:z6MkbobYYYYYYYYYY', name: 'Bob' },
  { did: 'did:key:z6MkselfZZZZZZZZZ', isSelf: true }
]

const baseTask = {
  id: 'task_1',
  title: 'Ship inline editing',
  completed: false,
  status: 'todo',
  priority: 'medium',
  dueDate: null,
  assignees: [] as string[],
  shortId: 'XN-7'
}

describe('people helpers', () => {
  it('labels people by name, falling back to a shortened DID', () => {
    expect(taskPersonLabel(people[0]!)).toBe('Alice')
    expect(taskPersonLabel({ did: 'did:key:z6MkselfZZZZZZZZZ' })).toBe('z6MkselfZZ…')
  })

  it('filters by name or DID and sorts self first', () => {
    expect(filterTaskPeople(people, 'ali').map((p) => p.name)).toEqual(['Alice'])
    expect(filterTaskPeople(people, 'z6Mkbob')[0]?.name).toBe('Bob')
    expect(filterTaskPeople(people, '')[0]?.isSelf).toBe(true)
  })

  it('matches the @handle even when it shares nothing with the name (0172)', () => {
    const withHandles = [
      { did: 'did:key:z6MkadaWWWWWWWWWW', name: 'Alice Lovelace', handle: 'ada' },
      ...people
    ]
    expect(filterTaskPeople(withHandles, 'ada').map((p) => p.handle)).toEqual(['ada'])
    expect(filterTaskPeople(withHandles, 'AD')[0]?.name).toBe('Alice Lovelace')
  })
})

describe('findActiveMention', () => {
  it('finds the @token containing the caret', () => {
    expect(findActiveMention('hello @al', 9)).toEqual({ start: 6, query: 'al' })
    expect(findActiveMention('@al', 3)).toEqual({ start: 0, query: 'al' })
  })

  it('ignores email-like text and tokens behind whitespace', () => {
    expect(findActiveMention('mail me a@b', 11)).toBeNull()
    expect(findActiveMention('hello @al done', 14)).toBeNull()
  })
})

describe('interpretMentionKey', () => {
  it('routes menu navigation while the menu is open', () => {
    expect(interpretMentionKey('ArrowDown', true, true)).toBe('menu-next')
    expect(interpretMentionKey('ArrowUp', true, true)).toBe('menu-prev')
    expect(interpretMentionKey('Enter', true, true)).toBe('menu-select')
    expect(interpretMentionKey('Tab', true, true)).toBe('menu-select')
    expect(interpretMentionKey('Escape', true, true)).toBe('menu-close')
  })

  it('falls back to submit/cancel when the menu is closed or empty', () => {
    expect(interpretMentionKey('Enter', false, false)).toBe('submit')
    expect(interpretMentionKey('Enter', true, false)).toBe('submit')
    expect(interpretMentionKey('Escape', false, false)).toBe('cancel')
    expect(interpretMentionKey('a', true, true)).toBeNull()
  })
})

function MentionHarness({ onMention }: { onMention: (did: string) => void }) {
  const [value, setValue] = React.useState('Fix sync ')
  return (
    <MentionTextInput
      value={value}
      onChange={setValue}
      people={people}
      onMention={onMention}
      data-testid="mention-input"
    />
  )
}

describe('MentionTextInput', () => {
  it('opens the menu on @, assigns on selection, and strips the token', () => {
    const onMention = vi.fn()
    render(<MentionHarness onMention={onMention} />)

    const input = screen.getByTestId('mention-input') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Fix sync @ali' } })

    expect(screen.getByTestId('mention-menu')).toBeTruthy()
    fireEvent.click(screen.getByText('Alice'))

    expect(onMention).toHaveBeenCalledWith('did:key:z6MkaliceXXXXXXXX')
    expect(input.value).toBe('Fix sync ')
  })

  it('submits on Enter when the menu is closed', () => {
    const onSubmit = vi.fn()
    render(
      <MentionTextInput
        value="A task"
        onChange={() => {}}
        people={people}
        onSubmit={onSubmit}
        data-testid="mention-input"
      />
    )

    fireEvent.keyDown(screen.getByTestId('mention-input'), { key: 'Enter' })
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
})

const tagOptions = [
  { id: 'tag_urgent', name: 'urgent' },
  { id: 'tag_design', name: 'design' }
]

function MultiTriggerHarness({
  onTag,
  onCreateTag,
  onDueDate
}: {
  onTag?: (id: string) => void
  onCreateTag?: (name: string) => void
  onDueDate?: (ms: number) => void
}) {
  const [value, setValue] = React.useState('')
  return (
    <MentionTextInput
      value={value}
      onChange={setValue}
      people={people}
      onMention={() => {}}
      tags={tagOptions}
      onTag={onTag}
      onCreateTag={onCreateTag}
      onDueDate={onDueDate}
      data-testid="mt"
    />
  )
}

describe('MentionTextInput multi-trigger', () => {
  it('adds an existing tag on #, stripping the token', () => {
    const onTag = vi.fn()
    render(<MultiTriggerHarness onTag={onTag} />)
    const input = screen.getByTestId('mt') as HTMLInputElement

    fireEvent.change(input, { target: { value: 'Fix #urg' } })
    expect(screen.getByText('urgent')).toBeTruthy()
    fireEvent.click(screen.getByText('urgent'))

    expect(onTag).toHaveBeenCalledWith('tag_urgent')
    expect(input.value).toBe('Fix ')
  })

  it('offers to create an unknown tag on #', () => {
    const onCreateTag = vi.fn()
    render(<MultiTriggerHarness onCreateTag={onCreateTag} />)
    const input = screen.getByTestId('mt') as HTMLInputElement

    fireEvent.change(input, { target: { value: 'Plan #roadmap' } })
    fireEvent.click(screen.getByText(/Create/))

    expect(onCreateTag).toHaveBeenCalledWith('roadmap')
    expect(input.value).toBe('Plan ')
  })

  it('suggests and commits a trailing due date, stripping the phrase', () => {
    const onDueDate = vi.fn()
    render(<MultiTriggerHarness onDueDate={onDueDate} />)
    const input = screen.getByTestId('mt') as HTMLInputElement

    fireEvent.change(input, { target: { value: 'Plan trip 2026-07-01' } })
    expect(screen.getByTestId('due-suggestion')).toBeTruthy()
    fireEvent.click(screen.getByTestId('due-suggestion'))

    expect(onDueDate).toHaveBeenCalledWith(Date.UTC(2026, 6, 1))
    expect(input.value).toBe('Plan trip')
  })

  it('does not suggest a date for an ordinary title', () => {
    render(<MultiTriggerHarness onDueDate={vi.fn()} />)
    const input = screen.getByTestId('mt') as HTMLInputElement

    fireEvent.change(input, { target: { value: 'Write the design doc' } })
    expect(screen.queryByTestId('due-suggestion')).toBeNull()
  })
})

describe('TaskDetailForm', () => {
  it('commits a changed title on blur', () => {
    const onTitleChange = vi.fn()
    render(<TaskDetailForm task={baseTask} people={people} onTitleChange={onTitleChange} />)

    const input = screen.getByTestId('task-title-input')
    fireEvent.change(input, { target: { value: 'Ship inline editing v2' } })
    fireEvent.blur(input)

    expect(onTitleChange).toHaveBeenCalledWith('task_1', 'Ship inline editing v2')
  })

  it('changes status with derived completion', () => {
    const onStatusChange = vi.fn()
    render(<TaskDetailForm task={baseTask} onStatusChange={onStatusChange} />)

    fireEvent.click(screen.getByTestId('task-status-chip'))
    fireEvent.click(screen.getByText('Done'))

    expect(onStatusChange).toHaveBeenCalledWith('task_1', 'done', true)
  })

  it('sets a due date from the date input', () => {
    const onDueDateChange = vi.fn()
    render(<TaskDetailForm task={baseTask} onDueDateChange={onDueDateChange} />)

    fireEvent.click(screen.getByTestId('task-due-chip'))
    fireEvent.change(screen.getByTestId('task-due-input'), { target: { value: '2026-07-01' } })

    expect(onDueDateChange).toHaveBeenCalledWith('task_1', Date.UTC(2026, 6, 1))
  })

  it('sets a due date by typing a natural-language phrase', () => {
    const onDueDateChange = vi.fn()
    render(<TaskDetailForm task={baseTask} onDueDateChange={onDueDateChange} />)

    fireEvent.click(screen.getByTestId('task-due-chip'))
    const nl = screen.getByTestId('task-due-nl-input')
    // Explicit date keeps the assertion independent of the wall clock.
    fireEvent.change(nl, { target: { value: '2026-07-01' } })
    expect(screen.getByTestId('task-due-nl-preview').textContent).toContain('Jul 1')
    fireEvent.keyDown(nl, { key: 'Enter' })

    expect(onDueDateChange).toHaveBeenCalledWith('task_1', Date.UTC(2026, 6, 1))
  })

  it('shows no commit for an unrecognized date phrase', () => {
    const onDueDateChange = vi.fn()
    render(<TaskDetailForm task={baseTask} onDueDateChange={onDueDateChange} />)

    fireEvent.click(screen.getByTestId('task-due-chip'))
    const nl = screen.getByTestId('task-due-nl-input')
    fireEvent.change(nl, { target: { value: 'not a date' } })
    expect(screen.getByTestId('task-due-nl-preview').textContent).toContain('Not a recognizable')
    fireEvent.keyDown(nl, { key: 'Enter' })

    expect(onDueDateChange).not.toHaveBeenCalled()
  })

  it('adds and removes assignees through the picker', () => {
    const onAssigneesChange = vi.fn()
    const assigned = { ...baseTask, assignees: ['did:key:z6MkbobYYYYYYYYYY'] }
    render(<TaskDetailForm task={assigned} people={people} onAssigneesChange={onAssigneesChange} />)

    fireEvent.click(screen.getByTestId('task-assign-chip'))
    fireEvent.click(screen.getByText('Alice'))
    expect(onAssigneesChange).toHaveBeenCalledWith('task_1', [
      'did:key:z6MkbobYYYYYYYYYY',
      'did:key:z6MkaliceXXXXXXXX'
    ])

    fireEvent.click(screen.getByLabelText('Remove assignee Bob'))
    expect(onAssigneesChange).toHaveBeenLastCalledWith('task_1', [])
  })

  it('assigns via @mention in the title without keeping the token', () => {
    const onAssigneesChange = vi.fn()
    render(<TaskDetailForm task={baseTask} people={people} onAssigneesChange={onAssigneesChange} />)

    const input = screen.getByTestId('task-title-input') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Ship inline editing @bo' } })
    input.setSelectionRange(23, 23)
    fireEvent.change(input, { target: { value: 'Ship inline editing @bo' } })

    fireEvent.click(screen.getByText('Bob'))
    expect(onAssigneesChange).toHaveBeenCalledWith('task_1', ['did:key:z6MkbobYYYYYYYYYY'])
    expect((screen.getByTestId('task-title-input') as HTMLInputElement).value).toBe(
      'Ship inline editing '
    )
  })
})
