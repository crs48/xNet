import type { ChatMessage } from './chat-agent'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createBridgeSessionStore,
  fileSessionPersistence,
  transcriptKey,
  type SessionPersistence
} from './bridge-sessions'

const m = (role: ChatMessage['role'], content: string): ChatMessage => ({ role, content })

describe('transcriptKey', () => {
  it('ignores system messages (fresh context packs must not break matching)', () => {
    expect(transcriptKey([m('system', 'ctx A'), m('user', 'hi')])).toBe(
      transcriptKey([m('system', 'ctx B'), m('user', 'hi')])
    )
  })

  it('frames role/content unambiguously', () => {
    expect(transcriptKey([m('user', 'ab'), m('user', 'c')])).not.toBe(
      transcriptKey([m('user', 'a'), m('user', 'bc')])
    )
  })
})

describe('createBridgeSessionStore', () => {
  it('plans a full-history prompt when the conversation is unknown', () => {
    const store = createBridgeSessionStore()
    const plan = store.plan([m('system', 'S'), m('user', 'hello')])
    expect(plan.resumeSessionId).toBeUndefined()
    expect(plan.prompt).toContain('hello')
    expect(plan.prompt).toContain('system: S')
  })

  it('resumes a recorded conversation and sends only the new suffix', () => {
    const store = createBridgeSessionStore()
    const turn1 = [m('user', 'hello')]
    store.record(turn1, 'hi there', 'sess-1')

    const turn2 = [
      m('user', 'hello'),
      m('assistant', 'hi there'),
      m('system', 'fresh context pack'),
      m('user', 'and now?')
    ]
    const plan = store.plan(turn2)
    expect(plan.resumeSessionId).toBe('sess-1')
    expect(plan.prompt).toBe('system: fresh context pack\n\nand now?')
    // Nothing already covered by the session is re-sent.
    expect(plan.prompt).not.toContain('hello')
  })

  it('matches even when turn 1 carried different system context', () => {
    const store = createBridgeSessionStore()
    store.record([m('system', 'ctx v1'), m('user', 'q')], 'a', 'sess-2')
    const plan = store.plan([
      m('system', 'ctx v2'),
      m('user', 'q'),
      m('assistant', 'a'),
      m('user', 'follow-up')
    ])
    expect(plan.resumeSessionId).toBe('sess-2')
  })

  it('falls back to full history when the transcript was edited', () => {
    const store = createBridgeSessionStore()
    store.record([m('user', 'q')], 'a', 'sess-3')
    const plan = store.plan([m('user', 'q'), m('assistant', 'EDITED'), m('user', 'next')])
    expect(plan.resumeSessionId).toBeUndefined()
    expect(plan.prompt).toContain('q')
    expect(plan.prompt).toContain('next')
  })

  it('evicts oldest fingerprints beyond the limit', () => {
    const store = createBridgeSessionStore(2)
    store.record([m('user', 'a')], 'ra', 's-a')
    store.record([m('user', 'b')], 'rb', 's-b')
    store.record([m('user', 'c')], 'rc', 's-c')
    expect(store.size).toBe(2)
    expect(
      store.plan([m('user', 'a'), m('assistant', 'ra'), m('user', 'more')]).resumeSessionId
    ).toBeUndefined()
    expect(
      store.plan([m('user', 'c'), m('assistant', 'rc'), m('user', 'more')]).resumeSessionId
    ).toBe('s-c')
  })
})

describe('durable session persistence (exploration 0392)', () => {
  it('seeds from persistence and writes through on record', () => {
    const backing: Array<[string, string]> = []
    const persistence: SessionPersistence = {
      load: () => backing.slice(),
      save: (entries) => {
        backing.length = 0
        backing.push(...entries)
      }
    }
    const store = createBridgeSessionStore({ persistence })
    store.record([m('user', 'q')], 'a', 'sess-9')
    expect(backing).toHaveLength(1)

    // A "restart": a brand-new store seeded from the same backing resumes it.
    const restarted = createBridgeSessionStore({ persistence })
    const plan = restarted.plan([m('user', 'q'), m('assistant', 'a'), m('user', 'next')])
    expect(plan.resumeSessionId).toBe('sess-9')
  })

  it('respects the limit when seeding a large persisted map', () => {
    const persisted: Array<[string, string]> = [
      ['k1', 's1'],
      ['k2', 's2'],
      ['k3', 's3']
    ]
    const store = createBridgeSessionStore({
      limit: 2,
      persistence: { load: () => persisted, save: () => {} }
    })
    expect(store.size).toBe(2)
  })
})

describe('fileSessionPersistence', () => {
  const dirs: string[] = []
  afterEach(() => {
    dirs.length = 0
  })

  it('round-trips the map across a simulated daemon restart', () => {
    const dir = mkdtempSync(join(tmpdir(), 'xnet-bridge-sess-'))
    dirs.push(dir)
    const file = join(dir, 'nested', 'bridge-sessions.json')

    const first = createBridgeSessionStore({ persistence: fileSessionPersistence(file) })
    first.record([m('user', 'hello')], 'hi there', 'sess-1')
    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({ version: 1 })

    const second = createBridgeSessionStore({ persistence: fileSessionPersistence(file) })
    const plan = second.plan([m('user', 'hello'), m('assistant', 'hi there'), m('user', 'again')])
    expect(plan.resumeSessionId).toBe('sess-1')
  })

  it('loads empty (not throwing) when the file is missing or corrupt', () => {
    const dir = mkdtempSync(join(tmpdir(), 'xnet-bridge-sess-'))
    dirs.push(dir)
    const missing = fileSessionPersistence(join(dir, 'does-not-exist.json'))
    expect(missing.load()).toBeUndefined()
  })
})
