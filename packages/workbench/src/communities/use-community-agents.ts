import type { CommunityAgentPort, CommunityAgentSnapshot } from './agent-contract'
import type { AttachmentServices } from './ConversationPane'
import type { CommunityData } from './use-community-data'
import {
  AgentActionSchema,
  AgentSessionSchema,
  ChatMessageSchema,
  type FileRef
} from '@xnetjs/data'
import { useCallback, useEffect, useRef, useState } from 'react'
const empty: CommunityAgentSnapshot = { runtimes: [], bindings: [], runs: [] }
export function useCommunityAgents(
  port: CommunityAgentPort | undefined,
  data: CommunityData,
  services: AttachmentServices
) {
  const [snapshot, setSnapshot] = useState(empty)
  const [error, setError] = useState('')
  const publishing = useRef(new Set<string>())
  const failedPublication = useRef(new Set<string>())
  const refresh = useCallback(async () => {
    if (port) setSnapshot(await port.snapshot())
  }, [port])
  useEffect(() => {
    if (!port) return
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const update = () => {
      timer ??= setTimeout(() => {
        timer = undefined
        void port
          .snapshot()
          .then((value) => {
            if (!disposed) setSnapshot(value)
          })
          .catch((cause: unknown) => {
            if (!disposed) setError(String(cause))
          })
      }, 80)
    }
    update()
    const cleanup = port.subscribe(update)
    return () => {
      disposed = true
      if (timer) clearTimeout(timer)
      cleanup()
    }
  }, [port])
  useEffect(() => {
    if (!port || !data.bridge?.get || !data.did) return
    const bridge = data.bridge
    for (const run of snapshot.runs) {
      if (
        run.status !== 'completed' ||
        run.purpose === 'extension' ||
        run.published ||
        run.owner !== data.did ||
        publishing.current.has(run.id) ||
        failedPublication.current.has(run.id)
      )
        continue
      publishing.current.add(run.id)
      void (async () => {
        await port.authorizePublication(run.id)
        if (!bridge.get) throw new Error('The local store is unavailable.')
        const name = run.provider === 'codex' ? 'Codex' : 'Claude'
        const receipt = `${name} · AI response requested and saved by ${data.nameFor(run.owner)}\n\n`
        const attachments: FileRef[] = []
        if (!(await bridge.get(run.replyId))) {
          let content = receipt + run.text
          if (content.length > 10000) {
            if (!services.blobs)
              throw new Error(
                'File storage is needed to save this answer. Reopen the conversation when storage is ready.'
              )
            const file = new File([run.text], `${name.toLowerCase()}-answer-${run.id}.txt`, {
              type: 'text/plain'
            })
            attachments.push(await services.blobs.upload(file))
            content = `${receipt}${run.text.slice(0, 8500)}\n\n[Preview ends here. The complete answer is saved in the attached text file.]`
          }
          await bridge.create(
            ChatMessageSchema,
            {
              channel: run.channelId,
              content,
              inReplyTo: run.messageId,
              ...(attachments.length ? { attachments } : {})
            },
            run.replyId
          )
          for (const file of attachments) services.transfers?.enqueueUpload(file)
        }
        const sessionId = `chat-agent-session-${run.channelId}`
        if (!(await bridge.get(sessionId)))
          await bridge.create(
            AgentSessionSchema,
            {
              channel: 'app',
              peer: run.channelId,
              startedAt: run.startedAt,
              lastActiveAt: run.finishedAt
            },
            sessionId
          )
        const actionId = `chat-agent-action-${run.id}`
        if (!(await bridge.get(actionId)))
          await bridge.create(
            AgentActionSchema,
            {
              session: sessionId,
              tool: 'chat.reply',
              status: 'applied',
              risk: 'low',
              reversibility: 'compensatable',
              instruction: `${name} ${run.runtimeVersion}; owner-requested run ${run.id}; reply ${run.replyId}. Provider attribution is reported, not cryptographically attested.`
            },
            actionId
          )
        await port.acknowledge(run.id)
      })()
        .catch((cause: unknown) => {
          failedPublication.current.add(run.id)
          setError(
            `The answer is saved in the local agent journal, but publication failed: ${String(cause)}`
          )
        })
        .finally(() => publishing.current.delete(run.id))
    }
  }, [snapshot.runs, port, data, services.blobs, services.transfers])
  return {
    port,
    snapshot,
    error,
    setError,
    refresh,
    retryPublication: () => {
      failedPublication.current.clear()
      void refresh().catch((cause: unknown) => setError(String(cause)))
    }
  }
}
export type CommunityAgents = ReturnType<typeof useCommunityAgents>
