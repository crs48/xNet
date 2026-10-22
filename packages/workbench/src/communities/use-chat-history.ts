import { ChatMessageSchema } from '@xnetjs/data'
import { useQuery } from '@xnetjs/react'
import { useEffect, useMemo, useState } from 'react'
import { CHAT_WINDOW_SIZE, chronologicalWindow, moveChatWindow } from './chat-window'

export function useChatHistory(channelId: string, search: string) {
  const text = search.trim()
  const [request, setRequest] = useState({ text, offset: 0 })
  const [latestRequest, setLatestRequest] = useState(0)
  const offset = request.text === text ? request.offset : 0
  useEffect(() => {
    if (request.text !== text) setRequest({ text, offset: 0 })
  }, [request.text, text])
  const query = useQuery(ChatMessageSchema, {
    where: { channel: channelId },
    orderBy: { createdAt: 'desc' },
    offset,
    page: { first: CHAT_WINDOW_SIZE, count: 'none' },
    ...(text ? { search: text } : {})
  })
  const messages = useMemo(() => chronologicalWindow(query.data), [query.data])
  const result = useMemo(
    () => ({ messages, offset, text, hasOlder: query.hasMore }),
    [messages, offset, text, query.hasMore]
  )
  const [settled, setSettled] = useState(result)
  useEffect(() => {
    if (!query.loading && !query.error) setSettled(result)
  }, [query.loading, query.error, result])
  // Retain only the preceding window during a read, so pagination never flashes
  // an empty feed or loses the virtualizer's visible anchor. Failed reads keep it too.
  const visible = (query.loading || query.error) && settled.text === text ? settled : result
  const move = (direction: 'older' | 'newer') => {
    if (query.loading || query.error) return
    setRequest({ text, offset: moveChatWindow(visible.offset, direction) })
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
      setRequest({ text, offset: 0 })
      setLatestRequest((value) => value + 1)
    }
  }
}

export type ChatHistory = ReturnType<typeof useChatHistory>
export type ChatMessage = ChatHistory['messages'][number]
