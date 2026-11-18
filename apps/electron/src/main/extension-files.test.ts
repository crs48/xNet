import { mkdtemp, writeFile, readFile, rm, symlink, rename, link } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createExtensionFiles } from './extension-files'

const directories: string[] = []
const brokers: ReturnType<typeof createExtensionFiles>[] = []
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'xnet-extension-files-'))
  directories.push(dir)
  const path = join(dir, 'notes.txt')
  await writeFile(path, 'original')
  let active = true,
    allowed = false,
    writes = 0,
    chosen: string | null = path
  const broker = createExtensionFiles({
    choose: async () => chosen,
    save: async () => chosen,
    confirmWrite: async () => {
      writes++
      return allowed
    },
    active: () => active
  })
  brokers.push(broker)
  return {
    dir,
    path,
    broker,
    setActive: (value: boolean) => (active = value),
    allow: () => (allowed = true),
    choose: (path: string | null) => (chosen = path),
    writes: () => writes
  }
}
afterEach(async () => {
  await Promise.all(brokers.splice(0).map((b) => b.close()))
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})
describe('chosen file capabilities', () => {
  it('requires a chosen handle and separates read from edit approval', async () => {
    const f = await fixture()
    await expect(
      f.broker.request({ operation: 'files.readText', handle: 'forged' })
    ).rejects.toThrow('not chosen')
    const file = (await f.broker.request({ operation: 'files.open' })) as {
      id: string
      name: string
    }
    expect(file.name).toBe('notes.txt')
    expect(JSON.stringify(file)).not.toContain(f.dir)
    expect(await f.broker.request({ operation: 'files.readText', handle: file.id })).toBe(
      'original'
    )
    await expect(
      f.broker.request({ operation: 'files.writeText', handle: file.id, text: 'changed' })
    ).rejects.toThrow('not allowed')
    expect(await readFile(f.path, 'utf8')).toBe('original')
    f.allow()
    await f.broker.request({ operation: 'files.writeText', handle: file.id, text: 'changed' })
    expect(await readFile(f.path, 'utf8')).toBe('changed')
    expect(f.writes()).toBe(2)
  })
  it('does not share handles between sessions and revokes on close', async () => {
    const a = await fixture(),
      b = await fixture(),
      file = (await a.broker.request({ operation: 'files.open' })) as { id: string }
    await expect(
      b.broker.request({ operation: 'files.readText', handle: file.id })
    ).rejects.toThrow('not chosen')
    await a.broker.close()
    await expect(
      a.broker.request({ operation: 'files.readText', handle: file.id })
    ).rejects.toThrow('revoked')
  })
  it('rejects replaced files, links, changed content, and oversized reads', async () => {
    const f = await fixture()
    f.allow()
    const file = (await f.broker.request({ operation: 'files.open' })) as { id: string }
    await writeFile(f.path, 'external')
    await expect(
      f.broker.request({ operation: 'files.writeText', handle: file.id, text: 'overwrite' })
    ).rejects.toThrow('changed outside')
    await rename(f.path, join(f.dir, 'original.txt'))
    await writeFile(f.path, 'replacement')
    await expect(
      f.broker.request({ operation: 'files.writeText', handle: file.id, text: 'overwrite' })
    ).rejects.toThrow('replaced')
    const symbolic = join(f.dir, 'link.txt')
    await symlink(f.path, symbolic)
    f.choose(symbolic)
    await expect(f.broker.request({ operation: 'files.open' })).rejects.toThrow()
    f.choose(f.path)
    await writeFile(f.path, Buffer.alloc(2_000_001))
    await expect(f.broker.request({ operation: 'files.open' })).rejects.toThrow('two megabytes')
  })
  it('rejects editing hard-linked files', async () => {
    const f = await fixture()
    f.allow()
    const file = (await f.broker.request({ operation: 'files.open' })) as { id: string }
    await link(f.path, join(f.dir, 'alias.txt'))
    await expect(
      f.broker.request({ operation: 'files.writeText', handle: file.id, text: 'no' })
    ).rejects.toThrow('linked')
  })
  it('cancels pick/export without writing and rechecks revocation after approval', async () => {
    const f = await fixture()
    f.choose(null)
    expect(await f.broker.request({ operation: 'files.open' })).toBeNull()
    expect(await f.broker.request({ operation: 'files.saveText', text: 'no' })).toBeNull()
    expect(await readFile(f.path, 'utf8')).toBe('original')
    f.setActive(false)
    await expect(f.broker.request({ operation: 'files.saveText', text: 'no' })).rejects.toThrow(
      'revoked'
    )
  })
  it('exports only to the selected path and rejects special files', async () => {
    const f = await fixture()
    await f.broker.request({ operation: 'files.saveText', text: 'exported' })
    expect(await readFile(f.path, 'utf8')).toBe('exported')
    f.choose('/dev/null')
    await expect(f.broker.request({ operation: 'files.open' })).rejects.toThrow('regular file')
  })
})
