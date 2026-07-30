/**
 * FormShareBar — "share this form publicly" strip above the form view
 * (exploration 0278).
 *
 * Mints a hashed token on the connected hub with the sanitized definition
 * snapshot, shows the public URL (only this device knows it — share-link
 * discipline), and keeps the snapshot + accepting flag fresh as the owner
 * edits the form. Respondents hit the session-less /form/<token> page.
 */

import type { FormFieldRule, FormViewConfig } from '@xnetjs/data'
import { Check, Copy, Globe, RefreshCw, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  publishableDefinition,
  useFormLinks,
  type FormFieldForPublish
} from '../hooks/useFormLinks'

export interface FormShareBarProps {
  viewId: string
  databaseId: string
  space: string | null
  accepting: boolean
  config: FormViewConfig | null
  rules: Record<string, FormFieldRule>
  fields: FormFieldForPublish[]
}

export function FormShareBar({
  viewId,
  databaseId,
  space,
  accepting,
  config,
  rules,
  fields
}: FormShareBarProps) {
  const { forms, ready, createForm, updateForm, deleteForm } = useFormLinks(viewId)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const link = forms.find((f) => !f.disabled) ?? null
  const definition = useMemo(
    () => publishableDefinition(config, rules, fields),
    [config, rules, fields]
  )

  // Keep the published snapshot + accepting flag in step with local edits
  // (debounced; whole-snapshot PATCH, so it is naturally idempotent).
  const publishedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!link) return
    const snapshot = JSON.stringify({ definition, accepting })
    if (publishedRef.current === null) {
      publishedRef.current = snapshot
      return
    }
    if (publishedRef.current === snapshot) return
    const timer = setTimeout(() => {
      publishedRef.current = snapshot
      void updateForm(link.tokenHash, { definition, accepting }).catch(() => {
        publishedRef.current = null // retry on next change
      })
    }, 1_500)
    return () => clearTimeout(timer)
  }, [link, definition, accepting, updateForm])

  if (!ready) return null

  const handleCreate = async () => {
    setBusy(true)
    setError(null)
    try {
      await createForm({ databaseId, space: space ?? databaseId, definition })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const handleCopy = async () => {
    if (!link?.url) return
    await navigator.clipboard.writeText(link.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div
      data-form-share-bar
      className="flex flex-wrap items-center gap-2 border-b border-border bg-secondary/50 px-3 py-1.5 text-xs"
    >
      <Globe className="h-3.5 w-3.5 text-gray-400" />
      {link ? (
        <>
          <span className="text-gray-500">Public link</span>
          {link.url ? (
            <>
              <code className="max-w-[320px] truncate rounded bg-surface-2 px-1.5 py-0.5">
                {link.url}
              </code>
              <button
                type="button"
                aria-label="Copy public form link"
                className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5 hover:bg-accent"
                onClick={() => void handleCopy()}
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </>
          ) : (
            <span className="text-gray-500">
              created on another device — revoke and re-create to get the URL here
            </span>
          )}
          {link.pending > 0 && (
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
              {link.pending} pending
            </span>
          )}
          {link.rejected > 0 && (
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-red-700 dark:bg-red-900/30 dark:text-red-300">
              {link.rejected} rejected
            </span>
          )}
          <button
            type="button"
            aria-label="Republish form definition"
            title="Publish the current questions to the public link now"
            className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5 hover:bg-accent"
            onClick={() => {
              void updateForm(link.tokenHash, { definition, accepting })
            }}
          >
            <RefreshCw className="h-3 w-3" /> Publish
          </button>
          <button
            type="button"
            aria-label="Revoke public form link"
            className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
            onClick={() => {
              if (window.confirm('Revoke this public link? The URL will stop working.')) {
                void deleteForm(link.tokenHash)
              }
            }}
          >
            <Trash2 className="h-3 w-3" /> Revoke
          </button>
        </>
      ) : (
        <button
          type="button"
          disabled={busy || definition.questions.length === 0}
          title={
            definition.questions.length === 0
              ? 'Add at least one public-safe question first'
              : 'Create a public link anyone can submit to'
          }
          className="rounded border border-border px-2 py-0.5 hover:bg-accent disabled:opacity-50"
          onClick={() => void handleCreate()}
        >
          {busy ? 'Creating…' : 'Share form publicly'}
        </button>
      )}
      {error && <span className="text-red-600">{error}</span>}
    </div>
  )
}
