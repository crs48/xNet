/**
 * @xnetjs/react - Tests for embedded task collection rendering.
 */
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTasks } from '../hooks/useTasks'
import { TaskCollectionEmbed } from './TaskCollectionEmbed'

vi.mock('../hooks/useTasks', () => ({
  useTasks: vi.fn()
}))

describe('TaskCollectionEmbed', () => {
  const useTasksMock = vi.mocked(useTasks)

  beforeEach(() => {
    useTasksMock.mockReset()
    useTasksMock.mockReturnValue({
      data: [],
      tree: [],
      loading: false,
      error: null,
      reload: vi.fn()
    })
  })

  it('shows a context warning without running an unscoped current-page query', () => {
    render(
      <TaskCollectionEmbed
        currentPageId={null}
        currentDid={null}
        scope="current-page"
        assignee="any"
        dueDate="any"
        status="all"
        showHierarchy={false}
      />
    )

    expect(screen.getByText('This view needs a page context.')).toBeTruthy()
    expect(useTasksMock).toHaveBeenCalledWith({
      pageId: '__task_collection_embed_missing_page_context__',
      assigneeDid: undefined,
      includeCompleted: true,
      statuses: undefined,
      dueDateFilter: 'any'
    })
  })
})
