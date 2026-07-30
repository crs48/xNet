/**
 * FormView — the in-workspace form view surface (exploration 0278).
 *
 * One component serves both shells (web/electron): an editable Build tab
 * (FormBuilder) and a Preview tab that IS the live form (FormFillView) —
 * submitting from Preview creates a real row, so workspace members can use
 * the form for internal intake without a public link.
 */

import type { FormFillViewProps } from './FormFillView.js'
import type { GridField } from '../grid/model.js'
import type { CellValue, FormFieldRule, FormViewConfig } from '@xnetjs/data'
import { cn } from '@xnetjs/ui'
import React, { useState } from 'react'
import { FormBuilder } from './FormBuilder.js'
import { FormFillView } from './FormFillView.js'

export interface FormViewProps {
  fields: GridField[]
  config: FormViewConfig | null
  rules?: Record<string, FormFieldRule>
  accepting?: boolean
  databaseTitle?: string
  /** Create the row from a validated submission; resolve false on failure. */
  onSubmit: (cells: Record<string, CellValue>) => Promise<boolean>
  /** Editors get the Build tab; readers only see the fill form. */
  editable?: boolean
  onChangeConfig?: (next: FormViewConfig) => void
  onChangeRules?: (next: Record<string, FormFieldRule>) => void
  onChangeAccepting?: (accepting: boolean) => void
  onUploadFile?: FormFillViewProps['onUploadFile']
  onResolveFileUrl?: FormFillViewProps['onResolveFileUrl']
  className?: string
}

export const EMPTY_FORM_CONFIG: FormViewConfig = { questions: [] }

export function FormView({
  fields,
  config,
  rules,
  accepting = true,
  databaseTitle,
  onSubmit,
  editable = false,
  onChangeConfig,
  onChangeRules,
  onChangeAccepting,
  onUploadFile,
  onResolveFileUrl,
  className
}: FormViewProps): React.JSX.Element {
  // Fresh form views open in Build so the owner immediately adds questions.
  const effective = config ?? EMPTY_FORM_CONFIG
  const [tab, setTab] = useState<'build' | 'preview'>(
    editable && effective.questions.length === 0 ? 'build' : 'preview'
  )

  const fill = (
    <FormFillView
      // Remount when config changes so the preview resets stale answers to
      // questions that were just removed/re-ordered.
      key={JSON.stringify(effective.questions.map((q) => q.fieldId))}
      fields={fields}
      config={effective}
      rules={rules}
      accepting={accepting}
      databaseTitle={databaseTitle}
      audience="workspace"
      onSubmit={(cells) => onSubmit(cells)}
      onUploadFile={onUploadFile}
      onResolveFileUrl={onResolveFileUrl}
    />
  )

  if (!editable) {
    return (
      <div data-form-view className={cn('h-full overflow-y-auto', className)}>
        {fill}
      </div>
    )
  }

  return (
    <div data-form-view className={cn('flex h-full flex-col', className)}>
      <div
        role="tablist"
        aria-label="Form mode"
        className="flex items-center gap-1 border-b border-gray-200 px-3 py-1.5 dark:border-gray-700"
      >
        {(['build', 'preview'] as const).map((mode) => (
          <button
            key={mode}
            role="tab"
            aria-selected={tab === mode}
            className={cn(
              'rounded px-2 py-1 text-xs font-medium capitalize',
              tab === mode
                ? 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100'
                : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800/50'
            )}
            onClick={() => setTab(mode)}
          >
            {mode}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {tab === 'build' ? (
          <FormBuilder
            fields={fields}
            config={effective}
            rules={rules}
            accepting={accepting}
            audience="workspace"
            onChangeConfig={(next) => onChangeConfig?.(next)}
            onChangeRules={(next) => onChangeRules?.(next)}
            onChangeAccepting={(next) => onChangeAccepting?.(next)}
          />
        ) : (
          fill
        )}
      </div>
    </div>
  )
}
