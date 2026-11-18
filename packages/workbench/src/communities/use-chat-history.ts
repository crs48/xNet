import { ChatMessageSchema } from '@xnetjs/data'
import { useQuery } from '@xnetjs/react'
import { useEffect, useMemo, useState } from 'react'
import { CHAT_WINDOW_SIZE, chronologicalWindow, moveChatWindow } from './chat-window'

export function useChatHistory(channelId: string, search: string, threadId?: string) {
  const text = search.trim()
  const scope = `${channelId}:${threadId ?? ''}:${text}`
  const [request, setRequest] = useState({ text: scope, offset: 0 })
  const [latestRequest, setLatestRequest] = useState(0)
  const offset = request.text === scope ? request.offset : 0
  useEffect(() => {
    if (request.text !== scope) setRequest({ text: scope, offset: 0 })
  }, [request.text, scope])
  const query = useQuery(ChatMessageSchema, {
    where: { channel: channelId, ...(threadId ? { inReplyTo: threadId } : {}) },
    orderBy: { createdAt: 'desc' },
    offset,
    page: { first: CHAT_WINDOW_SIZE, count: 'none' },
    ...(text ? { search: text } : {})
  })
  const messages = useMemo(() => chronologicalWindow(query.data), [query.data])
  const result = useMemo(
    () => ({ messages, offset, text, scope, hasOlder: query.hasMore }),
    [messages, offset, text, scope, query.hasMore]
  )
  const [settled, setSettled] = useState(result)
  useEffect(() => {
    if (!query.loading && !query.error) setSettled(result)
  }, [query.loading, query.error, result])
  // Retain only the preceding window during a read, so pagination never flashes
  // an empty feed or loses the virtualizer's visible anchor. Failed reads keep it too.
  const visible = (query.loading || query.error) && settled.scope === scope ? settled : result
  const move = (direction: 'older' | 'newer') => {
    if (query.loading || query.error) return
    setRequest({ text: scope, offset: moveChatWindow(visible.offset, direction) })
  }
  return {
    ...visible,
    loading: query.loading,
    error: query.error,
    reload: query.reload,
    latestRequest,
    older: () => move('older'),
    newer: () => move('newer'),
    jumpToLatest: () => {
      setRequest({ text: scope, offset: 0 })
      setLatestRequest((value) => value + 1)
    }
  }
}

export type ChatHistory = ReturnType<typeof useChatHistory>
export type ChatMessage = ChatHistory['messages'][number]
