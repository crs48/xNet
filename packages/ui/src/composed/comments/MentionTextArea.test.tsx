import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { MentionTextArea } from './MentionTextArea'

const PEOPLE = [
  { did: 'did:key:z6MkAlice', name: 'Alice' },
  { did: 'did:key:z6MkBobby', name: 'Bob' }
]

function Harness({ people = PEOPLE }: { people?: typeof PEOPLE }) {
  const [value, setValue] = useState('')
  return (
    <MentionTextArea
      value={value}
      onChange={setValue}
      people={people}
      data-testid="comment-input"
    />
  )
}

function typeText(value: string) {
  const input = screen.getByTestId('comment-input') as HTMLTextAreaElement
  fireEvent.change(input, { target: { value, selectionStart: value.length } })
  return input
}

describe('MentionTextArea', () => {
  it('opens the people menu on @ and filters by query', () => {
    render(<Harness />)
    typeText('hello @al')
    expect(screen.getByTestId('mention-menu')).toBeTruthy()
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.queryByText('Bob')).toBeNull()
  })

  it('inserts the DID-form mention on click', () => {
    render(<Harness />)
    const input = typeText('hello @al')
    fireEvent.click(screen.getByText('Alice'))
    expect(input.value).toBe('hello @did:key:z6MkAlice ')
    expect(screen.queryByTestId('mention-menu')).toBeNull()
  })

  it('selects with Enter and navigates with arrows', () => {
    render(<Harness />)
    const input = typeText('@')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(input.value).toBe('@did:key:z6MkBobby ')
  })

  it('closes the menu on Escape without touching the text', () => {
    render(<Harness />)
    const input = typeText('@al')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByTestId('mention-menu')).toBeNull()
    expect(input.value).toBe('@al')
  })

  it('never opens a menu with no people', () => {
    render(<Harness people={[]} />)
    typeText('@al')
    expect(screen.queryByTestId('mention-menu')).toBeNull()
  })
})
