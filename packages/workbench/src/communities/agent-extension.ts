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
  'chat-preview-v1: selected-message-snapshot; no writes, network, imports, or host APIs'
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
export const watchlistSource = `type Message = { id: string; content: string }
export default function preview({ messages }: { messages: Message[] }) {
  const items = messages.filter((message) => /watch|film|movie|https?:/i.test(message.content))
  return { type: 'stack', children: [
    { type: 'text', text: 'Our watchlist' },
    ...items.map((message) => ({ type: 'card', text: message.content })),
    ...(items.length ? [] : [{ type: 'text', text: 'Share a film or a link in the conversation to add it here.' }])
  ] }
}`
