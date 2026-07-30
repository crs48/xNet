/**
 * FormFillView — the respondent-facing side of a form view (exploration 0278).
 *
 * Renders the configured questions as a stacked form using the same
 * `getPropertyHandler` editors the grid/peek/SchemaForm use, evaluates
 * show-if rules live against the in-progress answers, validates with the
 * shared `validateFormSubmission` core, and hands the accepted cell map to
 * the caller (workspace shells create the row directly; the public page
 * POSTs to the hub form inbox).
 */

import type { GridField } from '../grid/model.js'
import type {
  CellValue,
  ColumnDefinition,
  FileRef,
  FormAudience,
  FormFieldRule,
  FormViewConfig
} from '@xnetjs/data'
import { validateFormSubmission, visibleFormQuestions } from '@xnetjs/data'
import { cn } from '@xnetjs/ui'
import React, { useCallback, useMemo, useState } from 'react'
import { getPropertyHandler } from '../properties/index.js'

export interface FormFillViewProps {
  /** All database fields (options resolved); questions reference these. */
  fields: GridField[]
  config: FormViewConfig
  rules?: Record<string, FormFieldRule>
  /** When false, shows the closed message instead of the form. */
  accepting?: boolean
  /** Fallback form title when the config has none. */
  databaseTitle?: string
  audience: FormAudience
  /**
   * Persist the validated submission. Resolve true on success (shows the
   * confirmation screen), false to keep the form editable with a generic
   * failure notice.
   */
  onSubmit: (cells: Record<string, CellValue>, extras: { honeypot: string }) => Promise<boolean>
  onUploadFile?: (file: File) => Promise<FileRef | null>
  onResolveFileUrl?: (ref: FileRef) => Promise<string>
  className?: string
}

/** GridField → ColumnDefinition (options folded into config for validation). */
export function formFieldsToColumns(fields: GridField[]): ColumnDefinition[] {
  return fields.map((f) => ({
    id: f.id,
    name: f.name,
    type: f.type as ColumnDefinition['type'],
    config: { ...f.config, options: f.options } as ColumnDefinition['config']
  }))
}

const ERROR_COPY: Record<string, string> = {
  required: 'This question is required.',
  'bad-option': 'Pick one of the listed options.',
  'bad-value': 'This answer does not match the question type.',
  'unknown-field': 'This question no longer exists.',
  'type-not-allowed': 'This question type cannot be answered here.'
}

function QuestionRow({
  field,
  label,
  description,
  required,
  value,
  error,
  onChange,
  onCreateOption,
  onUploadFile,
  onResolveFileUrl
}: {
  field: GridField
  label: string
  description?: string
  required?: boolean
  value: CellValue
  error?: string
  onChange: (next: CellValue) => void
  onCreateOption?: (fieldId: string, name: string) => Promise<string | null>
  onUploadFile?: FormFillViewProps['onUploadFile']
  onResolveFileUrl?: FormFillViewProps['onResolveFileUrl']
}): React.JSX.Element {
  const handler = getPropertyHandler(field.type)
  const config = {
    ...field.config,
    options: field.options,
    ...(onCreateOption ? { onCreateOption: (name: string) => onCreateOption(field.id, name) } : {}),
    ...(onUploadFile ? { onUploadFile } : {}),
    ...(onResolveFileUrl ? { onResolveFileUrl } : {})
  }

  return (
    <div className="flex flex-col gap-1 py-3">
      <label className="text-sm font-medium text-gray-800 dark:text-gray-200">
        {label}
        {required && (
          <span aria-label="required" className="ml-0.5 text-red-500">
            *
          </span>
        )}
      </label>
      {description && <div className="text-xs text-gray-500 dark:text-gray-400">{description}</div>}
      <div className="min-h-[36px] rounded border border-gray-200 px-2 py-1 focus-within:border-blue-400 dark:border-gray-700">
        <handler.Editor
          value={value as never}
          config={config}
          onChange={(next) => onChange(next as CellValue)}
          onCommit={(next) => onChange((next ?? value) as CellValue)}
        />
      </div>
      {error && (
        <div role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </div>
      )}
    </div>
  )
}

