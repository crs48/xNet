import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TaskInlineEditor, type TaskNode } from './TaskInlineEditor'

const mocks = vi.hoisted(() => ({
  updateMock: vi.fn(),
  navigateMock: vi.fn()
}))
const { updateMock, navigateMock } = mocks

vi.mock('@xnetjs/react', () => ({
  useMutate: () => ({ update: mocks.updateMock }),
  // MilestonePicker (0190) queries milestones; no milestones in these tests.
  useQuery: () => ({ data: [], loading: false })
}))
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigateMock
}))
vi.mock('../hooks/useWorkspacePeople', () => ({
  useWorkspacePeople: () => [
    { did: 'did:key:z6Mkme', isSelf: true, name: 'Me' },
    { did: 'did:key:z6Mkalice', name: 'Alice' }
  ]
}))
vi.mock('../hooks/useWorkspaceTags', () => ({
  useWorkspaceTags: () => ({
    allTags: [{ id: 'tag-design', name: 'design' }],
    suggestions: [{ id: 'tag-design', name: 'design' }],
    getOrCreateTag: async (name: string) => ({ id: `tag-${name}`, name }),
    setNodeTags: vi.fn()
  })
}))

function node(overrides: Record<string, unknown> = {}): TaskNode {
  return {
    id: 'task_1',
    title: 'Ship inline editing',
    completed: false,
    status: 'todo',
    priority: 'medium',
    updatedAt: 1,
    createdAt: 1,
    ...overrides
  } as unknown as TaskNode
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('TaskInlineEditor (unhosted task)', () => {
  it('edits the title on the node', () => {
    render(<TaskInlineEditor task={node()} />)

    const input = screen.getByTestId('task-title-input')
    fireEvent.change(input, { target: { value: 'Ship it v2' } })
    fireEvent.blur(input)

    expect(updateMock).toHaveBeenCalledWith(expect.anything(), 'task_1', { title: 'Ship it v2' })
  })

  it('derives completed from a status change', () => {
    render(<TaskInlineEditor task={node()} />)

    fireEvent.click(screen.getByTestId('task-status-chip'))
    fireEvent.click(screen.getByText('Done'))

    expect(updateMock).toHaveBeenCalledWith(expect.anything(), 'task_1', {
      status: 'done',
      completed: true
    })
  })

  it('writes assignees with the legacy single-assignee mirror', () => {
    render(<TaskInlineEditor task={node()} />)

    fireEvent.click(screen.getByTestId('task-assign-chip'))
    fireEvent.click(screen.getByText('Alice'))

    expect(updateMock).toHaveBeenCalledWith(expect.anything(), 'task_1', {
      assignees: ['did:key:z6Mkalice'],
      assignee: 'did:key:z6Mkalice'
    })
  })

  it('adds a workspace tag to the node (tags are node-owned)', () => {
    render(<TaskInlineEditor task={node()} />)

    fireEvent.click(screen.getByTestId('task-tags-chip'))
    fireEvent.click(screen.getByText('design'))

    expect(updateMock).toHaveBeenCalledWith(expect.anything(), 'task_1', {
      tags: ['tag-design']
    })
  })

  it('removes a tag via its chip', () => {
    render(<TaskInlineEditor task={node({ tags: ['tag-design'] })} />)

    fireEvent.click(screen.getByLabelText('Remove tag design'))

    expect(updateMock).toHaveBeenCalledWith(expect.anything(), 'task_1', { tags: [] })
  })

  it('clears the due date with the undefined sentinel', () => {
    render(<TaskInlineEditor task={node({ dueDate: Date.UTC(2026, 6, 1) })} />)

    fireEvent.click(screen.getByTestId('task-due-chip'))
    fireEvent.click(screen.getByText('Clear due date'))

    expect(updateMock).toHaveBeenCalledWith(expect.anything(), 'task_1', { dueDate: undefined })
  })
})

describe('TaskInlineEditor (page-hosted)', () => {
  // Doc-owned fields are always locked for hosted tasks since the
  // BlockNote migration retired the live-editor write-through (0312).
  it('locks doc-owned fields and links to the page', () => {
    render(<TaskInlineEditor task={node({ page: 'page_1' })} />)

    expect(screen.getByTestId('task-title-static')).toBeTruthy()
    expect(screen.queryByTestId('task-due-chip')).toBeNull()
    expect(screen.queryByTestId('task-assign-chip')).toBeNull()
    expect(screen.getByText(/live in the hosting document/)).toBeTruthy()

    fireEvent.click(screen.getByTestId('task-open-source'))
    expect(navigateMock).toHaveBeenCalledWith({ to: '/doc/$docId', params: { docId: 'page_1' } })
  })
})

describe('TaskInlineEditor pin toggle', () => {
  it('pins and unpins through the workbench store', () => {
    render(<TaskInlineEditor task={node()} />)

    fireEvent.click(screen.getByTestId('task-pin-toggle'))
    expect(screen.getByText('Pinned')).toBeTruthy()

    fireEvent.click(screen.getByTestId('task-pin-toggle'))
    expect(screen.getByText('Pin')).toBeTruthy()
  })
})
