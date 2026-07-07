/**
 * Form submission drain agent (exploration 0278).
 *
 * The materialization half of the public-form trust model: the hub only
 * quarantines anonymous submissions; THIS client — an authenticated,
 * signing device of the form's creator — validates each pending submission
 * against the *current* fields and writes it as a DatabaseRow under this
 * identity's DID, then acks it off the hub. Row ids derive from
 * (tokenHash, nonce), so a drain raced by another device or retried after
 * a crash LWW-upserts instead of duplicating. Submissions that no longer
 * validate (field deleted/retyped since submission) are marked rejected on
 * the hub — kept for human review, never silently dropped.
 */

import {
  submissionRowId,
  validateFormSubmission,
  createRow,
  getFields,
  getDatabaseSelectOptions,
  type CellValue,
  type ColumnDefinition,
  type FormFieldRule,
  type FormViewConfig
} from '@xnetjs/data'
import { useNodeStore, useXNet } from '@xnetjs/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { hubApiFetch, normalizeHubHttpUrl } from '../lib/share-links'

const DRAIN_INTERVAL_MS = 60_000

type HubForm = {
  tokenHash: string
  viewId: string
  databaseId: string
  pending: number
  rejected: number
}

type HubSubmission = {
  nonce: string
  answers: Record<string, unknown>
  receivedAt: number
}

export function useFormSubmissionDrain(): { pendingTotal: number; rejectedTotal: number } {
  const { hubUrl, getHubAuthToken } = useXNet()
  const { store, isReady } = useNodeStore()
  const [pendingTotal, setPendingTotal] = useState(0)
  const [rejectedTotal, setRejectedTotal] = useState(0)
  const drainingRef = useRef(false)

  const drain = useCallback(async (): Promise<void> => {
    if (drainingRef.current) return
    if (!hubUrl || !getHubAuthToken || !store || !isReady) return
    drainingRef.current = true
    try {
      const hubHttpUrl = normalizeHubHttpUrl(hubUrl)
      const token = await getHubAuthToken()
      const request = (path: string, init?: { method?: string; body?: unknown }) =>
        hubApiFetch(hubHttpUrl, token, path, init)

      const { forms = [] } = (await request('/forms')) as { forms?: HubForm[] }
      let rejected = 0

      for (const form of forms) {
        rejected += form.rejected
        if (form.pending === 0) continue

        const { submissions = [] } = (await request(
          `/forms/${encodeURIComponent(form.tokenHash)}/submissions?status=pending`
        )) as { submissions?: HubSubmission[] }
        if (submissions.length === 0) continue

        // Current truth: fields + options + the view's form config.
        const [fields, options, viewNode] = await Promise.all([
          getFields(store, form.databaseId),
          getDatabaseSelectOptions(store, form.databaseId),
          store.get(form.viewId)
        ])
        if (!viewNode) continue // view deleted → leave pending for review
        const optionsByField = new Map<string, Array<{ id: string; name: string }>>()
        for (const option of options) {
          const list = optionsByField.get(option.field) ?? []
          list.push({ id: option.id, name: option.name })
          optionsByField.set(option.field, list)
        }
        const columns: ColumnDefinition[] = fields.map((f) => ({
          id: f.id,
          name: f.name,
          type: f.type as ColumnDefinition['type'],
          config: {
            ...f.config,
            ...(optionsByField.has(f.id) ? { options: optionsByField.get(f.id) } : {})
          } as ColumnDefinition['config']
        }))
        const config = (viewNode.properties.formConfig as FormViewConfig | undefined) ?? {
          questions: []
        }
        const rules = viewNode.properties.formRules as Record<string, FormFieldRule> | undefined

        const acked: string[] = []
        for (const submission of submissions) {
          const result = validateFormSubmission(
            config,
            rules,
            submission.answers as Record<string, CellValue>,
            columns,
            'public'
          )
          if (!result.ok) {
            await request(`/forms/${encodeURIComponent(form.tokenHash)}/submissions/reject`, {
              method: 'POST',
              body: {
                nonce: submission.nonce,
                reasons: result.errors.map((e) => `${e.reason}:${e.fieldId}`)
              }
            })
            rejected += 1
            continue
          }
          const rowId = await submissionRowId(form.tokenHash, submission.nonce)
          await createRow(store, {
            databaseId: form.databaseId,
            cells: result.cells,
            id: rowId,
            submissionMeta: {
              via: 'form',
              viewId: form.viewId,
              nonce: submission.nonce,
              submittedAt: submission.receivedAt
            }
          })
          acked.push(submission.nonce)
        }
        if (acked.length > 0) {
          await request(`/forms/${encodeURIComponent(form.tokenHash)}/submissions/ack`, {
            method: 'POST',
            body: { nonces: acked }
          })
        }
      }

      // After draining, everything valid is materialized: pending should be 0
      // unless a view was missing; refresh the counts from the hub.
      const after = (await request('/forms')) as { forms?: HubForm[] }
      setPendingTotal((after.forms ?? []).reduce((sum, f) => sum + f.pending, 0))
      setRejectedTotal(rejected)
    } catch {
      // Offline or hub unreachable — the inbox is durable; try again next tick.
    } finally {
      drainingRef.current = false
    }
  }, [hubUrl, getHubAuthToken, store, isReady])

  useEffect(() => {
    if (!isReady) return
    void drain()
    const timer = setInterval(() => {
      void drain()
    }, DRAIN_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [isReady, drain])

  return { pendingTotal, rejectedTotal }
}
