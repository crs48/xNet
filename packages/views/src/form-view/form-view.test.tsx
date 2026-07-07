/**
 * Tests for the form view components (exploration 0278): fill-mode
 * validation + show-if rules + confirmation, builder editing, and the
 * Build/Preview composite.
 */

import type { GridField } from '../grid/model.js'
import type { FormFieldRule, FormViewConfig } from '@xnetjs/data'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { FormBuilder } from './FormBuilder.js'
import { FormFillView, formFieldsToColumns } from './FormFillView.js'
import { FormView } from './FormView.js'

const fields: GridField[] = [
  { id: 'name', name: 'Name', type: 'text', config: {}, width: 200 },
  { id: 'attending', name: 'Attending', type: 'checkbox', config: {}, width: 100 },
  { id: 'guests', name: 'Guests', type: 'number', config: {}, width: 100 },
  { id: 'owner', name: 'Owner', type: 'person', config: {}, width: 100 },
  { id: 'total', name: 'Total', type: 'formula', config: {}, width: 100 }
]

const config: FormViewConfig = {
  title: 'RSVP',
  description: 'Tell us if you are coming',
  questions: [
    { fieldId: 'name', label: 'Your name', description: 'First and last', required: true },
    { fieldId: 'attending' },
    { fieldId: 'guests' }
  ],
  submitLabel: 'Send RSVP',
  confirmation: { title: 'See you there!', body: 'We got your response.' }
}

const rules: Record<string, FormFieldRule> = {
  guests: {
    when: [{ columnId: 'attending', operator: 'equals', value: true }],
    match: 'all'
  }
}

describe('formFieldsToColumns', () => {
  it('folds resolved options into the column config', () => {
    const columns = formFieldsToColumns([
      {
        id: 's',
        name: 'S',
        type: 'select',
        config: {},
        width: 1,
        options: [{ id: 'a', name: 'A' }]
      }
    ])
    expect((columns[0].config as { options?: unknown }).options).toEqual([{ id: 'a', name: 'A' }])
  })
})

describe('FormFillView', () => {
  it('renders title, description, and configured questions with overrides', () => {
    render(<FormFillView fields={fields} config={config} audience="workspace" onSubmit={vi.fn()} />)
    expect(screen.getByText('RSVP')).toBeTruthy()
    expect(screen.getByText('Tell us if you are coming')).toBeTruthy()
    expect(screen.getByText('Your name')).toBeTruthy()
    expect(screen.getByText('First and last')).toBeTruthy()
    expect(screen.getByText('Send RSVP')).toBeTruthy()
  })

  it('blocks submit on missing required answers and shows the error inline', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true)
    render(<FormFillView fields={fields} config={config} audience="public" onSubmit={onSubmit} />)
    fireEvent.click(screen.getByText('Send RSVP'))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('required'))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('applies show-if rules live and submits visible answers with the honeypot', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true)
    render(
      <FormFillView
        fields={fields}
        config={config}
        rules={rules}
        audience="public"
        onSubmit={onSubmit}
      />
    )
    // Rule-hidden until "attending" is checked.
    expect(screen.queryByText('Guests')).toBeNull()
    fireEvent.click(screen.getByRole('checkbox'))
    await waitFor(() => expect(screen.getByText('Guests')).toBeTruthy())

    // Fill the required name (first visible textbox is the name editor —
    // the honeypot is hidden but still a textbox in the a11y tree, so
    // target by position within the form body).
    const textboxes = screen.getAllByRole('textbox', { hidden: true })
    fireEvent.change(textboxes[0], { target: { value: 'Ada' } })

    fireEvent.click(screen.getByText('Send RSVP'))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    const [cells, extras] = onSubmit.mock.calls[0]
    expect(cells.name).toBe('Ada')
    expect(cells.attending).toBe(true)
    expect(extras).toEqual({ honeypot: '' })

    // Success → confirmation copy.
    await waitFor(() => expect(screen.getByText('See you there!')).toBeTruthy())
    expect(screen.getByText('We got your response.')).toBeTruthy()
  })

  it('keeps the form editable with a notice when submission fails', async () => {
    const onSubmit = vi.fn().mockResolvedValue(false)
    render(
      <FormFillView
        fields={fields}
        config={{ questions: [{ fieldId: 'attending' }] }}
        audience="public"
        onSubmit={onSubmit}
      />
    )
    fireEvent.click(screen.getByText('Submit'))
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('Something went wrong')
    )
    expect(screen.getByText('Submit')).toBeTruthy()
  })

  it('shows the closed message when not accepting', () => {
    render(
      <FormFillView
        fields={fields}
        config={config}
        accepting={false}
        audience="public"
        onSubmit={vi.fn()}
      />
    )
    expect(screen.getByText('This form is no longer accepting responses.')).toBeTruthy()
    expect(screen.queryByText('Send RSVP')).toBeNull()
  })

  it('falls back to the database title and prompts for questions when unconfigured', () => {
    render(
      <FormFillView
        fields={fields}
        config={{ questions: [] }}
        databaseTitle="Tracker"
        audience="workspace"
        onSubmit={vi.fn()}
      />
    )
    expect(screen.getByText('Tracker')).toBeTruthy()
    expect(screen.getByText(/No questions yet/)).toBeTruthy()
  })
})

