export interface ChatExtensionProposal {
  title: string
  summary: string
  source: string
}
export interface ChatPreviewNode {
  type: 'stack' | 'grid' | 'card' | 'text' | 'badge'
  text?: string
  children?: ChatPreviewNode[]
}
export interface ChatPreviewMessage {
  id: string
  content: string
}
export const CHAT_PREVIEW_POLICY =
  'chat-preview-v2: approved live records; React useQuery; read-only; no network or host APIs'
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
      !['stack', 'grid', 'card', 'text', 'badge'].includes(String(node.type)) ||
      Object.keys(node).some((key) => !['type', 'text', 'children'].includes(key))
    )
      throw new Error('Extension views may only contain text and layout nodes.')
    if (node.text !== undefined && typeof node.text !== 'string')
      throw new Error('Extension text must be a string.')
    textSize += typeof node.text === 'string' ? node.text.length : 0
    if (textSize > 32000 || (node.children !== undefined && !Array.isArray(node.children)))
      throw new Error('Extension view exceeds its text or child limits.')
    return {
      type: node.type as ChatPreviewNode['type'],
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
  const { data: messages } = useQuery(ChatMessageSchema, { where: { channel: channelId } })
  const films = messages.filter(message => /^watch:/i.test(message.content ?? ''))
  return <section>
    <h2>Our watchlist</h2>
    <Badge>{films.length} films</Badge>
    {films.map(film => <article key={film.id}>{film.content?.replace(/^watch:\\s*/i, '')}</article>)}
    {!films.length && <p>Send “Watch: a film title” in the conversation to add it here.</p>}
  </section>
}`
export const extensionExamples = [
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
  const { data: messages } = useQuery(ChatMessageSchema)
  return <section>{channels.map(channel => <article key={channel.id}>
    <h2>{channel.name}</h2>
    <Badge>{messages.filter(message => message.channel === channel.id).length} messages</Badge>
  </article>)}</section>
}`
  },
  {
    title: 'Selected tasks',
    summary: 'A task list using useQuery(TaskSchema). Choose individual tasks below.',
    source: `import { useQuery } from '@xnetjs/react'
import { TaskSchema } from '@xnetjs/data'
import { Badge } from '@xnetjs/ui'
export default function Tasks() {
  const { data: tasks } = useQuery(TaskSchema, { orderBy: { updatedAt: 'desc' } })
  return <section><h2>My selected tasks</h2><Badge>{tasks.length} tasks</Badge>
    {tasks.map(task => <article key={task.id}><p>{task.title}</p><Badge>{task.status}</Badge></article>)}
  </section>
}`
  }
]