export function FormFillView({
  fields,
  config,
  rules,
  accepting = true,
  databaseTitle,
  audience,
  onSubmit,
  onUploadFile,
  onResolveFileUrl,
  className
}: FormFillViewProps): React.JSX.Element {
  const [answers, setAnswers] = useState<Record<string, CellValue>>({})
  const [honeypot, setHoneypot] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [state, setState] = useState<'editing' | 'submitted' | 'failed'>('editing')

  const columns = useMemo(() => formFieldsToColumns(fields), [fields])
  const fieldById = useMemo(() => new Map(fields.map((f) => [f.id, f])), [fields])
  const questions = useMemo(
    () => visibleFormQuestions(config, rules, answers, columns, audience),
    [config, rules, answers, columns, audience]
  )

  const setAnswer = useCallback((fieldId: string, next: CellValue) => {
    setAnswers((prev) => ({ ...prev, [fieldId]: next }))
    setErrors((prev) => {
      if (!(fieldId in prev)) return prev
      const rest = { ...prev }
      delete rest[fieldId]
      return rest
    })
  }, [])

  const handleSubmit = useCallback(async () => {
    const result = validateFormSubmission(config, rules, answers, columns, audience)
    if (!result.ok) {
      const next: Record<string, string> = {}
      for (const err of result.errors) {
        next[err.fieldId] = ERROR_COPY[err.reason] ?? 'Invalid answer.'
      }
      setErrors(next)
      return
    }
    setErrors({})
    setSubmitting(true)
    try {
      const ok = await onSubmit(result.cells, { honeypot })
      setState(ok ? 'submitted' : 'failed')
    } catch {
      setState('failed')
    } finally {
      setSubmitting(false)
    }
  }, [config, rules, answers, columns, audience, honeypot, onSubmit])

  const title = config.title || databaseTitle || 'Untitled form'

  if (!accepting) {
    return (
      <div data-form-fill className={cn('mx-auto w-full max-w-xl p-6 text-center', className)}>
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-gray-500">This form is no longer accepting responses.</p>
      </div>
    )
  }

  if (state === 'submitted') {
    return (
      <div data-form-fill className={cn('mx-auto w-full max-w-xl p-6 text-center', className)}>
        <h2 className="text-xl font-semibold">
          {config.confirmation?.title || 'Thanks — your response was recorded.'}
        </h2>
        {config.confirmation?.body && (
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            {config.confirmation.body}
          </p>
        )}
      </div>
    )
  }

  return (
    <div data-form-fill className={cn('mx-auto w-full max-w-xl p-6', className)}>
      <h2 className="text-xl font-semibold">{title}</h2>
      {config.description && (
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{config.description}</p>
      )}

      <form
        className="mt-4 flex flex-col"
        onSubmit={(e) => {
          e.preventDefault()
          void handleSubmit()
        }}
      >
        {questions.map((q) => {
          const field = fieldById.get(q.fieldId)
          if (!field) return null
          return (
            <QuestionRow
              key={q.fieldId}
              field={field}
              label={q.label || field.name}
              description={q.description}
              required={q.required}
              value={answers[q.fieldId] ?? null}
              error={errors[q.fieldId]}
              onChange={(next) => setAnswer(q.fieldId, next)}
              onUploadFile={audience === 'workspace' ? onUploadFile : undefined}
              onResolveFileUrl={onResolveFileUrl}
            />
          )
        })}
        {questions.length === 0 && (
          <div className="py-6 text-center text-sm text-gray-500">
            No questions yet. Add questions in the form builder.
          </div>
        )}

        {/* Honeypot: invisible to humans, auto-filled by dumb bots. */}
        <input
          type="text"
          name="website"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
          autoComplete="off"
          tabIndex={-1}
          aria-hidden="true"
          className="hidden"
        />

        {state === 'failed' && (
          <div role="alert" className="py-2 text-sm text-red-600 dark:text-red-400">
            Something went wrong submitting your response. Please try again.
          </div>
        )}

        <div className="pt-4">
          <button
            type="submit"
            disabled={submitting || questions.length === 0}
            className="rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? 'Submitting…' : config.submitLabel || 'Submit'}
          </button>
        </div>
      </form>
    </div>
  )
}
