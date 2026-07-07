/**
 * Form view types and validation (exploration 0278).
 *
 * A form is a `DatabaseView` of type `'form'`: the view node carries the
 * question list, per-question show-if rules, and submission settings; every
 * accepted submission becomes a new `DatabaseRow`. The validation core here
 * is deliberately UI-free so the same code runs in the in-app fill view and
 * at drain time when the owner's client materializes public submissions
 * (which may arrive long after the fields changed).
 *
 * Show-if rules reuse the `FilterCondition` grammar and the filter engine:
 * a rule is evaluated by running the in-progress answers as a single
 * pseudo-row through `filterRows`, so form logic and view filters can never
 * drift apart in operator semantics.
 */

import type { CellValue } from './cell-types'
import type { ColumnDefinition } from './column-types'
import type { FieldType } from './field-types'
import type { FilterCondition } from './view-types'
import { isAutoFieldType, isComputedFieldType } from './field-types'
import { filterRows } from './filter-engine'

// ─── Config (stored on the DatabaseView node, whole-value LWW) ──────────────

/** One question on the form; omitted fields are not asked. */
export interface FormQuestion {
  /** DatabaseField node id this question writes to. */
  fieldId: string
  /** Overrides the field name as the question label. */
  label?: string
  /** Helper text under the label. */
  description?: string
  /** Require an answer (independent of the field's own required flag). */
  required?: boolean
}

/** Confirmation screen shown after a successful submission. */
export interface FormConfirmation {
  title?: string
  body?: string
}

/** Form view configuration (the `formConfig` json property). */
export interface FormViewConfig {
  /** Defaults to the database title. */
  title?: string
  description?: string
  /** Ordered question list. */
  questions: FormQuestion[]
  confirmation?: FormConfirmation
  submitLabel?: string
}

/**
 * Per-question show-if rule (the `formRules` json property, keyed by
 * fieldId). The question renders only when the conditions hold against the
 * in-progress answers. Conditions use the same shape/operators as view
 * filters (`FilterCondition`).
 */
export interface FormFieldRule {
  when: FilterCondition[]
  /** 'all' = AND, 'any' = OR. */
  match: 'all' | 'any'
}

/**
 * Provenance stamped on rows created by a form submission (the row's
 * `submissionMeta` property). `nonce` is the submitter's idempotency key:
 * public submissions derive the row id from it, so retries and double-drains
 * LWW-upsert instead of duplicating.
 */
export interface FormSubmissionMeta {
  via: 'form'
  /** The form view the submission came through. */
  viewId: string
  /** Client-generated idempotency key (public submissions). */
  nonce?: string
  /** When the submission was received (hub time for public, client for in-app). */
  submittedAt: number
}

// ─── Field-type gates ────────────────────────────────────────────────────────

/**
 * Field types an anonymous public respondent may be asked. Everything that
 * leaks workspace data (person/relation), requires identity or blob plumbing
 * (file), or is computed/auto is excluded.
 */
export const PUBLIC_SAFE_FORM_FIELD_TYPES: readonly FieldType[] = [
  'text',
  'number',
  'checkbox',
  'date',
  'dateRange',
  'select',
  'multiSelect',
  'url',
  'email',
  'phone'
] as const

/** Where the form is being filled from. */
export type FormAudience = 'workspace' | 'public'

/**
 * Whether a field type may appear as a form question for the given audience.
 * Workspace forms additionally allow person/relation/file (respondents are
 * authenticated members with blob + graph access); computed and auto fields
 * are never askable.
 */
export function isFormFieldTypeAllowed(type: FieldType, audience: FormAudience): boolean {
  if (isComputedFieldType(type) || isAutoFieldType(type)) return false
  if (type === 'richText') return false
  if (audience === 'public') {
    return (PUBLIC_SAFE_FORM_FIELD_TYPES as readonly string[]).includes(type)
  }
  return true
}

// ─── Rule evaluation ─────────────────────────────────────────────────────────

/**
 * Evaluate a show-if rule against the in-progress answers. Empty/missing
 * rules always show. A condition referencing a deleted field passes (the
 * filter-engine semantic), so the question stays reachable instead of being
 * permanently hidden behind an unsatisfiable rule.
 */
export function isFormQuestionVisible(
  rule: FormFieldRule | undefined,
  answers: Record<string, CellValue>,
  columns: ColumnDefinition[]
): boolean {
  if (!rule || rule.when.length === 0) return true
  const pseudoRow = { id: '__form_draft__', cells: answers }
  const matched = filterRows([pseudoRow], columns, {
    operator: rule.match === 'any' ? 'or' : 'and',
    conditions: rule.when
  })
  return matched.length === 1
}

