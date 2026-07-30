import { describe, expect, it, vi } from 'vitest'
import {
  cliChatAgent,
  cliStreamingChatAgent,
  fakeChatAgent,
  flattenChat,
  initialStreamJsonState,
  isStreamingChatAgent,
  openAiChatAgent,
  reduceStreamJsonLine,
  type ChatMessage
} from './chat-agent'
import { FakeCommandRunner, FakeLineRunner } from './command-runner'

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

describe('openAiChatAgent', () => {
  it('posts to the upstream /v1/chat/completions and returns the reply content', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { role: 'assistant', content: ' local reply ' } }]
          }),
          { status: 200 }
        )
    ) as unknown as typeof fetch
    const agent = openAiChatAgent({
      baseUrl: 'http://localhost:11434/',
      model: 'llama3.2',
      apiKey: 'k',
      fetchImpl
    })
    const reply = await agent.chat(msgs(['user', 'hi']))
    expect(reply).toBe('local reply')
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('http://localhost:11434/v1/chat/completions')
    expect((init as RequestInit).headers).toMatchObject({ authorization: 'Bearer k' })
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
      model: 'llama3.2',
      stream: false
    })
  })

  it('throws when the upstream server returns a non-2xx status', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('nope', { status: 500 })
    ) as unknown as typeof fetch
    const agent = openAiChatAgent({ baseUrl: 'http://localhost:11434', model: 'x', fetchImpl })
    await expect(agent.chat(msgs(['user', 'hi']))).rejects.toThrow(/HTTP 500/)
  })
})

describe('reduceStreamJsonLine', () => {
  const line = (obj: unknown): string => JSON.stringify(obj)

  it('captures the session id from init and forwards partial text deltas', () => {
    let state = initialStreamJsonState()
    state = reduceStreamJsonLine(
      state,
      line({ type: 'system', subtype: 'init', session_id: 'sess-9' })
    ).state
    const step = reduceStreamJsonLine(
      state,
      line({
        type: 'stream_event',
        event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hel' } }
      })
    )
    expect(step.delta).toBe('Hel')
    expect(step.state.sessionId).toBe('sess-9')
    expect(step.state.text).toBe('Hel')
  })

  it('ignores thinking deltas and non-JSON noise', () => {
    const state = initialStreamJsonState()
    expect(reduceStreamJsonLine(state, 'not json').delta).toBeUndefined()
    const step = reduceStreamJsonLine(
      state,
      line({
        type: 'stream_event',
        event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'hmm' } }
      })
    )
    expect(step.delta).toBeUndefined()
    expect(step.state.text).toBe('')
  })

  it('uses complete assistant messages only when no partials arrived', () => {
    const assistant = line({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'full reply' }] }
    })
    // Without partials: the assistant message is the delta.
    const cold = reduceStreamJsonLine(initialStreamJsonState(), assistant)
    expect(cold.delta).toBe('full reply')
    // With partials: it is a duplicate and must be dropped.
    let state = initialStreamJsonState()
    state = reduceStreamJsonLine(
      state,
      line({
        type: 'stream_event',
        event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'full reply' } }
      })
    ).state
    expect(reduceStreamJsonLine(state, assistant).delta).toBeUndefined()
  })

  it('records the result session id and flags error results', () => {
    const ok = reduceStreamJsonLine(
      initialStreamJsonState(),
      line({ type: 'result', subtype: 'success', result: 'answer', session_id: 's1' })
    )
    expect(ok.state.sessionId).toBe('s1')
    expect(ok.state.text).toBe('answer')
    expect(ok.delta).toBe('answer')

    const bad = reduceStreamJsonLine(
      initialStreamJsonState(),
      line({ type: 'result', subtype: 'error_during_execution', session_id: 's2' })
    )
    expect(bad.state.error).toMatch(/error_during_execution/)
  })
})

describe('cliStreamingChatAgent', () => {
  const turnLines = [
    JSON.stringify({ type: 'system', subtype: 'init', session_id: 'sess-1' }),
    JSON.stringify({
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello ' } }
    }),
    JSON.stringify({
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'world' } }
    }),
    JSON.stringify({
      type: 'result',
      subtype: 'success',
      result: 'Hello world',
      session_id: 'sess-1'
    })
  ]

  it('streams deltas live and reports the session id', async () => {
    const runner = new FakeLineRunner([{ match: () => true, lines: turnLines }])
    const agent = cliStreamingChatAgent(runner, { command: 'claude', cwd: '/ws' })
    const deltas: string[] = []
    const result = await agent.streamTurn({ prompt: 'hi' }, (d) => deltas.push(d))
    expect(deltas).toEqual(['Hello ', 'world'])
    expect(result).toEqual({ text: 'Hello world', sessionId: 'sess-1' })
    expect(runner.calls[0].args).toEqual([
      '-p',
      'hi',
      '--output-format',
      'stream-json',
      '--include-partial-messages',
      '--verbose'
    ])
    expect(isStreamingChatAgent(agent)).toBe(true)
  })

  it('passes --resume when continuing a session, and MCP wiring when configured', async () => {
    const runner = new FakeLineRunner([{ match: () => true, lines: turnLines }])
    const agent = cliStreamingChatAgent(runner, {
      command: 'claude',
      cwd: '/ws',
      launch: { mcpConfigPath: '/tmp/mcp.json' }
    })
    await agent.streamTurn({ prompt: 'next', resumeSessionId: 'sess-1' }, () => {})
    expect(runner.calls[0].args).toEqual([
      '-p',
      'next',
      '--output-format',
      'stream-json',
      '--include-partial-messages',
      '--verbose',
      '--resume',
      'sess-1',
      '--mcp-config',
      '/tmp/mcp.json',
      '--allowedTools',
      'mcp__xnet__*'
    ])
  })

  it('throws on an error result', async () => {
    const runner = new FakeLineRunner([
      {
        match: () => true,
        lines: [JSON.stringify({ type: 'result', subtype: 'error_max_turns', session_id: 's' })]
      }
    ])
    const agent = cliStreamingChatAgent(runner, { command: 'claude', cwd: '/ws' })
    await expect(agent.streamTurn({ prompt: 'x' }, () => {})).rejects.toThrow(/error_max_turns/)
  })

  it('chat() flattens the conversation through the streaming path', async () => {
    const runner = new FakeLineRunner([{ match: () => true, lines: turnLines }])
    const agent = cliStreamingChatAgent(runner, { command: 'claude', cwd: '/ws' })
    const reply = await agent.chat(msgs(['system', 'S'], ['user', 'U']))
    expect(reply).toBe('Hello world')
    expect(runner.calls[0].args[1]).toBe('system: S\n\nU')
  })
})
