import type { DataService } from '../data-process/data-service'
import { SocialConversationSchema, SocialMessageSchema } from '@xnetjs/social/schemas'
import { expect, it, vi } from 'vitest'
import { conversationResources } from './conversations'

type SourceNode = Awaited<ReturnType<DataService['listNodes']>>[number]
const node = (id: string, properties: Record<string, unknown>): SourceNode => ({
  id,
  schemaId: '',
  properties,
  createdAt: 1,
  updatedAt: 1,
  createdBy: 'did:key:test',
  deleted: false,
  timestamps: {},
  updatedBy: 'did:key:test'
})
it('indexes full AI conversation text in order while excluding unrelated private messages', async () => {
  const listNodes = vi.fn(async ({ schemaId }: { schemaId?: string } = {}) =>
    schemaId === SocialConversationSchema._schemaId
      ? [
          node('chat', {
            platform: 'claude',
            conversationKind: 'ai-chat',
            title: 'A conversation',
            privacyClass: 'private'
          }),
          node('dm', { platform: 'x', conversationKind: 'dm' })
        ]
      : schemaId === SocialMessageSchema._schemaId
        ? [
            node('late', {
              conversation: 'chat',
              senderHandle: 'assistant',
              sentAt: '2026-10-02',
              searchText: 'Long text '.repeat(4000) + 'tailmarker'
            }),
            node('early', {
              conversation: 'chat',
              senderHandle: 'user',
              sentAt: '2026-10-01',
              searchText: 'First question'
            }),
            node('excluded', { conversation: 'dm', searchText: 'Not in Library' })
          ]
        : []
  )
  const results = []
  for await (const resource of conversationResources({ listNodes })) results.push(resource)
  expect(results).toHaveLength(1)
  expect(results[0]).toMatchObject({
    id: 'chat',
    kind: 'conversation',
    privacy: 'private',
    url: ''
  })
  expect(results[0].sourceText).toMatch(/^user.*\nFirst question/s)
  expect(results[0].sourceText).toContain('tailmarker')
  expect(results[0].sourceText).not.toContain('Not in Library')
})