/**
 * The questions currently visible: configured, allowed for the audience,
 * backed by a live field, and passing their show-if rule.
 */
export function visibleFormQuestions(
  config: FormViewConfig,
  rules: Record<string, FormFieldRule> | undefined,
  answers: Record<string, CellValue>,
  columns: ColumnDefinition[],
  audience: FormAudience
): FormQuestion[] {
  const byId = new Map(columns.map((c) => [c.id, c]))
  return config.questions.filter((q) => {
    const column = byId.get(q.fieldId)
    if (!column) return false
    if (!isFormFieldTypeAllowed(column.type as FieldType, audience)) return false
    return isFormQuestionVisible(rules?.[q.fieldId], answers, columns)
  })
}

// ─── Submission validation (shared: fill view + drain-time) ─────────────────

export interface FormValidationError {
  fieldId: string
  /** Machine-readable reason; the UI maps these to copy. */
  reason: 'required' | 'unknown-field' | 'type-not-allowed' | 'bad-option' | 'bad-value'
}

export interface FormValidationResult {
  ok: boolean
  errors: FormValidationError[]
  /** Answers restricted to visible questions, ready for `cell_` mapping. */
  cells: Record<string, CellValue>
}

function isPlausibleValue(type: FieldType, value: CellValue): boolean {
  if (value == null) return true
  switch (type) {
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
    case 'checkbox':
      return typeof value === 'boolean'
    case 'multiSelect':
      return Array.isArray(value)
    case 'text':
    case 'url':
    case 'email':
    case 'phone':
    case 'select':
    case 'date':
      return typeof value === 'string'
    default:
      return true
  }
}

function selectOptionsOf(column: ColumnDefinition): Set<string> | null {
  const config = column.config as { options?: Array<{ id: string }> } | undefined
  if (!config?.options) return null
  return new Set(config.options.map((o) => o.id))
}

const isEmptyAnswer = (value: CellValue): boolean =>
  value == null || value === '' || (Array.isArray(value) && value.length === 0)

/**
 * Validate a submission against the form config and the *current* fields.
 * Answers for hidden (rule-suppressed) or unconfigured questions are dropped,
 * not errors — respondents may race a config edit. Unknown field ids and
 * disallowed types ARE errors: they signal drift between submission and
 * schema that a human should review (exploration 0278's Rejected state).
 */
export function validateFormSubmission(
  config: FormViewConfig,
  rules: Record<string, FormFieldRule> | undefined,
  answers: Record<string, CellValue>,
  columns: ColumnDefinition[],
  audience: FormAudience
): FormValidationResult {
  const errors: FormValidationError[] = []
  const cells: Record<string, CellValue> = {}
  const byId = new Map(columns.map((c) => [c.id, c]))
  const configured = new Set(config.questions.map((q) => q.fieldId))
  const visible = visibleFormQuestions(config, rules, answers, columns, audience)
  const visibleIds = new Set(visible.map((q) => q.fieldId))

  // Answers referencing unknown or unconfigured fields → drift errors/drops.
  for (const fieldId of Object.keys(answers)) {
    if (!configured.has(fieldId)) continue // silently drop: not asked
    const column = byId.get(fieldId)
    if (!column) {
      errors.push({ fieldId, reason: 'unknown-field' })
      continue
    }
    if (!isFormFieldTypeAllowed(column.type as FieldType, audience)) {
      errors.push({ fieldId, reason: 'type-not-allowed' })
    }
  }

  for (const question of visible) {
    const column = byId.get(question.fieldId)
    if (!column) continue // filtered above
    const value = answers[question.fieldId] ?? null

    if (question.required && isEmptyAnswer(value)) {
      errors.push({ fieldId: question.fieldId, reason: 'required' })
      continue
    }
    if (isEmptyAnswer(value)) continue

    if (!isPlausibleValue(column.type as FieldType, value)) {
      errors.push({ fieldId: question.fieldId, reason: 'bad-value' })
      continue
    }

    // Public forms may only reference existing select options (no
    // onCreateOption escape hatch for anonymous respondents).
    if (column.type === 'select' || column.type === 'multiSelect') {
      const known = selectOptionsOf(column)
      if (known) {
        const ids = Array.isArray(value) ? value.map(String) : [String(value)]
        if (ids.some((id) => !known.has(id))) {
          errors.push({ fieldId: question.fieldId, reason: 'bad-option' })
          continue
        }
      }
    }

    cells[question.fieldId] = value
  }

  // Only visible answered questions make it into cells.
  for (const fieldId of Object.keys(cells)) {
    if (!visibleIds.has(fieldId)) delete cells[fieldId]
  }

  return { ok: errors.length === 0, errors, cells }
}
