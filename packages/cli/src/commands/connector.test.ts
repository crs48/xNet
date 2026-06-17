/**
 * Tests for `xnet connector scaffold` — proves the connector template is written
 * through the shared injectable filesystem shell (no real I/O).
 */
import { scaffoldPlugin } from '@xnetjs/plugins'
import { describe, expect, it } from 'vitest'
import { writeScaffoldFiles, type ScaffoldIO } from './plugin'

function fakeIO() {
  const files: Record<string, string> = {}
  const io: ScaffoldIO = {
    mkdir: () => {},
    writeFile: (p, c) => {
      files[p] = c
    }
  }
  return { io, files }
}

describe('connector scaffold', () => {
  it('writes a defineConnector project tree', () => {
    const { files } = scaffoldPlugin({
      id: 'dev.acme.connector.slack',
      name: 'Slack',
      template: 'connector'
    })
    const { io, files: written } = fakeIO()
    const paths = writeScaffoldFiles(files, '/tmp/slack', io).sort()

    expect(paths).toEqual([
      'LICENSE',
      'README.md',
      'package.json',
      'src/index.test.ts',
      'src/index.ts',
      'tsconfig.json'
    ])
    expect(written['/tmp/slack/src/index.ts']).toContain('defineConnector')
    expect(written['/tmp/slack/src/index.ts']).toContain('slack_search')
  })
})
