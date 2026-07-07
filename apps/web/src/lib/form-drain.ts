/**
 * Form submission drain core (exploration 0278).
 *
 * The materialization half of the public-form trust model: the hub only
 * quarantines anonymous submissions; a signing client of the form's creator
 * validates each pending submission against the *current* fields, writes it
 * as a DatabaseRow under this identity's DID, then acks it off the hub.
 * Row ids derive from (tokenHash, nonce), so a drain raced by another
 * device or retried after a crash LWW-upserts instead of duplicating.
 * Submissions that no longer validate (field deleted/retyped since
 * submission) are marked rejected on the hub — kept for review, never
 * silently dropped.
 *
 * Pure over its two ports (hub `request`, workspace `store`) so it is
 * directly testable without React.
 */

import {
  createRow,
  getDatabaseSelectOptions,
  getFields,
  submissionRowId,
  validateFormSubmission,
  type CellValue,
  type ColumnDefinition,
  type FormFieldRule,
  type FormViewConfig,
  type NodeStore
} from '@xnetjs/data'

export type HubRequest = (
  path: string,
  init?: { method?: string; body?: unknown }
) => Promise<unknown>

export type HubFormSummary = {
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

export type DrainResult = { pendingTotal: number; rejectedTotal: number }

/** Current validation context for one form: live columns + view config. */
async function formContext(store: NodeStore, form: HubFormSummary) {
  const [fields, options, viewNode] = await Promise.all([
    getFields(store, form.databaseId),
    getDatabaseSelectOptions(store, form.databaseId),
    store.get(form.viewId)
  ])
  if (!viewNode) return null // view deleted → leave pending for review
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
  const config = (viewNode.properties.formConfig as FormViewConfig | undefined) ?? { questions: [] }
  const rules = viewNode.properties.formRules as Record<string, FormFieldRule> | undefined
  return { columns, config, rules }
}

/** Validate + materialize one submission; returns 'acked' or 'rejected'. */
async function drainSubmission(
  store: NodeStore,
  request: HubRequest,
  form: HubFormSummary,
  context: NonNullable<Awaited<ReturnType<typeof formContext>>>,
  submission: HubSubmission
): Promise<'acked' | 'rejected'> {
  const result = validateFormSubmission(
    context.config,
    context.rules,
    submission.answers as Record<string, CellValue>,
    context.columns,
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
    return 'rejected'
  }
  await createRow(store, {
    databaseId: form.databaseId,
    cells: result.cells,
    id: await submissionRowId(form.tokenHash, submission.nonce),
    submissionMeta: {
      via: 'form',
      viewId: form.viewId,
      nonce: submission.nonce,
      submittedAt: submission.receivedAt
    }
  })
  return 'acked'
}

async function drainForm(
  store: NodeStore,
  request: HubRequest,
  form: HubFormSummary
): Promise<number> {
  const { submissions = [] } = (await request(
    `/forms/${encodeURIComponent(form.tokenHash)}/submissions?status=pending`
  )) as { submissions?: HubSubmission[] }
  if (submissions.length === 0) return 0

  const context = await formContext(store, form)
  if (!context) return 0

  let rejected = 0
  const acked: string[] = []
  for (const submission of submissions) {
    const outcome = await drainSubmission(store, request, form, context, submission)
    if (outcome === 'acked') acked.push(submission.nonce)
    else rejected += 1
  }
  if (acked.length > 0) {
    await request(`/forms/${encodeURIComponent(form.tokenHash)}/submissions/ack`, {
      method: 'POST',
      body: { nonces: acked }
    })
  }
  return rejected
}

/**
 * Drain every pending submission across this creator's forms into signed
 * rows, then report the post-drain pending/rejected totals from the hub.
 */
export async function drainFormInboxes(
  store: NodeStore,
  request: HubRequest
): Promise<DrainResult> {
  const { forms = [] } = (await request('/forms')) as { forms?: HubFormSummary[] }
  let rejectedTotal = 0
  for (const form of forms) {
    rejectedTotal += form.rejected
    if (form.pending > 0) rejectedTotal += await drainForm(store, request, form)
  }
  const after = (await request('/forms')) as { forms?: HubFormSummary[] }
  const pendingTotal = (after.forms ?? []).reduce((sum, f) => sum + f.pending, 0)
  return { pendingTotal, rejectedTotal }
}
