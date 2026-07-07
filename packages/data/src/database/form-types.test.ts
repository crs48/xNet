/**
 * Tests for form view types and validation (exploration 0278).
 */

import type { ColumnDefinition } from './column-types'
import type { FormFieldRule, FormViewConfig } from './form-types'
import { describe, it, expect } from 'vitest'
import {
  PUBLIC_SAFE_FORM_FIELD_TYPES,
  isFormFieldTypeAllowed,
  isFormQuestionVisible,
  visibleFormQuestions,
  validateFormSubmission
} from './form-types'

const columns: ColumnDefinition[] = [
  { id: 'name', name: 'Name', type: 'text', config: {} },
  { id: 'email', name: 'Email', type: 'email', config: {} },
  { id: 'guests', name: 'Guests', type: 'number', config: {} },
  {
    id: 'diet',
    name: 'Diet',
    type: 'select',
    config: { options: [{ id: 'veg', name: 'Veg' }] }
  },
  { id: 'attending', name: 'Attending', type: 'checkbox', config: {} },
  { id: 'owner', name: 'Owner', type: 'person', config: {} },
  { id: 'total', name: 'Total', type: 'formula', config: {} }
]

const config: FormViewConfig = {
  title: 'RSVP',
  questions: [
    { fieldId: 'name', required: true },
    { fieldId: 'email' },
    { fieldId: 'attending' },
    { fieldId: 'guests' },
    { fieldId: 'diet' }
  ]
}

describe('isFormFieldTypeAllowed', () => {
  it('never allows computed or auto fields', () => {
    for (const audience of ['workspace', 'public'] as const) {
      expect(isFormFieldTypeAllowed('formula', audience)).toBe(false)
      expect(isFormFieldTypeAllowed('rollup', audience)).toBe(false)
      expect(isFormFieldTypeAllowed('created', audience)).toBe(false)
      expect(isFormFieldTypeAllowed('createdBy', audience)).toBe(false)
    }
  })

  it('restricts public forms to the safe subset', () => {
    expect(isFormFieldTypeAllowed('person', 'public')).toBe(false)
    expect(isFormFieldTypeAllowed('relation', 'public')).toBe(false)
    expect(isFormFieldTypeAllowed('file', 'public')).toBe(false)
    for (const type of PUBLIC_SAFE_FORM_FIELD_TYPES) {
      expect(isFormFieldTypeAllowed(type, 'public')).toBe(true)
    }
  })

  it('allows person/relation/file for workspace forms', () => {
    expect(isFormFieldTypeAllowed('person', 'workspace')).toBe(true)
    expect(isFormFieldTypeAllowed('relation', 'workspace')).toBe(true)
    expect(isFormFieldTypeAllowed('file', 'workspace')).toBe(true)
  })
})

describe('isFormQuestionVisible', () => {
  const rule: FormFieldRule = {
    when: [{ columnId: 'attending', operator: 'equals', value: true }],
    match: 'all'
  }

  it('shows when no rule is set', () => {
    expect(isFormQuestionVisible(undefined, {}, columns)).toBe(true)
    expect(isFormQuestionVisible({ when: [], match: 'all' }, {}, columns)).toBe(true)
  })

  it('evaluates conditions against the in-progress answers', () => {
    expect(isFormQuestionVisible(rule, { attending: true }, columns)).toBe(true)
    expect(isFormQuestionVisible(rule, { attending: false }, columns)).toBe(false)
    expect(isFormQuestionVisible(rule, {}, columns)).toBe(false)
  })

  it("supports 'any' matching", () => {
    const anyRule: FormFieldRule = {
      when: [
        { columnId: 'attending', operator: 'equals', value: true },
        { columnId: 'guests', operator: 'greaterThan', value: 3 }
      ],
      match: 'any'
    }
    expect(isFormQuestionVisible(anyRule, { attending: false, guests: 5 }, columns)).toBe(true)
    expect(isFormQuestionVisible(anyRule, { attending: false, guests: 1 }, columns)).toBe(false)
  })

  it('keeps questions reachable when a rule references a deleted field', () => {
    // Filter-engine semantic: conditions on unknown columns pass, so the
    // question shows rather than hiding behind an unsatisfiable rule.
    const ghost: FormFieldRule = {
      when: [{ columnId: 'deleted-field', operator: 'equals', value: 'x' }],
      match: 'all'
    }
    expect(isFormQuestionVisible(ghost, { name: 'a' }, columns)).toBe(true)
  })
})

