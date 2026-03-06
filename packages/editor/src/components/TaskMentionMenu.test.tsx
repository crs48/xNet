import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TaskMentionMenu } from './TaskMentionMenu'

describe('TaskMentionMenu', () => {
  it('renders gravatar avatars when provided', () => {
    render(
      <TaskMentionMenu
        items={[
          {
            id: 'did:key:z6MkExample',
            label: 'alice',
            subtitle: 'You',
            avatarUrl: 'https://www.gravatar.com/avatar/example?d=identicon&s=64'
          }
        ]}
        command={vi.fn()}
      />
    )

    const image = screen.getByAltText('Avatar for alice')
    expect(image).toHaveAttribute('src', 'https://www.gravatar.com/avatar/example?d=identicon&s=64')
  })
})
