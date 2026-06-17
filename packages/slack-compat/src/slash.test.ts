import { describe, it, expect } from 'vitest'
import { parseSlashCommand, formatSlashResponse } from './slash'

describe('parseSlashCommand', () => {
  it('parses a urlencoded body into a camelCased command', () => {
    const cmd = parseSlashCommand(
      'command=%2Fdeploy&text=web+prod&response_url=https%3A%2F%2Fhook&user_id=U1&channel_id=C1&team_id=T1'
    )
    expect(cmd).toEqual({
      command: '/deploy',
      text: 'web prod',
      responseUrl: 'https://hook',
      userId: 'U1',
      channelId: 'C1',
      teamId: 'T1'
    })
  })

  it('accepts an already-decoded record', () => {
    const cmd = parseSlashCommand({ command: '/x', text: 'hi', user_name: 'alice' })
    expect(cmd.command).toBe('/x')
    expect(cmd.userName).toBe('alice')
  })

  it('defaults missing command and text to empty strings', () => {
    expect(parseSlashCommand('')).toEqual({ command: '', text: '' })
  })
})

describe('formatSlashResponse', () => {
  it('defaults to ephemeral (Slack-compatible)', () => {
    expect(formatSlashResponse({ text: 'ok' })).toEqual({
      response_type: 'ephemeral',
      text: 'ok'
    })
  })

  it('honours an explicit in_channel response type', () => {
    expect(formatSlashResponse({ text: 'shipped', responseType: 'in_channel' })).toEqual({
      response_type: 'in_channel',
      text: 'shipped'
    })
  })
})
