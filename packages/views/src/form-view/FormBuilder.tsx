/**
 * FormBuilder — the owner-facing editor for a form view (exploration 0278).
 *
 * Edits the `FormViewConfig` / `formRules` / `formAccepting` stored on the
 * DatabaseView node. All changes commit whole-value (the config json is one
 * LWW unit, like a filter tree), so the caller receives complete next
 * objects, never partial patches.
 */

import type { GridField } from '../grid/model.js'
import type {
  FieldType,
  FilterCondition,
  FormAudience,
  FormFieldRule,
  FormQuestion,
  FormViewConfig
} from '@xnetjs/data'
import { isFormFieldTypeAllowed } from '@xnetjs/data'
import { cn } from '@xnetjs/ui'
import { ArrowDown, ArrowUp, EyeOff } from 'lucide-react'
import React, { useCallback, useMemo } from 'react'

export interface FormBuilderProps {
  fields: GridField[]
  config: FormViewConfig
  rules?: Record<string, FormFieldRule>
  accepting?: boolean
  /**
   * The audience the form will ultimately serve. Public forms restrict the
   * offerable field types (person/relation/file are workspace-only).
   */
  audience: FormAudience
  onChangeConfig: (next: FormViewConfig) => void
  onChangeRules: (next: Record<string, FormFieldRule>) => void
  onChangeAccepting: (accepting: boolean) => void
  className?: string
}

const RULE_OPERATORS: Array<{ value: FilterCondition['operator']; label: string }> = [
  { value: 'equals', label: 'equals' },
  { value: 'notEquals', label: 'does not equal' },
  { value: 'isNotEmpty', label: 'is answered' },
  { value: 'isEmpty', label: 'is not answered' }
]

const operatorNeedsValue = (op: FilterCondition['operator']): boolean =>
  op !== 'isEmpty' && op !== 'isNotEmpty'

