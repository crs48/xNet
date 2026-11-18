import type { ExtensionSelection } from './extension-access'
import type { ExtensionAccessIntent } from './extension-access-intent'
import type { CommunityData } from './use-community-data'
import { PageSchema, TaskSchema } from '@xnetjs/data'
import { LockKeyhole, Check } from 'lucide-react'
import { needsDataSelection, suggestedExtensionAccess } from './extension-access'
import { ExtensionDataPicker } from './ExtensionDataPicker'
import { primaryButton, secondaryButton } from './primitives'

export function ExtensionAccessPrompt({
  title,
  data,
  selection,
  intent,
  busy,
  upgrade = false,
  onChange,
  onAllow,
  onDeny
}: {
  title: string
  data: CommunityData
  selection: ExtensionSelection
  intent?: ExtensionAccessIntent
  busy?: boolean
  upgrade?: boolean
  onChange?: (selection: ExtensionSelection) => void
  onAllow: () => void
  onDeny: () => void
}) {
  const taskCount = selection.records.filter(
    (record) => record.schemaId === TaskSchema._schemaId
  ).length
  const pageCount = selection.records.filter(
    (record) => record.schemaId === PageSchema._schemaId
  ).length
  const needsChoice = !!intent && needsDataSelection(intent, selection)
  const actions = [
    ...selection.channelIds.map(
      (id) =>
        `Read messages in ${data.channels.find((channel) => channel.id === id)?.name || 'this chat'}, including new messages`
    ),
    ...(selection.taskWrites?.create ? ['Create and edit its own private tasks'] : []),
    ...(taskCount
      ? [
          `${selection.taskWrites?.ids.length ? 'Read and edit' : 'Read'} ${taskCount} selected ${taskCount === 1 ? 'task' : 'tasks'}`
        ]
      : []),
    ...(selection.taskWrites?.remove ? ['Delete and restore tasks it can edit'] : []),
    ...(pageCount
      ? [
          `Read ${pageCount} selected ${pageCount === 1 ? 'page' : 'pages'}${selection.documents?.read.length ? ', including text' : ' (titles and icons)'}`
        ]
      : []),
    ...(selection.documents?.write?.length
      ? [
          `Edit text in ${selection.documents.write.length} selected private ${selection.documents.write.length === 1 ? 'page' : 'pages'}`
        ]
      : []),
    ...(selection.containers?.length
      ? [
          `Read task and page details in ${selection.containers.length} selected folders or spaces, including new items`
        ]
      : [])
  ]
  return (
    <section
      aria-label={upgrade ? 'Additional extension access' : 'Extension access request'}
      className="space-y-4 rounded-2xl border border-border bg-background p-4 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-muted p-2">
          <LockKeyhole size={18} aria-hidden="true" />
        </div>
        <div>
          <h3 className="text-sm font-semibold">
            {upgrade
              ? 'Allow additional access?'
              : actions.length || needsChoice
                ? 'Allow access?'
                : 'Ready to try'}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {title}
            {actions.length || needsChoice
              ? ' needs permission to:'
              : ' runs without access to your data.'}
          </p>
        </div>
      </div>
      {!!actions.length && (
        <ul className="space-y-2 text-xs leading-5">
          {actions.map((action) => (
            <li key={action} className="flex items-start gap-2">
              <Check size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>{action}</span>
            </li>
          ))}
        </ul>
      )}
      {intent && onChange && (intent.tasks || intent.pages || intent.conversations) && (
        <details open={needsChoice || undefined} className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">
            {needsChoice ? 'Choose the data to use' : 'Use different or existing data…'}
          </summary>
          <div className="mt-3">
            <ExtensionDataPicker
              data={data}
              selection={selection}
              intent={intent}
              onChange={(next) =>
                onChange(suggestedExtensionAccess(intent, selection.channelIds[0] ?? '', next))
              }
            />
          </div>
        </details>
      )}
      <p className="text-xs text-muted-foreground">
        {selection.taskWrites?.create && !taskCount ? 'Your other tasks stay private. ' : ''}You can
        revoke access at any time.
      </p>
      <div className="flex gap-2">
        <button className={secondaryButton} disabled={busy} onClick={onDeny}>
          Don’t allow
        </button>
        <button className={primaryButton} disabled={busy || needsChoice} onClick={onAllow}>
          {busy ? 'Opening…' : actions.length || needsChoice ? 'Allow access' : 'Open extension'}
        </button>
      </div>
    </section>
  )
}
