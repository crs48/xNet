/**
 * @vitest-environment jsdom
 */

import { render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it } from 'vitest'
import { AiChangeStatusBadge, getAiChangeStatusBadgeSpec } from './AiChangeStatusBadge'

describe('AiChangeStatusBadge', () => {
  it('maps read-only, proposed, and applied AI states to distinct UI treatments', () => {
    expect(getAiChangeStatusBadgeSpec('read-only-answer')).toMatchObject({
      label: 'Read-only',
      description: 'Read-only answer'
    })
    expect(getAiChangeStatusBadgeSpec('proposed-change')).toMatchObject({
      label: 'Proposed',
      description: 'Proposed change awaiting review'
    })
    expect(getAiChangeStatusBadgeSpec('applied-change')).toMatchObject({
      label: 'Applied',
      description: 'Applied change with audit record'
    })
    expect(getAiChangeStatusBadgeSpec('read-only-answer').className).not.toBe(
      getAiChangeStatusBadgeSpec('proposed-change').className
    )
    expect(getAiChangeStatusBadgeSpec('proposed-change').className).not.toBe(
      getAiChangeStatusBadgeSpec('applied-change').className
    )
  })

  it('renders accessible status text for proposed changes', () => {
    render(
      <AiChangeStatusBadge
        state={{
          kind: 'proposed-change',
          label: 'Proposed change',
          planId: 'plan_1'
        }}
      />
    )

    expect(
      screen.getByLabelText('Proposed change awaiting review').getAttribute('data-ai-state')
    ).toBe('proposed-change')
    expect(screen.getByText('Proposed change')).toBeTruthy()
  })
})
