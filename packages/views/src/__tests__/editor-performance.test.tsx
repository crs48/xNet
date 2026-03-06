import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it } from 'vitest'
import { getPropertyHandler } from '../properties'

function getPerformanceBudget(localBudgetMs: number, ciBudgetMs: number): number {
  return process.env.CI ? ciBudgetMs : localBudgetMs
}

describe('Editor performance', () => {
  it('filters large multi-select option sets quickly', () => {
    const handler = getPropertyHandler('multiSelect')
    const options = Array.from({ length: 3000 }, (_, index) => ({
      id: `opt-${index}`,
      name: `Option ${index}`,
      color: '#6b7280'
    }))

    render(
      <handler.Editor
        value={[]}
        config={{ options, allowCreate: true }}
        onChange={() => {}}
        autoFocus
      />
    )

    const input = screen.getByRole('combobox')
    const start = Date.now()
    fireEvent.change(input, { target: { value: 'Option 299' } })
    const elapsedMs = Date.now() - start

    expect(elapsedMs).toBeLessThan(getPerformanceBudget(500, 1000))
  })

  it('filters large person suggestion sets quickly', () => {
    const handler = getPropertyHandler('person')
    const suggestions = Array.from({ length: 2000 }, (_, index) => ({
      did: `did:key:zPerson${index}`,
      name: `Person ${index}`
    }))

    render(<handler.Editor value={null} config={{ suggestions }} onChange={() => {}} autoFocus />)

    const input = screen.getByRole('combobox')
    const start = Date.now()
    fireEvent.change(input, { target: { value: 'Person 1999' } })
    const elapsedMs = Date.now() - start

    expect(elapsedMs).toBeLessThan(getPerformanceBudget(500, 1000))
  })
})