describe('visibleFormQuestions', () => {
  it('drops questions for deleted fields and disallowed types', () => {
    const withBad: FormViewConfig = {
      questions: [
        { fieldId: 'name' },
        { fieldId: 'gone' },
        { fieldId: 'total' }, // formula: never askable
        { fieldId: 'owner' } // person: workspace-only
      ]
    }
    const publicQs = visibleFormQuestions(withBad, undefined, {}, columns, 'public')
    expect(publicQs.map((q) => q.fieldId)).toEqual(['name'])
    const workspaceQs = visibleFormQuestions(withBad, undefined, {}, columns, 'workspace')
    expect(workspaceQs.map((q) => q.fieldId)).toEqual(['name', 'owner'])
  })

  it('applies show-if rules', () => {
    const rules = {
      guests: {
        when: [{ columnId: 'attending', operator: 'equals', value: true }],
        match: 'all'
      } as FormFieldRule
    }
    const hidden = visibleFormQuestions(config, rules, { attending: false }, columns, 'public')
    expect(hidden.some((q) => q.fieldId === 'guests')).toBe(false)
    const shown = visibleFormQuestions(config, rules, { attending: true }, columns, 'public')
    expect(shown.some((q) => q.fieldId === 'guests')).toBe(true)
  })
})

describe('validateFormSubmission', () => {
  it('accepts a complete valid submission', () => {
    const result = validateFormSubmission(
      config,
      undefined,
      { name: 'Ada', email: 'ada@example.com', attending: true, guests: 2, diet: 'veg' },
      columns,
      'public'
    )
    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.cells).toEqual({
      name: 'Ada',
      email: 'ada@example.com',
      attending: true,
      guests: 2,
      diet: 'veg'
    })
  })

  it('rejects missing required answers', () => {
    const result = validateFormSubmission(config, undefined, { email: 'a@b.c' }, columns, 'public')
    expect(result.ok).toBe(false)
    expect(result.errors).toContainEqual({ fieldId: 'name', reason: 'required' })
  })

  it('flags answers for fields that no longer exist (drift → review)', () => {
    const drifted: FormViewConfig = {
      questions: [...config.questions, { fieldId: 'removed' }]
    }
    const result = validateFormSubmission(
      drifted,
      undefined,
      { name: 'Ada', removed: 'stale' },
      columns,
      'public'
    )
    expect(result.ok).toBe(false)
    expect(result.errors).toContainEqual({ fieldId: 'removed', reason: 'unknown-field' })
  })

  it('silently drops answers that were never asked', () => {
    const result = validateFormSubmission(
      config,
      undefined,
      { name: 'Ada', sneaky: 'value' },
      columns,
      'public'
    )
    expect(result.ok).toBe(true)
    expect(result.cells).not.toHaveProperty('sneaky')
  })

  it('rejects unknown select options on public forms', () => {
    const result = validateFormSubmission(
      config,
      undefined,
      { name: 'Ada', diet: 'made-up-option' },
      columns,
      'public'
    )
    expect(result.ok).toBe(false)
    expect(result.errors).toContainEqual({ fieldId: 'diet', reason: 'bad-option' })
  })

  it('rejects type-implausible values', () => {
    const result = validateFormSubmission(
      config,
      undefined,
      { name: 'Ada', guests: 'many' },
      columns,
      'public'
    )
    expect(result.ok).toBe(false)
    expect(result.errors).toContainEqual({ fieldId: 'guests', reason: 'bad-value' })
  })

  it('drops answers to rule-hidden questions instead of erroring', () => {
    const rules = {
      guests: {
        when: [{ columnId: 'attending', operator: 'equals', value: true }],
        match: 'all'
      } as FormFieldRule
    }
    const result = validateFormSubmission(
      config,
      rules,
      { name: 'Ada', attending: false, guests: 4 },
      columns,
      'public'
    )
    expect(result.ok).toBe(true)
    expect(result.cells).not.toHaveProperty('guests')
  })

  it('required does not apply to rule-hidden questions', () => {
    const withRequiredGuests: FormViewConfig = {
      questions: [
        { fieldId: 'name', required: true },
        { fieldId: 'attending' },
        { fieldId: 'guests', required: true }
      ]
    }
    const rules = {
      guests: {
        when: [{ columnId: 'attending', operator: 'equals', value: true }],
        match: 'all'
      } as FormFieldRule
    }
    const result = validateFormSubmission(
      withRequiredGuests,
      rules,
      { name: 'Ada', attending: false },
      columns,
      'public'
    )
    expect(result.ok).toBe(true)
  })
})
