/**
 * Agent audit console row assembly (exploration 0337).
 */

import type { NodeState } from '@xnetjs/data'
import { describe, expect, it } from 'vitest'
import { buildRows } from './useAgentAudit'

const node = (
  id: string,
  schemaSuffix: string,
  properties: Record<string, unknown>
): NodeState =>
  ({
    id,
    schemaId: `xnet://xnet.fyi/${schemaSuffix}@1.0.0`,
    properties,
    deleted: false
  }) as unknown as NodeState

describe('agent audit rows', () => {
  it('joins actions with approvals and session channel, newest first', () => {
    const actions = [
      node('a1', 'AgentAction', {
        createdAt: 100,
        createdBy: 'did:key:zAgent',
        session: 's1',
        tool: 'xnet_search',
        risk: 'low',
        status: 'applied',
        reversibility: 'compensatable',
        changeIds: []
      }),
      node('a2', 'AgentAction', {
        createdAt: 200,
        createdBy: 'did:key:zAgent',
        session: 's1',
        tool: 'xnet_plan_page_patch',
        risk: 'medium',
        status: 'applied',
        reversibility: 'reversible',
        changeIds: ['c1', 'c2']
      })
    ]
    const approvals = [
      node('ap1', 'AgentApproval', {
        action: 'a2',
        surface: 'chat',
        decision: 'approved',
        peer: 'tg-1'
      })
    ]
    const sessions = [node('s1', 'AgentSession', { channel: 'telegram' })]

    const rows = buildRows(actions, approvals, sessions)
    expect(rows.map((r) => r.id)).toEqual(['a2', 'a1'])
    expect(rows[0]).toMatchObject({
      tool: 'xnet_plan_page_patch',
      channel: 'telegram',
      changeIds: ['c1', 'c2'],
      approval: { surface: 'chat', decision: 'approved', peer: 'tg-1' }
    })
    expect(rows[1].approval).toBeNull()
  })

  it('drops deleted actions', () => {
    const deleted = {
      ...node('a1', 'AgentAction', { createdAt: 1, session: 's1' }),
      deleted: true
    } as NodeState
    expect(buildRows([deleted], [], [])).toEqual([])
  })
})
