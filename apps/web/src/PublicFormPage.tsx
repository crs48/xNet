/**
 * PublicFormPage — the anonymous respondent surface (exploration 0278).
 *
 * Rendered by a hard bypass in App.tsx BEFORE identity/storage boot: a
 * respondent needs no xNet account, no OPFS database, no sync connection.
 * The page fetches the owner-published definition from the issuing hub and
 * POSTs answers back with a reload-stable idempotency nonce. Submissions
 * appear in the workspace once an owner client drains the hub inbox.
 */

import type { CellValue, FormFieldRule, FormViewConfig } from '@xnetjs/data'
import { ThemeProvider } from '@xnetjs/ui'
import { FormFillView, type GridField } from '@xnetjs/views'
import { useEffect, useMemo, useState } from 'react'
import {
  clearSubmissionNonce,
  fetchPublicForm,
  getOrCreateSubmissionNonce,
  submitPublicForm,
  type PublicFormLocation,
  type PublicFormPayload
} from './lib/form-links'

type LoadState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error'; message: string }
  | { status: 'ready'; payload: PublicFormPayload }

function PublicFormBody({ token, hub }: PublicFormLocation) {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    fetchPublicForm(hub, token)
      .then((payload) => {
        if (cancelled) return
        setLoad(payload ? { status: 'ready', payload } : { status: 'missing' })
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoad({ status: 'error', message: err instanceof Error ? err.message : String(err) })
        }
      })
    return () => {
      cancelled = true
    }
  }, [hub, token])

  const model = useMemo(() => {
    if (load.status !== 'ready') return null
    const { definition } = load.payload
    const fields: GridField[] = definition.questions.map((q) => ({
      id: q.fieldId,
      name: q.label ?? q.fieldId,
      type: q.type as GridField['type'],
      config: {},
      width: 240,
      ...(q.options ? { options: q.options } : {})
    }))
    const config: FormViewConfig = {
      ...(definition.title ? { title: definition.title } : {}),
      ...(definition.description ? { description: definition.description } : {}),
      questions: definition.questions.map((q) => ({
        fieldId: q.fieldId,
        ...(q.label ? { label: q.label } : {}),
        ...(q.description ? { description: q.description } : {}),
        ...(q.required ? { required: true } : {})
      })),
      ...(definition.submitLabel ? { submitLabel: definition.submitLabel } : {}),
      ...(definition.confirmation ? { confirmation: definition.confirmation } : {})
    }
    return { fields, config, rules: definition.rules as Record<string, FormFieldRule> | undefined }
  }, [load])

  if (load.status === 'loading') {
    return <div className="p-10 text-center text-sm text-muted-foreground">Loading form…</div>
  }
  if (load.status === 'missing') {
    return (
      <div className="p-10 text-center">
        <h2 className="text-lg font-semibold">This form is unavailable</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The link may have been disabled or expired. Ask the person who shared it for a new one.
        </p>
      </div>
    )
  }
  if (load.status === 'error') {
    return (
      <div className="p-10 text-center">
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <p className="mt-2 text-sm text-muted-foreground">{load.message}</p>
      </div>
    )
  }

  const handleSubmit = async (
    cells: Record<string, CellValue>,
    extras: { honeypot: string }
  ): Promise<boolean> => {
    const nonce = getOrCreateSubmissionNonce(token)
    const ok = await submitPublicForm(hub, token, {
      nonce,
      answers: cells,
      honeypot: extras.honeypot
    })
    if (ok) clearSubmissionNonce(token)
    return ok
  }

  return (
    <FormFillView
      fields={model!.fields}
      config={model!.config}
      rules={model!.rules}
      accepting={load.payload.accepting}
      audience="public"
      onSubmit={handleSubmit}
    />
  )
}

export function PublicFormPage(location: PublicFormLocation) {
  return (
    <ThemeProvider defaultTheme="system" storageKey="xnet-web-theme">
      <div className="min-h-screen bg-background text-foreground">
        <PublicFormBody token={location.token} hub={location.hub} />
        <div className="pb-8 text-center text-xs text-muted-foreground">
          Powered by <span className="font-medium">xNet</span>
        </div>
      </div>
    </ThemeProvider>
  )
}
