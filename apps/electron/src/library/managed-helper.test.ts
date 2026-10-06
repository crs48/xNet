import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  inspectManagedHelper,
  installManagedHelper,
  verifyHelperVersion,
  LibraryHelperError,
  LibraryHelperProbeError
} from './managed-helper'

const bytes = Buffer.from('a fixture helper executable')
const artifact = {
  version: 'fixture',
  filename: 'fixture-helper',
  url: 'https://example.invalid/helper',
  size: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex')
}
let root: string
let directory: string
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'xnet-helper-'))
  directory = join(root, 'helpers')
})
afterEach(() => rm(root, { recursive: true, force: true }))
const install = (overrides: Partial<Parameters<typeof installManagedHelper>[0]> = {}) =>
  installManagedHelper({
    directory,
    artifact,
    signal: new AbortController().signal,
    download: async () => new Response(bytes),
    verifyVersion: async () => {},
    ...overrides
  })

it('promotes only verified bytes and avoids downloading an already ready helper', async () => {
  expect((await inspectManagedHelper(directory, artifact)).state).toBe('missing')
  const verifyVersion = vi.fn(async (path: string) => {
    expect(await readFile(path)).toEqual(bytes)
    expect(await readdir(directory)).not.toContain(artifact.filename)
  })
  expect((await install({ verifyVersion })).state).toBe('ready')
  expect(verifyVersion).toHaveBeenCalledOnce()
  const download = vi.fn(async () => new Response(bytes))
  expect((await install({ download })).state).toBe('ready')
  expect(download).not.toHaveBeenCalled()
  expect(await readdir(directory)).toEqual([artifact.filename])
})

it('preserves the complete binary when the download arrives in several chunks', async () => {
  await install({
    download: async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(bytes.subarray(0, 4))
            controller.enqueue(bytes.subarray(4, 13))
            controller.enqueue(bytes.subarray(13))
            controller.close()
          }
        })
      )
  })
  expect(await readFile(join(directory, artifact.filename))).toEqual(bytes)
})

it.each(['short', 'oversized', 'checksum', 'version', 'http'])(
  'never publishes a helper after a %s failure',
  async (failure) => {
    const payload =
      failure === 'short'
        ? bytes.subarray(1)
        : failure === 'oversized'
          ? Buffer.concat([bytes, bytes])
          : failure === 'checksum'
            ? Buffer.alloc(bytes.length)
            : bytes
    const verifyVersion = vi.fn(async () => {
      if (failure === 'version') throw new Error('Unexpected version')
    })
    await expect(
      install({
        verifyVersion,
        download: async () => new Response(payload, { status: failure === 'http' ? 503 : 200 })
      })
    ).rejects.toThrow()
    expect(await readdir(directory)).toEqual([])
    if (failure !== 'version') expect(verifyVersion).not.toHaveBeenCalled()
  }
)

it('detects modified installed bytes and preserves them when a repair download fails', async () => {
  await install()
  const path = join(directory, artifact.filename)
  // chmod represents an external modification by the owning user.
  const { chmod } = await import('node:fs/promises')
  await chmod(path, 0o700)
  const damaged = Buffer.alloc(bytes.length, 120)
  await writeFile(path, damaged)
  expect((await inspectManagedHelper(directory, artifact)).state).toBe('damaged')
  await expect(
    install({
      download: async () => {
        throw new Error('offline')
      }
    })
  ).rejects.toThrow('offline')
  expect(await readFile(path)).toEqual(damaged)
  expect((await install()).state).toBe('ready')
})

it('cancels before publication and removes partial bytes', async () => {
  const controller = new AbortController()
  await expect(
    install({
      signal: controller.signal,
      verifyVersion: async (_path, _version, signal) => {
        expect(signal).toBe(controller.signal)
        controller.abort()
        signal.throwIfAborted()
      }
    })
  ).rejects.toThrow()
  expect(await readdir(directory)).toEqual([])
})

it('rejects a helper directory symlink before downloading', async () => {
  await symlink(root, directory)
  const download = vi.fn(async () => new Response(bytes))
  await expect(install({ download })).rejects.toThrow('regular directory')
  expect(download).not.toHaveBeenCalled()
})

// A real child process distinguishes empty success output from a version mismatch.
it.skipIf(process.platform === 'win32')(
  'retries an empty helper probe without accepting it as a verified version',
  async () => {
    const path = join(root, 'probe')
    await writeFile(path, '#!/bin/sh\nexit 0\n', { mode: 0o700 })
    await expect(verifyHelperVersion(path, 'fixture')).rejects.toBeInstanceOf(
      LibraryHelperProbeError
    )
    await writeFile(path, '#!/bin/sh\nprintf "wrong\\n"\n', { mode: 0o700 })
    await expect(verifyHelperVersion(path, 'fixture')).rejects.toBeInstanceOf(LibraryHelperError)
    await writeFile(path, '#!/bin/sh\nprintf "fixture\\n"\n', { mode: 0o700 })
    await expect(verifyHelperVersion(path, 'fixture')).resolves.toBeUndefined()
  }
)