function QuestionEditor({
  field,
  question,
  rule,
  otherFields,
  onChange,
  onChangeRule,
  onMove,
  onRemove
}: {
  field: GridField
  question: FormQuestion
  rule?: FormFieldRule
  /** Candidate fields a show-if rule may reference. */
  otherFields: GridField[]
  onChange: (next: FormQuestion) => void
  onChangeRule: (next: FormFieldRule | null) => void
  onMove: (direction: -1 | 1) => void
  onRemove: () => void
}): React.JSX.Element {
  const condition = rule?.when[0]

  const setCondition = useCallback(
    (next: Partial<FilterCondition> | null) => {
      if (next === null) {
        onChangeRule(null)
        return
      }
      const base: FilterCondition = condition ?? {
        columnId: otherFields[0]?.id ?? '',
        operator: 'isNotEmpty',
        value: null
      }
      onChangeRule({ when: [{ ...base, ...next }], match: 'all' })
    },
    [condition, otherFields, onChangeRule]
  )

  return (
    <div className="rounded border border-gray-200 p-2 dark:border-gray-700">
      <div className="flex items-center gap-2">
        <span className="flex-1 truncate text-sm font-medium">{field.name}</span>
        <span className="text-[10px] uppercase tracking-wide text-gray-400">{field.type}</span>
        <button
          type="button"
          aria-label={`Move ${field.name} up`}
          className="p-1 text-gray-400 hover:text-gray-600"
          onClick={() => onMove(-1)}
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label={`Move ${field.name} down`}
          className="p-1 text-gray-400 hover:text-gray-600"
          onClick={() => onMove(1)}
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label={`Remove ${field.name} from form`}
          title="Remove from form"
          className="p-1 text-gray-400 hover:text-red-600"
          onClick={onRemove}
        >
          <EyeOff className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input
          type="text"
          aria-label={`Question label for ${field.name}`}
          placeholder={field.name}
          value={question.label ?? ''}
          className="rounded border border-gray-200 bg-transparent px-2 py-1 text-sm outline-none focus:border-blue-400 dark:border-gray-700"
          onChange={(e) => onChange({ ...question, label: e.target.value || undefined })}
        />
        <input
          type="text"
          aria-label={`Helper text for ${field.name}`}
          placeholder="Helper text"
          value={question.description ?? ''}
          className="rounded border border-gray-200 bg-transparent px-2 py-1 text-sm outline-none focus:border-blue-400 dark:border-gray-700"
          onChange={(e) => onChange({ ...question, description: e.target.value || undefined })}
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={question.required ?? false}
            onChange={(e) => onChange({ ...question, required: e.target.checked || undefined })}
          />
          Required
        </label>

        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={Boolean(condition)}
            disabled={otherFields.length === 0}
            onChange={(e) => setCondition(e.target.checked ? {} : null)}
          />
          Show only when…
        </label>

        {condition && (
          <span className="flex flex-wrap items-center gap-1.5">
            <select
              aria-label="Rule field"
              value={condition.columnId}
              className="rounded border border-gray-200 bg-transparent px-1 py-0.5 dark:border-gray-700"
              onChange={(e) => setCondition({ columnId: e.target.value })}
            >
              {otherFields.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Rule operator"
              value={condition.operator}
              className="rounded border border-gray-200 bg-transparent px-1 py-0.5 dark:border-gray-700"
              onChange={(e) =>
                setCondition({ operator: e.target.value as FilterCondition['operator'] })
              }
            >
              {RULE_OPERATORS.map((op) => (
                <option key={op.value} value={op.value}>
                  {op.label}
                </option>
              ))}
            </select>
            {operatorNeedsValue(condition.operator) && (
              <input
                type="text"
                aria-label="Rule value"
                placeholder="value"
                value={condition.value == null ? '' : String(condition.value)}
                className="w-24 rounded border border-gray-200 bg-transparent px-1 py-0.5 dark:border-gray-700"
                onChange={(e) => {
                  const raw = e.target.value
                  const value: unknown =
                    raw === 'true'
                      ? true
                      : raw === 'false'
                        ? false
                        : /^-?\d+(\.\d+)?$/.test(raw)
                          ? Number(raw)
                          : raw
                  setCondition({ value })
                }}
              />
            )}
          </span>
        )}
      </div>
    </div>
  )
}

export function FormBuilder({
  fields,
  config,
  rules = {},
  accepting = true,
  audience,
  onChangeConfig,
  onChangeRules,
  onChangeAccepting,
  className
}: FormBuilderProps): React.JSX.Element {
  const askable = useMemo(
    () => fields.filter((f) => isFormFieldTypeAllowed(f.type as FieldType, audience)),
    [fields, audience]
  )
  const configured = useMemo(
    () => new Set(config.questions.map((q) => q.fieldId)),
    [config.questions]
  )
  const available = askable.filter((f) => !configured.has(f.id))
  const fieldById = useMemo(() => new Map(fields.map((f) => [f.id, f])), [fields])

  const setQuestions = useCallback(
    (questions: FormQuestion[]) => onChangeConfig({ ...config, questions }),
    [config, onChangeConfig]
  )

  const moveQuestion = useCallback(
    (index: number, direction: -1 | 1) => {
      const target = index + direction
      if (target < 0 || target >= config.questions.length) return
      const next = [...config.questions]
      const [moved] = next.splice(index, 1)
      next.splice(target, 0, moved)
      setQuestions(next)
    },
    [config.questions, setQuestions]
  )

  const removeQuestion = useCallback(
    (fieldId: string) => {
      setQuestions(config.questions.filter((q) => q.fieldId !== fieldId))
      if (rules[fieldId]) {
        const rest = { ...rules }
        delete rest[fieldId]
        onChangeRules(rest)
      }
    },
    [config.questions, rules, setQuestions, onChangeRules]
  )

  const setRule = useCallback(
    (fieldId: string, rule: FormFieldRule | null) => {
      if (rule === null) {
        const rest = { ...rules }
        delete rest[fieldId]
        onChangeRules(rest)
      } else {
        onChangeRules({ ...rules, [fieldId]: rule })
      }
    },
    [rules, onChangeRules]
  )

  return (
    <div
      data-form-builder
      className={cn('mx-auto flex w-full max-w-2xl flex-col gap-4 p-4', className)}
    >
      {/* Form meta */}
      <div className="flex flex-col gap-2">
        <input
          type="text"
          aria-label="Form title"
          placeholder="Form title"
          value={config.title ?? ''}
          className="rounded border border-gray-200 bg-transparent px-2 py-1.5 text-lg font-semibold outline-none focus:border-blue-400 dark:border-gray-700"
          onChange={(e) => onChangeConfig({ ...config, title: e.target.value || undefined })}
        />
        <textarea
          aria-label="Form description"
          placeholder="Description shown above the questions"
          value={config.description ?? ''}
          rows={2}
          className="resize-none rounded border border-gray-200 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-blue-400 dark:border-gray-700"
          onChange={(e) => onChangeConfig({ ...config, description: e.target.value || undefined })}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={accepting}
            onChange={(e) => onChangeAccepting(e.target.checked)}
          />
          Accepting responses
        </label>
      </div>

      {/* Questions */}
      <div className="flex flex-col gap-2">
        <div className="text-xs font-medium uppercase tracking-wide text-gray-400">Questions</div>
        {config.questions.map((q, index) => {
          const field = fieldById.get(q.fieldId)
          if (!field) return null
          return (
            <QuestionEditor
              key={q.fieldId}
              field={field}
              question={q}
              rule={rules[q.fieldId]}
              otherFields={askable.filter((f) => f.id !== q.fieldId)}
              onChange={(next) =>
                setQuestions(config.questions.map((cur, i) => (i === index ? next : cur)))
              }
              onChangeRule={(rule) => setRule(q.fieldId, rule)}
              onMove={(direction) => moveQuestion(index, direction)}
              onRemove={() => removeQuestion(q.fieldId)}
            />
          )
        })}
        {config.questions.length === 0 && (
          <div className="rounded border border-dashed border-gray-300 p-4 text-center text-sm text-gray-500 dark:border-gray-700">
            No questions yet — add fields below.
          </div>
        )}
      </div>

      {/* Add question */}
      {available.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-400">
            Add question
          </div>
          <div className="flex flex-wrap gap-1.5">
            {available.map((f) => (
              <button
                key={f.id}
                type="button"
                className="rounded-full border border-gray-200 px-2.5 py-1 text-xs hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                onClick={() => setQuestions([...config.questions, { fieldId: f.id }])}
              >
                + {f.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Submission settings */}
      <div className="flex flex-col gap-2">
        <div className="text-xs font-medium uppercase tracking-wide text-gray-400">
          After submission
        </div>
        <input
          type="text"
          aria-label="Submit button label"
          placeholder="Submit button label (default: Submit)"
          value={config.submitLabel ?? ''}
          className="rounded border border-gray-200 bg-transparent px-2 py-1 text-sm outline-none focus:border-blue-400 dark:border-gray-700"
          onChange={(e) => onChangeConfig({ ...config, submitLabel: e.target.value || undefined })}
        />
        <input
          type="text"
          aria-label="Confirmation title"
          placeholder="Confirmation title (default: Thanks — your response was recorded.)"
          value={config.confirmation?.title ?? ''}
          className="rounded border border-gray-200 bg-transparent px-2 py-1 text-sm outline-none focus:border-blue-400 dark:border-gray-700"
          onChange={(e) =>
            onChangeConfig({
              ...config,
              confirmation: { ...config.confirmation, title: e.target.value || undefined }
            })
          }
        />
        <textarea
          aria-label="Confirmation body"
          placeholder="Confirmation body"
          value={config.confirmation?.body ?? ''}
          rows={2}
          className="resize-none rounded border border-gray-200 bg-transparent px-2 py-1 text-sm outline-none focus:border-blue-400 dark:border-gray-700"
          onChange={(e) =>
            onChangeConfig({
              ...config,
              confirmation: { ...config.confirmation, body: e.target.value || undefined }
            })
          }
        />
      </div>
    </div>
  )
}
