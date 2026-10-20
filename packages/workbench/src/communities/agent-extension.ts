export interface ChatExtensionProposal {
  title: string
  summary: string
  source: string
}
export interface ChatPreviewNode {
  type:
    | 'stack'
    | 'grid'
    | 'card'
    | 'text'
    | 'badge'
    | 'button'
    | 'input'
    | 'document'
    | 'document-editor'
  handle?: string
  text?: string
  id?: string
  label?: string
  disabled?: boolean
  value?: string
  placeholder?: string
  maxLength?: number
  children?: ChatPreviewNode[]
}
export interface ChatPreviewMessage {
  id: string
  content: string
}
export const CHAT_PREVIEW_POLICY =
  'chat-preview-v4: durable grants and document projections; scoped live React hooks; approved private task commands; no network or host APIs'
export function readExtensionProposal(text: string): ChatExtensionProposal {
  if (text.length > 128000) throw new Error('The proposal is too large.')
  const parsed: unknown = JSON.parse(text.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, ''))
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('Expected an extension proposal.')
  const value = parsed as Record<string, unknown>
  if (
    typeof value.title !== 'string' ||
    !value.title.trim() ||
    value.title.length > 120 ||
    typeof value.summary !== 'string' ||
    value.summary.length > 2000 ||
    typeof value.source !== 'string' ||
    !value.source.trim() ||
    value.source.length > 24000
  )
    throw new Error('Extension title, summary, or source is invalid or exceeds the preview limits.')
  if (Object.keys(value).some((key) => !['title', 'summary', 'source'].includes(key)))
    throw new Error('Extension requested an unsupported field or permission.')
  return { title: value.title, summary: value.summary, source: value.source }
}
export function readPreviewTree(value: unknown): ChatPreviewNode {
  let count = 0
  let textSize = 0
  function visit(value: unknown, depth: number): ChatPreviewNode {
    if (++count > 300 || depth > 12 || !value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Invalid or oversized extension view.')
    const node = value as Record<string, unknown>
    if (
      ![
        'stack',
        'grid',
        'card',
        'text',
        'badge',
        'button',
        'input',
        'document',
        'document-editor'
      ].includes(String(node.type)) ||
      Object.keys(node).some(
        (key) =>
          ![
            'type',
            'text',
            'children',
            'id',
            'label',
            'disabled',
            'value',
            'placeholder',
            'maxLength',
            'handle'
          ].includes(key)
      )
    )
      throw new Error('Extension views may only contain supported text, layout, and controls.')
    if (
      ['document', 'document-editor'].includes(String(node.type)) &&
      (typeof node.handle !== 'string' || !/^[a-f0-9-]{36}$/.test(node.handle))
    )
      throw new Error('Invalid document handle.')
    for (const key of ['id', 'label', 'value', 'placeholder'])
      if (
        node[key] !== undefined &&
        (typeof node[key] !== 'string' || (node[key] as string).length > 2000)
      )
        throw new Error('Invalid control property.')
    if (
      node.maxLength !== undefined &&
      (!Number.isSafeInteger(node.maxLength) ||
        Number(node.maxLength) < 0 ||
        Number(node.maxLength) > 2000)
    )
      throw new Error('Invalid input length limit.')
    if (node.disabled !== undefined && typeof node.disabled !== 'boolean')
      throw new Error('Invalid disabled state.')
    if (
      ['button', 'input'].includes(String(node.type)) &&
      (typeof node.id !== 'string' || !/^element-[0-9]+$/.test(node.id))
    )
      throw new Error('Invalid control identifier.')
    if (node.text !== undefined && typeof node.text !== 'string')
      throw new Error('Extension text must be a string.')
    textSize += typeof node.text === 'string' ? node.text.length : 0
    if (textSize > 32000 || (node.children !== undefined && !Array.isArray(node.children)))
      throw new Error('Extension view exceeds its text or child limits.')
    return {
      type: node.type as ChatPreviewNode['type'],
      ...Object.fromEntries(
        ['id', 'label', 'disabled', 'value', 'placeholder', 'maxLength', 'handle']
          .filter((key) => node[key] !== undefined)
          .map((key) => [key, node[key]])
      ),
      ...(node.text !== undefined ? { text: node.text as string } : {}),
      ...(Array.isArray(node.children)
        ? { children: node.children.map((child) => visit(child, depth + 1)) }
        : {})
    }
  }
  return visit(value, 0)
}
export const watchlistSource = `import { useQuery } from '@xnetjs/react'
import { ChatMessageSchema } from '@xnetjs/data'
import { Badge } from '@xnetjs/ui'

export default function Watchlist({ channelId }: { channelId: string }) {
  const { data: messages, hasMore, error } = useQuery(ChatMessageSchema, { where: { channel: channelId }, limit: 50 })
  const films = messages.filter(message => /^watch:/i.test(message.content ?? ''))
  return <section>
    <h2>Our watchlist</h2>
    <Badge>{films.length} films on this page</Badge>
    {hasMore && <p>Showing the latest 50 messages. Use Conversation pages to browse older messages.</p>}
    {error && <p>{error.message}</p>}
    {films.map(film => <article key={film.id}>{film.content?.replace(/^watch:\\s*/i, '')}</article>)}
    {!films.length && <p>Send “Watch: a film title” in the conversation to add it here.</p>}
  </section>
}`
export const extensionExamples = [
  {
    title: 'Edit selected pages',
    summary: 'Edit approved private pages through the host-owned document editor.',
    source: `import { useQuery, useDocument, useDocumentIds } from '@xnetjs/extensions/react'
import { PageSchema } from '@xnetjs/data'
import { DocumentEditor } from '@xnetjs/extensions/ui'
function PageEditor({ id }: { id: string }) {
  const { data: page } = useQuery(PageSchema, id)
  const document = useDocument(id)
  return <article><h3>{page?.title ?? 'Page'}</h3><DocumentEditor handle={document.handle} /></article>
}
export default function Editor() {
  const ids = useDocumentIds()
  return <section><h2>Edit selected pages</h2>{ids.map(id => <PageEditor key={id} id={id} />)}
    {!ids.length && <p>Choose pages and approve document editing in Data access.</p>}
  </section>
}`
  },
  {
    title: 'Selected documents',
    summary:
      'Live text from pages you explicitly approve, without attachments or embedded records.',
    source: `import { useQuery, useDocument, useDocumentIds } from '@xnetjs/extensions/react'
import { DocumentView } from '@xnetjs/extensions/ui'
import { PageSchema } from '@xnetjs/data'
function Page({ id }: { id: string }) {
  const { data: page } = useQuery(PageSchema, id)
  const document = useDocument(id)
  return <article><h3>{page?.title ?? 'Page'}</h3><DocumentView handle={document.handle} /></article>
}
export default function Documents() {
  const ids = useDocumentIds()
  return <section><h2>Selected documents</h2>{ids.map(id => <Page key={id} id={id} />)}</section>
}`
  },
  {
    title: 'Our watchlist',
    summary:
      'Films from real messages starting with “Watch:”. Updates as the conversation changes.',
    source: watchlistSource
  },
  {
    title: 'Conversation index',
    summary: 'Names and message counts from the conversations you allow.',
    source: `import { useQuery } from '@xnetjs/react'
import { ChannelSchema, ChatMessageSchema } from '@xnetjs/data'
import { Badge } from '@xnetjs/ui'
export default function Conversations() {
  const { data: channels } = useQuery(ChannelSchema)
  const { data: messages, hasMore, error } = useQuery(ChatMessageSchema, {limit: 50})
  return <section>{hasMore && <p>Counts show only the latest 50 messages across these conversations.</p>}{error && <p>{error.message}</p>}{channels.map(channel => <article key={channel.id}>
    <h2>{channel.name}</h2>
    <Badge>{messages.filter(message => message.channel === channel.id).length} messages on this page</Badge>
  </article>)}</section>
}`
  },
  {
    title: 'Conversation pages',
    summary: 'Browse approved conversation history in small pages, with live updates.',
    source: `import {useState} from 'react'
import {useQuery} from '@xnetjs/react'
import {ChatMessageSchema} from '@xnetjs/data'
import {Button} from '@xnetjs/ui'
export default function Messages({channelId}) {
  const [after, setAfter] = useState(undefined)
  const {data, pageInfo, hasMore, loading, error} = useQuery(ChatMessageSchema, {
    where: {channel: channelId}, orderBy: {createdAt: 'desc'}, page: {first: 20, after, count: 'none'}
  })
  return <section><h2>Conversation pages</h2><p>{data.length} messages on this page</p>
    {loading && <p>Loading messages…</p>}{error && <p>{error.message}</p>}
    {data.map(message => <article key={message.id}><p>{message.content}</p></article>)}
    <Button disabled={!hasMore || loading} onClick={() => setAfter(pageInfo.endCursor)}>Older messages</Button>
    <Button disabled={!after} onClick={() => setAfter(undefined)}>Latest messages</Button>
  </section>
}`
  },
  {
    title: 'Selected tasks',
    summary:
      'Interactive tasks using real useQuery and useMutate hooks. Select tasks and allow editing below.',
    source: `import { useState } from 'react'
import { useQuery, useMutate } from '@xnetjs/react'
import { TaskSchema } from '@xnetjs/data'
import { Badge, Button } from '@xnetjs/ui'
export default function Tasks() {
  const { update, create, isPending } = useMutate()
  const [error, setError] = useState('')
  const [title, setTitle] = useState('')
  const [after, setAfter] = useState(undefined)
  const { data: tasks, hasMore, pageInfo, error: queryError } = useQuery(TaskSchema, { orderBy: { updatedAt: 'desc' }, page: {first: 20, after, count: 'none'} })
  return <section><h2>My selected tasks</h2><Badge>{tasks.length} tasks</Badge>
    {tasks.map(task => <article key={task.id}><p>{task.title}</p><Badge>{task.status}</Badge>
      <Button disabled={isPending} onClick={async () => { try { setError(''); await update(TaskSchema, task.id, { status: task.status === 'done' ? 'todo' : 'done', completed: task.status !== 'done' }) } catch (error) { setError(String(error)) } }}>{task.status === 'done' ? 'Reopen task' : 'Complete task'}</Button>
    </article>)}
    {queryError && <p>{queryError.message}</p>}
    <Button disabled={!hasMore} onClick={() => setAfter(pageInfo.endCursor)}>More tasks</Button>
    <Button disabled={!after} onClick={() => setAfter(undefined)}>First tasks</Button>
    <input aria-label="New task title" value={title} onInput={event => setTitle(event.currentTarget.value)} />
    <Button disabled={isPending || !title.trim()} onClick={async () => { try { setError(''); await create(TaskSchema, { title: title.trim(), status: 'todo' }); setTitle('') } catch (error) { setError(String(error)) } }}>Add private task</Button>
    {error && <p>{error}</p>}
  </section>
}`
  }
]
