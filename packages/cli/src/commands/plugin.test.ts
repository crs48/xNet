/**
 * Tests for `xnet plugin scaffold` — proves the scaffold result is written to
 * disk through an injectable filesystem (no real I/O), and that the written
 * tree matches the pure scaffold output.
 */
import { scaffoldPlugin } from '@xnetjs/plugins'
import { describe, expect, it } from 'vitest'
import { writeScaffoldFiles, type ScaffoldIO } from './plugin'

function fakeIO() {
  const dirs: string[] = []
  const files: Record<string, string> = {}
  const io: ScaffoldIO = {
    mkdir: (p) => dirs.push(p),
    writeFile: (p, c) => {
      files[p] = c
    }
  }
  return { io, dirs, files }
}

describe('writeScaffoldFiles', () => {
  it('writes every scaffold file under the target dir and creates parent dirs', () => {
    const { files } = scaffoldPlugin({ id: 'com.acme.kanban', name: 'Kanban', template: 'client' })
    const { io, dirs, files: written } = fakeIO()

    const paths = writeScaffoldFiles(files, '/tmp/kanban', io)

    expect(paths).toContain('src/index.ts')
    expect(written['/tmp/kanban/src/index.ts']).toContain('com.acme.kanban')
    expect(written['/tmp/kanban/package.json']).toContain('acme-kanban')
    // The src/ parent directory was created before writing into it.
    expect(dirs).toContain('/tmp/kanban/src')
  })

  it('returns the relative paths it wrote', () => {
    const { files } = scaffoldPlugin({ id: 'com.acme.x', name: 'X', template: 'client' })
    const { io } = fakeIO()
    const paths = writeScaffoldFiles(files, '/tmp/x', io).sort()
    expect(paths).toEqual([
      'LICENSE',
      'README.md',
      'package.json',
      'src/index.test.ts',
      'src/index.ts',
      'tsconfig.json'
    ])
  })
})
