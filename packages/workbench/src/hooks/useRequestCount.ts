/**
 * Count of pending inbound requests for the Rail badge (0177): message requests
 * + waves addressed to me and still pending.
 */
import { MessageRequestSchema } from '@xnetjs/data'
import { useXNet, useQuery } from '@xnetjs/react'
import { ConnectionWaveSchema } from '@xnetjs/social/connect'
import { useMemo } from 'react'

type Row = Record<string, unknown>

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function useRequestCount(): number {
  const { authorDID } = useXNet()
  const me = authorDID ?? ''
  const { data: requests } = useQuery(MessageRequestSchema, {
    where: { recipient: me as `did:key:${string}`, status: 'pending' }
  })
  const { data: waves } = useQuery(ConnectionWaveSchema, {
    where: { toDid: me as `did:key:${string}`, status: 'pending' }
  })

  return useMemo(() => {
    if (!me) return 0
    const reqs = ((requests ?? []) as unknown as Row[]).filter(
      (row) => str(row.recipient) === me && (str(row.status) ?? 'pending') === 'pending'
    ).length
    const wv = ((waves ?? []) as unknown as Row[]).filter(
      (row) => str(row.toDid) === me && (str(row.status) ?? 'pending') === 'pending'
    ).length
    return reqs + wv
  }, [me, requests, waves])
}
