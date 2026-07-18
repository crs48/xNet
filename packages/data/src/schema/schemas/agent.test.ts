import { describe, expect, it } from 'vitest'
import { getAuthMode } from '../../auth'
import {
  AGENT_ACTION_SCHEMA_IRI,
  AGENT_ACTION_STATUSES,
  AGENT_APPROVAL_SCHEMA_IRI,
  AGENT_APPROVAL_SURFACES,
  AGENT_NOTIFICATION_SCHEMA_IRI,
  AGENT_PASSPORT_SCHEMA_IRI,
  AGENT_REVERSIBILITIES,
  AGENT_SESSION_SCHEMA_IRI,
  AgentActionSchema,
  AgentApprovalSchema,
  AgentNotificationSchema,
  AgentPassportSchema,
  AgentSessionSchema,
  agentActionId,
  agentApprovalId,
  agentNotificationId,
  agentPassportId,
  agentSessionId,
  redactInstruction
} from './agent'

const PACK = [
  [AgentPassportSchema, AGENT_PASSPORT_SCHEMA_IRI],
  [AgentSessionSchema, AGENT_SESSION_SCHEMA_IRI],
  [AgentActionSchema, AGENT_ACTION_SCHEMA_IRI],
  [AgentApprovalSchema, AGENT_APPROVAL_SCHEMA_IRI],
  [AgentNotificationSchema, AGENT_NOTIFICATION_SCHEMA_IRI]
] as const

describe('agent schema pack (exploration 0337)', () => {
  it('every schema has a canonical versioned IRI matching its constant', () => {
    for (const [schema, iri] of PACK) {
      expect(schema.schema['@id']).toBe(iri)
    }
  })

  it('every schema declares a real authorization block (space cascade)', () => {
    for (const [schema] of PACK) {
      expect(getAuthMode(schema.schema), schema.schema['@id']).not.toBe('legacy')
    }
  })

  it('passport requires agent DID, operator DID, and the delegated UCAN', () => {
    const required = AgentPassportSchema.schema.properties
      .filter((p) => p.required)
      .map((p) => p['@id'].split('#')[1])
    expect(required).toEqual(expect.arrayContaining(['agentDID', 'operatorDID', 'ucan']))
  })

  it('action lifecycle covers the ceremony states from the exploration', () => {
    expect(AGENT_ACTION_STATUSES.map((s) => s.id)).toEqual([
      'proposed',
      'pending-approval',
      'approved',
      'denied',
      'applied',
      'rolled-back',
      'failed'
    ])
  })

  it('reversibility enumerates the Agent Receipts triple', () => {
    expect(AGENT_REVERSIBILITIES.map((r) => r.id)).toEqual([
      'reversible',
      'compensatable',
      'irreversible'
    ])
  })

  it('approval surfaces distinguish forgeable chat from operator-signed app/push', () => {
    expect(AGENT_APPROVAL_SURFACES.map((s) => s.id)).toEqual(['chat', 'app', 'push'])
  })

  it('approval stores a nonce hash, never a nonce', () => {
    const propIds = AgentApprovalSchema.schema.properties.map((p) => p['@id'].split('#')[1])
    expect(propIds).toContain('nonceHash')
    expect(propIds).not.toContain('nonce')
  })

  describe('deterministic ids', () => {
    it('are stable for identical inputs (LWW upsert on retry)', () => {
      const did = 'did:key:z6MkAgent'
      const session = agentSessionId(did, 'agent:main:whatsapp-4915')
      expect(agentSessionId(did, 'agent:main:whatsapp-4915')).toBe(session)
      expect(agentActionId(session, 7)).toBe(agentActionId(session, 7))
      expect(agentApprovalId(agentActionId(session, 7))).toBe(
        agentApprovalId(agentActionId(session, 7))
      )
    })

    it('differ across sessions, sequences, and agents', () => {
      const a = agentSessionId('did:key:z6MkA', 'main')
      const b = agentSessionId('did:key:z6MkB', 'main')
      const c = agentSessionId('did:key:z6MkA', 'other')
      expect(new Set([a, b, c]).size).toBe(3)
      expect(agentActionId(a, 1)).not.toBe(agentActionId(a, 2))
    })

    it('sanitize channel-supplied keys into id-safe strings', () => {
      const id = agentSessionId('did:key:z6MkA', 'weird key/with spaces@!')
      expect(id).toMatch(/^agent-session:[a-zA-Z0-9:_-]+$/)
    })

    it('passport and notification ids are prefixed and stable', () => {
      expect(agentPassportId('did:key:z6MkA')).toBe('agent-passport:did:key:z6MkA')
      expect(agentNotificationId('agent-action:x:1')).toBe(
        'agent-notification:agent-action:x:1'
      )
    })
  })

  it('redactInstruction keeps length + digest prefix only', () => {
    const redacted = redactInstruction('archive my inbox', 'abcdef0123456789deadbeef')
    expect(redacted).toBe('[redacted 16 chars sha256:abcdef0123456789]')
    expect(redacted).not.toContain('archive')
  })
})
