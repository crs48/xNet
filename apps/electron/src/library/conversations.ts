import type { LibraryResource } from './types'
import type { DataService } from '../data-process/data-service'
import { SocialConversationSchema, SocialMessageSchema } from '@xnetjs/social/schemas'

const text = (value: unknown) => (typeof value === 'string' ? value : '')
type SourceNode = Awaited<ReturnType<DataService['listNodes']>>[number]

async function* nodes(data: Pick<DataService, 'listNodes'>, schemaId: string) {
  for (let offset = 0; ; offset += 500) {
    const page = await data.listNodes({
      schemaId,
      limit: 500,
      offset,
      orderBy: { createdAt: 'asc' }
    })
    yield* page
    if (page.length < 500) return
  }
}

/** Rebuildable local text projection. Private conversations never need a network fetch. */
export async function* conversationResources(
  data: Pick<DataService, 'listNodes'>
): AsyncGenerator<LibraryResource> {
  const conversations = new Map<string, { node: SourceNode; messages: SourceNode[] }>()
  for await (const node of nodes(data, SocialConversationSchema._schemaId)) {
    if (node.properties.conversationKind === 'ai-chat')
      conversations.set(node.id, { node, messages: [] })
  }
  if (!conversations.size) return
  for await (const message of nodes(data, SocialMessageSchema._schemaId)) {
    conversations.get(text(message.properties.conversation))?.messages.push(message)
  }
  for (const { node, messages } of conversations.values()) {
    const props = node.properties
    const platform = text(props.platform)
    const sourceText = messages
      .sort(
        (a, b) =>
          text(a.properties.sentAt).localeCompare(text(b.properties.sentAt)) ||
          a.createdAt - b.createdAt ||
          a.id.localeCompare(b.id)
      )
      .map(
        ({ properties: message }) =>
          `${text(message.senderHandle) || 'Message'}${message.sentAt ? ` · ${text(message.sentAt)}` : ''}\n${text(message.searchText) || text(message.textPreview)}`
      )
      .join('\n\n')
    yield {
      id: node.id,
      kind: 'conversation',
      platform,
      platformContentId: text(props.platformConversationId) || node.id,
      url: '',
      title: text(props.title) || `Saved ${platform} conversation`,
      sourceText,
      actor: '',
      privacy: text(props.privacyClass) || 'private',
      addedAt: node.createdAt
    }
  }
}