describe('FormBuilder', () => {
  function renderBuilder(overrides: Partial<React.ComponentProps<typeof FormBuilder>> = {}) {
    const onChangeConfig = vi.fn()
    const onChangeRules = vi.fn()
    const onChangeAccepting = vi.fn()
    render(
      <FormBuilder
        fields={fields}
        config={config}
        rules={rules}
        accepting
        audience="workspace"
        onChangeConfig={onChangeConfig}
        onChangeRules={onChangeRules}
        onChangeAccepting={onChangeAccepting}
        {...overrides}
      />
    )
    return { onChangeConfig, onChangeRules, onChangeAccepting }
  }

  it('offers only askable fields as new questions (never computed)', () => {
    renderBuilder()
    // owner (person) is askable for workspace forms; total (formula) never.
    expect(screen.getByText('+ Owner')).toBeTruthy()
    expect(screen.queryByText('+ Total')).toBeNull()
  })

  it('adds, edits, reorders, and removes questions as whole-config commits', () => {
    const { onChangeConfig } = renderBuilder()

    fireEvent.click(screen.getByText('+ Owner'))
    expect(
      onChangeConfig.mock.calls[0][0].questions.map((q: { fieldId: string }) => q.fieldId)
    ).toEqual(['name', 'attending', 'guests', 'owner'])

    fireEvent.change(screen.getByLabelText('Question label for Name'), {
      target: { value: 'Full name' }
    })
    expect(onChangeConfig.mock.calls[1][0].questions[0].label).toBe('Full name')

    fireEvent.click(screen.getByLabelText('Move Attending up'))
    expect(
      onChangeConfig.mock.calls[2][0].questions.map((q: { fieldId: string }) => q.fieldId)
    ).toEqual(['attending', 'name', 'guests'])

    fireEvent.click(screen.getByLabelText('Remove Guests from form'))
    expect(
      onChangeConfig.mock.calls[3][0].questions.map((q: { fieldId: string }) => q.fieldId)
    ).toEqual(['name', 'attending'])
  })

  it('edits show-if rules and the accepting toggle', () => {
    const { onChangeRules, onChangeAccepting } = renderBuilder()

    // Guests already has a rule (checkbox checked); change its operator.
    fireEvent.change(screen.getAllByLabelText('Rule operator')[0], {
      target: { value: 'isNotEmpty' }
    })
    expect(onChangeRules).toHaveBeenCalledWith({
      guests: {
        when: [{ columnId: 'attending', operator: 'isNotEmpty', value: true }],
        match: 'all'
      }
    })

    fireEvent.click(screen.getByLabelText('Accepting responses'))
    expect(onChangeAccepting).toHaveBeenCalledWith(false)
  })

  it('removing a question also drops its rule', () => {
    const { onChangeRules } = renderBuilder()
    fireEvent.click(screen.getByLabelText('Remove Guests from form'))
    expect(onChangeRules).toHaveBeenCalledWith({})
  })
})

describe('FormView', () => {
  it('opens in Build for a fresh editable form and switches to Preview', () => {
    render(
      <FormView
        fields={fields}
        config={null}
        editable
        onSubmit={vi.fn()}
        onChangeConfig={vi.fn()}
        onChangeRules={vi.fn()}
        onChangeAccepting={vi.fn()}
      />
    )
    // Build tab active (builder meta inputs visible).
    expect(screen.getByLabelText('Form title')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'preview' }))
    expect(screen.getByText(/No questions yet/)).toBeTruthy()
  })

  it('renders only the fill form for non-editors', () => {
    render(<FormView fields={fields} config={config} onSubmit={vi.fn()} />)
    expect(screen.queryByRole('tab', { name: 'build' })).toBeNull()
    expect(screen.getByText('RSVP')).toBeTruthy()
  })
})
