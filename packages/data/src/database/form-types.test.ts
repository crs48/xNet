/**
 * Tests for form view types and validation (exploration 0278).
 */

import type { ColumnDefinition } from './column-types'
import type { FormFieldRule, FormViewConfig } from './form-types'
import { describe, it, expect } from 'vitest'
import {
  PUBLIC_SAFE_FORM_FIELD_TYPES,
  buildPublicFormDefinition,
  isFormFieldTypeAllowed,
  isFormQuestionVisible,
  submissionRowId,
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

describe('buildPublicFormDefinition', () => {
  it('publishes only public-safe questions with reduced field shape', () => {
    const withUnsafe: FormViewConfig = {
      title: 'RSVP',
      description: 'Join us',
      questions: [
        { fieldId: 'name', label: 'Your name', required: true },
        { fieldId: 'diet' },
        { fieldId: 'owner' }, // person → dropped for public
        { fieldId: 'gone' } // deleted field → dropped
      ],
      submitLabel: 'RSVP',
      confirmation: { title: 'See you there!' }
    }
    const def = buildPublicFormDefinition(withUnsafe, undefined, columns)
    expect(def.questions.map((q) => q.fieldId)).toEqual(['name', 'diet'])
    expect(def.questions[0]).toEqual({
      fieldId: 'name',
      label: 'Your name',
      required: true,
      type: 'text'
    })
    expect(def.questions[1].options).toEqual([{ id: 'veg', name: 'Veg' }])
    expect(def.title).toBe('RSVP')
    expect(def.submitLabel).toBe('RSVP')
    expect(def.confirmation).toEqual({ title: 'See you there!' })
    // Leak barrier: nothing beyond the published shape.
    const json = JSON.stringify(def)
    expect(json).not.toContain('owner')
    expect(json).not.toContain('person')
    expect(json).not.toContain('formula')
  })

  it('publishes only self-contained rules', () => {
    const rules: Record<string, FormFieldRule> = {
      guests: {
        when: [{ columnId: 'attending', operator: 'equals', value: true }],
        match: 'all'
      },
      diet: {
        // References the unpublished person field → dropped.
        when: [{ columnId: 'owner', operator: 'isNotEmpty', value: null }],
        match: 'all'
      }
    }
    const def = buildPublicFormDefinition(config, rules, columns)
    expect(def.rules).toEqual({ guests: rules.guests })
  })

  it('prefers resolved fieldOptions over config options', () => {
    const def = buildPublicFormDefinition(
      { questions: [{ fieldId: 'diet' }] },
      undefined,
      columns,
      {
        diet: [{ id: 'veg', name: 'Vegetarian', color: 'green' }]
      }
    )
    expect(def.questions[0].options).toEqual([{ id: 'veg', name: 'Vegetarian', color: 'green' }])
  })
})

describe('submissionRowId', () => {
  it('is deterministic per (tokenHash, nonce) and distinct across inputs', async () => {
    const a1 = await submissionRowId('hash-a', 'nonce-1')
    const a1again = await submissionRowId('hash-a', 'nonce-1')
    const a2 = await submissionRowId('hash-a', 'nonce-2')
    const b1 = await submissionRowId('hash-b', 'nonce-1')
    expect(a1).toBe(a1again)
    expect(a1).toMatch(/^formsub_[0-9a-f]{24}$/)
    expect(new Set([a1, a2, b1]).size).toBe(3)
  })
})
