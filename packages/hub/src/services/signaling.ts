/**
 * @xnet/hub - Signaling service for y-webrtc compatible pub/sub.
 */

import type { WebSocket } from 'ws'

type Topic = {
  subscribers: Set<WebSocket>
}

type SignalingMessage =
  | {
      type: 'subscribe'
      topics?: string[]
    }
  | {
      type: 'unsubscribe'
      topics?: string[]
    }
  | {
      type: 'publish'
      topic?: string
      data?: unknown
    }
  | {
      type: 'ping'
    }

type MessageInterceptor = (ws: WebSocket, msg: SignalingMessage) => SignalingMessage | null

type SignalingService = {
  handleMessage: (ws: WebSocket, msg: unknown) => void
  handleDisconnect: (ws: WebSocket) => void
  getRoomCount: () => number
  getSubscribers: (topic: string) => Set<WebSocket>
  publishFromHub: (topic: string, data: unknown) => void
  setMessageInterceptor: (interceptor: MessageInterceptor | null) => void
  destroy: () => void
}

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string')

const isSignalingMessage = (value: unknown): value is SignalingMessage => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { type?: unknown }
  if (candidate.type === 'subscribe' || candidate.type === 'unsubscribe') return true
  if (candidate.type === 'publish') return true
  if (candidate.type === 'ping') return true
  return false
}

const createTopic = (): Topic => ({ subscribers: new Set() })

const getMessageTopics = (msg: { topics?: string[] }): string[] =>
  isStringArray(msg.topics) ? msg.topics : []

const send = (ws: WebSocket, msg: object): void => {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(msg))
  }
}

const publish = (subscribers: Set<WebSocket>, topic: string, data: unknown, sender?: WebSocket): void => {
  const payload = JSON.stringify({ type: 'publish', topic, data })
  for (const subscriber of subscribers) {
    if (subscriber !== sender && subscriber.readyState === 1) {
      subscriber.send(payload)
    }
  }
}

const subscribe = (
  ws: WebSocket,
  topics: string[],
  topicMap: Map<string, Topic>,
  subscriptions: Map<WebSocket, Set<string>>
): void => {
  if (!subscriptions.has(ws)) {
    subscriptions.set(ws, new Set())
  }
  const subs = subscriptions.get(ws)!

  for (const topic of topics) {
    if (!topicMap.has(topic)) {
      topicMap.set(topic, createTopic())
    }
    topicMap.get(topic)!.subscribers.add(ws)
    subs.add(topic)
  }
}

const unsubscribe = (
  ws: WebSocket,
  topics: string[],
  topicMap: Map<string, Topic>,
  subscriptions: Map<WebSocket, Set<string>>
): void => {
  const subs = subscriptions.get(ws)
  if (!subs) return

  for (const topic of topics) {
    const entry = topicMap.get(topic)
    if (entry) {
      entry.subscribers.delete(ws)
      if (entry.subscribers.size === 0) {
        topicMap.delete(topic)
      }
    }
    subs.delete(topic)
  }
}

export const createSignalingService = (): SignalingService => {
  const topics = new Map<string, Topic>()
  const subscriptions = new Map<WebSocket, Set<string>>()
  let interceptor: MessageInterceptor | null = null

  const handleMessage = (ws: WebSocket, msg: unknown): void => {
    if (!isSignalingMessage(msg)) return
    const intercepted = interceptor ? interceptor(ws, msg) : msg
    if (!intercepted) return

    switch (intercepted.type) {
      case 'subscribe':
        subscribe(ws, getMessageTopics(intercepted), topics, subscriptions)
        break
      case 'unsubscribe':
        unsubscribe(ws, getMessageTopics(intercepted), topics, subscriptions)
        break
      case 'publish':
        if (typeof intercepted.topic === 'string') {
          const entry = topics.get(intercepted.topic)
          if (entry) {
            publish(entry.subscribers, intercepted.topic, intercepted.data, ws)
          }
        }
        break
      case 'ping':
        send(ws, { type: 'pong' })
        break
    }
  }

  const handleDisconnect = (ws: WebSocket): void => {
    const subs = subscriptions.get(ws)
    if (subs) {
      unsubscribe(ws, Array.from(subs), topics, subscriptions)
      subscriptions.delete(ws)
    }
  }

  const getRoomCount = (): number => topics.size

  const getSubscribers = (topic: string): Set<WebSocket> =>
    new Set(topics.get(topic)?.subscribers ?? [])

  const publishFromHub = (topic: string, data: unknown): void => {
    const entry = topics.get(topic)
    if (!entry) return
    publish(entry.subscribers, topic, data)
  }

  const setMessageInterceptor = (next: MessageInterceptor | null): void => {
    interceptor = next
  }

  const destroy = (): void => {
    topics.clear()
    subscriptions.clear()
    interceptor = null
  }

  return {
    handleMessage,
    handleDisconnect,
    getRoomCount,
    getSubscribers,
    publishFromHub,
    setMessageInterceptor,
    destroy
  }
}

export type { SignalingMessage, SignalingService, MessageInterceptor }
