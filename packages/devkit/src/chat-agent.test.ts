import { describe, expect, it } from 'vitest'
import { cliChatAgent, fakeChatAgent, flattenChat, type ChatMessage } from './chat-agent'
import { FakeCommandRunner } from './command-runner'

const msgs = (...pairs: Array<[ChatMessage['role'], string]>): ChatMessage[] =>
  pairs.map(([role, content]) => ({ role, content }))

describe('flattenChat', () => {
  it('keeps user content bare and role-prefixes the rest', () => {
    expect(flattenChat(msgs(['system', 'S'], ['user', 'U'], ['assistant', 'A']))).toBe(
      'system: S\n\nU\n\nassistant: A'
    )
  })
})

describe('cliChatAgent', () => {
  it('spawns the CLI with the flattened prompt and returns trimmed stdout', async () => {
    const runner = new FakeCommandRunner([
      { match: () => true, result: { stdout: '  hello world\n' } }
    ])
    const agent = cliChatAgent(runner, { command: 'claude', cwd: '/ws' })
    const reply = await agent.chat(msgs(['user', 'hi']))
    expect(reply).toBe('hello world')
    expect(runner.calls[0].command).toBe('claude')
    expect(runner.calls[0].args).toEqual(['-p', 'hi'])
    expect(runner.calls[0].cwd).toBe('/ws')
  })

  it('passes a $-laden prompt verbatim (split/join, not replace)', async () => {
    const runner = new FakeCommandRunner()
    const agent = cliChatAgent(runner, { command: 'claude', cwd: '/ws' })
    await agent.chat(msgs(['user', 'use $& and $1 and $$ literally']))
    expect(runner.calls[0].args).toEqual(['-p', 'use $& and $1 and $$ literally'])
  })

  it('supports a custom arg template (e.g. codex exec)', async () => {
    const runner = new FakeCommandRunner()
    const agent = cliChatAgent(runner, { command: 'codex', args: ['exec', '{prompt}'], cwd: '/ws' })
    await agent.chat(msgs(['user', 'P']))
    expect(runner.calls[0].args).toEqual(['exec', 'P'])
  })

  it('throws with stderr when the CLI fails', async () => {
    const runner = new FakeCommandRunner([
      { match: () => true, result: { code: 1, stderr: 'boom' } }
    ])
    const agent = cliChatAgent(runner, { command: 'claude', cwd: '/ws' })
    await expect(agent.chat(msgs(['user', 'hi']))).rejects.toThrow(/boom/)
  })
})

describe('fakeChatAgent', () => {
  it('returns the scripted reply', async () => {
    const agent = fakeChatAgent((m) => `echo:${m[m.length - 1].content}`)
    expect(await agent.chat(msgs(['user', 'hi']))).toBe('echo:hi')
  })
})
