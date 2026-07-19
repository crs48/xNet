import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { CommentIsland } from './CommentIsland'
import type { CommentThreadData } from './CommentPopover'

function makeThread(replyCount = 0): CommentThreadData {
  return {
    root: {
      id: 'root',
      author: 'did:key:zAuthor',
      authorDisplayName: 'Ada',
      content: 'root comment',
      createdAt: 1_700_000_000_000
    },
    replies: Array.from({ length: replyCount }, (_, i) => ({
      id: `reply-${i}`,
      author: 'did:key:zOther',
      authorDisplayName: 'Grace',
      content: `reply ${i}`,
      createdAt: 1_700_000_000_000 + i
    })),
    resolved: false
  }
}

function anchorEl(): HTMLElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return el
}

describe('CommentIsland', () => {
  it('does not mount a composer until invited — the thread keeps the space', () => {
    render(
      <CommentIsland thread={makeThread(2)} anchor={anchorEl()} mode="full" open />
    )
    // Regression guard for 0375: CommentPopover always rendered its textarea,
    // which is what crowded the thread out of a 384px box.
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByRole('button', { name: /reply…/i })).toBeTruthy()
  })

  it('expands the composer on request and submits a reply', () => {
    const onReply = vi.fn()
    render(
      <CommentIsland thread={makeThread()} anchor={anchorEl()} mode="full" open onReply={onReply} />
    )
    fireEvent.click(screen.getByRole('button', { name: /reply…/i }))
    const box = screen.getByRole('textbox')
    fireEvent.change(box, { target: { value: 'a reply' } })
    fireEvent.click(screen.getByRole('button', { name: /^reply$/i }))
    expect(onReply).toHaveBeenCalledWith('a reply')
  })

  it('renders every comment in the thread', () => {
    render(<CommentIsland thread={makeThread(3)} anchor={anchorEl()} mode="full" open />)
    expect(screen.getByText('root comment')).toBeTruthy()
    expect(screen.getByText('reply 0')).toBeTruthy()
    expect(screen.getByText('reply 2')).toBeTruthy()
  })

  it('scrolls only the thread region, so actions stay reachable', () => {
    render(<CommentIsland thread={makeThread(20)} anchor={anchorEl()} mode="full" open />)
    // The island portals to body, so scope to the dialog rather than the
    // render container.
    const dialog = screen.getByRole('dialog')
    const scrollers = dialog.querySelectorAll('.overflow-y-auto')
    expect(scrollers.length).toBe(1)
    // Resolve/Close live outside the scroller.
    expect(scrollers[0].contains(screen.getByRole('button', { name: /resolve/i }))).toBe(false)
  })

  it('composing mode opens with the composer expanded and no thread', () => {
    const onCreate = vi.fn()
    render(
      <CommentIsland
        anchor={anchorEl()}
        mode="composing"
        open
        quotedText="the selected text"
        onCreate={onCreate}
      />
    )
    expect(screen.getByRole('textbox')).toBeTruthy()
    expect(screen.getByText(/the selected text/)).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'first!' } })
    fireEvent.click(screen.getByRole('button', { name: /comment/i }))
    expect(onCreate).toHaveBeenCalledWith('first!')
  })

  it('preview mode shows the root and a reply count, and upgrades on click', () => {
    const onUpgradeToFull = vi.fn()
    render(
      <CommentIsland
        thread={makeThread(2)}
        anchor={anchorEl()}
        mode="preview"
        open
        onUpgradeToFull={onUpgradeToFull}
      />
    )
    expect(screen.getByText('2 replies')).toBeTruthy()
    expect(screen.queryByText('reply 0')).toBeNull()
    fireEvent.click(screen.getByText('root comment'))
    expect(onUpgradeToFull).toHaveBeenCalled()
  })

  it('Escape dismisses', () => {
    const onDismiss = vi.fn()
    render(
      <CommentIsland
        thread={makeThread()}
        anchor={anchorEl()}
        mode="full"
        open
        onDismiss={onDismiss}
      />
    )
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onDismiss).toHaveBeenCalled()
  })

  it('Cmd+Enter submits from the composer', () => {
    const onReply = vi.fn()
    render(
      <CommentIsland
        thread={makeThread()}
        anchor={anchorEl()}
        mode="full"
        open
        focusReply
        onReply={onReply}
      />
    )
    const box = screen.getByRole('textbox')
    fireEvent.change(box, { target: { value: 'quick' } })
    fireEvent.keyDown(box, { key: 'Enter', metaKey: true })
    expect(onReply).toHaveBeenCalledWith('quick')
  })

  it('offers Reopen instead of Resolve on a resolved thread', () => {
    const thread = { ...makeThread(), resolved: true }
    render(<CommentIsland thread={thread} anchor={anchorEl()} mode="full" open />)
    expect(screen.getByRole('button', { name: /reopen/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^resolve$/i })).toBeNull()
  })

  it('shows a thread switcher when anchors overlap', () => {
    const onNext = vi.fn()
    render(
      <CommentIsland
        thread={makeThread()}
        anchor={anchorEl()}
        mode="full"
        open
        position={{ index: 0, total: 3, onPrev: vi.fn(), onNext }}
      />
    )
    expect(screen.getByText(/1 of 3/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /next thread/i }))
    expect(onNext).toHaveBeenCalled()
  })

  it('renders nothing without an anchor', () => {
    render(<CommentIsland thread={makeThread()} anchor={null} mode="full" open />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('portals out of its parent so transformed ancestors cannot clip it', () => {
    const { container } = render(
      <CommentIsland thread={makeThread()} anchor={anchorEl()} mode="full" open />
    )
    const dialog = screen.getByRole('dialog')
    expect(container.contains(dialog)).toBe(false)
    expect(document.body.contains(dialog)).toBe(true)
  })
})
