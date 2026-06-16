import { describe, expect, it } from 'vitest'
import { cliAgentRunner, fakeAgentRunner } from './agent'
import { FakeCommandRunner } from './command-runner'

describe('cliAgentRunner', () => {
  it('passes the prompt verbatim, even with $-sequences String.replace would mangle', async () => {
    const runner = new FakeCommandRunner()
    const agent = cliAgentRunner(runner, { command: 'claude' }) // default args ['-p', '{prompt}']
    const prompt = 'use $& and $1 and $$ and $`tick` literally'
    await agent.run('/work', { id: 't1', prompt })
    expect(runner.calls[0].command).toBe('claude')
    expect(runner.calls[0].args).toEqual(['-p', prompt])
  })

  it('replaces every {prompt} token in a custom arg template', async () => {
    const runner = new FakeCommandRunner()
    const agent = cliAgentRunner(runner, {
      command: 'aider',
      args: ['--msg', '{prompt}', '--echo', '{prompt}']
    })
    await agent.run('/work', { id: 't2', prompt: 'P' })
    expect(runner.calls[0].args).toEqual(['--msg', 'P', '--echo', 'P'])
  })

  it('returns ok and combined stdout+stderr from the runner', async () => {
    const runner = new FakeCommandRunner([
      { match: () => true, result: { stdout: 'out', stderr: 'err' } }
    ])
    const agent = cliAgentRunner(runner, { command: 'claude' })
    expect(await agent.run('/work', { id: 't3', prompt: 'hi' })).toEqual({
      ok: true,
      output: 'outerr'
    })
  })
})

describe('fakeAgentRunner', () => {
  it('runs the injected edit in the workdir and reports ok', async () => {
    let seen = ''
    const agent = fakeAgentRunner((wd) => {
      seen = wd
    })
    const res = await agent.run('/wd', { id: 'x', prompt: 'p' })
    expect(seen).toBe('/wd')
    expect(res.ok).toBe(true)
  })
})
