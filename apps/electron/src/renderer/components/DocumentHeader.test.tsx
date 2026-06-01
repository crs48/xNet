/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { DocumentHeader } from './DocumentHeader'

describe('DocumentHeader', () => {
  it('commits title changes through the controlled local input', () => {
    const onTitleChange = vi.fn()

    render(
      <DocumentHeader
        docId="page-1"
        docType="page"
        title="Draft"
        onTitleChange={onTitleChange}
        showShareButton={false}
      />
    )

    fireEvent.change(screen.getByLabelText('page title'), {
      target: { value: 'Updated draft' }
    })

    expect(onTitleChange).toHaveBeenCalledWith('Updated draft')
  })

  it('moves from title to body on plain Enter', () => {
    const onTitleSubmit = vi.fn()

    render(
      <DocumentHeader
        docId="page-1"
        docType="page"
        title="Draft"
        onTitleChange={vi.fn()}
        onTitleSubmit={onTitleSubmit}
        showShareButton={false}
      />
    )

    fireEvent.keyDown(screen.getByLabelText('page title'), {
      key: 'Enter'
    })

    expect(onTitleSubmit).toHaveBeenCalledTimes(1)
  })

  it('exposes the title input ref for body-to-title focus handoff', () => {
    const titleInputRef = React.createRef<HTMLInputElement>()

    render(
      <DocumentHeader
        docId="page-1"
        docType="page"
        title="Draft"
        onTitleChange={vi.fn()}
        titleInputRef={titleInputRef}
        showShareButton={false}
      />
    )

    expect(titleInputRef.current).toBe(screen.getByLabelText('page title'))
  })

  it('does not submit the title for modified Enter shortcuts', () => {
    const onTitleSubmit = vi.fn()

    render(
      <DocumentHeader
        docId="page-1"
        docType="page"
        title="Draft"
        onTitleChange={vi.fn()}
        onTitleSubmit={onTitleSubmit}
        showShareButton={false}
      />
    )

    fireEvent.keyDown(screen.getByLabelText('page title'), {
      key: 'Enter',
      metaKey: true
    })

    expect(onTitleSubmit).not.toHaveBeenCalled()
  })
})
