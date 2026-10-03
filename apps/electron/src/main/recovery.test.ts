import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  retain: vi.fn(),
  flush: vi.fn(),
  freeze: vi.fn(),
  thaw: vi.fn(),
  resume: vi.fn(),
  send: vi.fn()
}))
vi.mock('electron', () => ({
  app: { getPath: () => '/test/profile', getVersion: () => '3.0.0' },
  BrowserWindow: {
    getAllWindows: () => [{ isDestroyed: () => false, webContents: { send: mocks.send } }]
  },
  dialog: {},
  ipcMain: {},
  safeStorage: {},
  shell: {}
}))
vi.mock('./profile', () => ({ dataPath: '/test/data', profile: 'test' }))
vi.mock('./library-ipc', () => ({ freezeLibrary: mocks.freeze, thawLibrary: mocks.thaw }))
vi.mock('./renderer-flush', () => ({ flushRenderers: mocks.flush, resumeRenderers: mocks.resume }))
vi.mock('./social-import-ipc', () => ({ hasActiveSocialImports: () => false }))
vi.mock('../storage/checkpoints', () => ({
  createCheckpoint: mocks.create,
  retainCheckpoints: mocks.retain,
  inspectCheckpoints: vi.fn(),
  workspaceFingerprint: vi.fn()
}))
vi.mock('../storage/compatibility', () => ({
  inspectDatabase: vi.fn(),
  WorkspaceRecoveryRequired: class extends Error {}
}))
vi.mock('../storage/desktop-settings', () => ({
  readDesktopSettings: vi.fn(),
  writeDesktopSettings: vi.fn()
}))
vi.mock('../storage/portable', () => ({
  exportPortableCheckpoint: vi.fn(),
  unpackPortableCheckpoint: vi.fn()
}))
vi.mock('../storage/restore', () => ({ restoreCheckpoint: vi.fn() }))

beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  mocks.create.mockResolvedValue({ id: 'saved-point' })
  mocks.retain.mockResolvedValue(undefined)
  mocks.flush.mockResolvedValue(undefined)
  mocks.freeze.mockResolvedValue(undefined)
  mocks.thaw.mockResolvedValue(undefined)
})

it('restores editing and reports failure if resuming the Library times out', async () => {
  const recovery = await import('./recovery')
  mocks.thaw.mockRejectedValue(new Error('Request library:thaw timed out'))
  await expect(recovery.checkpointWorkspace()).rejects.toThrow('library:thaw timed out')
  expect(mocks.retain).toHaveBeenCalledOnce()
  expect(mocks.resume).toHaveBeenCalledOnce()
  expect(mocks.send).toHaveBeenLastCalledWith(
    'xnet:recovery:error',
    'Request library:thaw timed out'
  )
  expect(recovery.recoveryIsBusy()).toBe(false)
})

it('keeps the recovery barrier until the Library acknowledges resuming', async () => {
  const recovery = await import('./recovery')
  let release!: () => void
  mocks.thaw.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      release = resolve
    })
  )
  const first = recovery.checkpointWorkspace()
  await vi.waitFor(() => expect(mocks.thaw).toHaveBeenCalledOnce())
  expect(recovery.recoveryIsBusy()).toBe(true)
  expect(mocks.resume).not.toHaveBeenCalled()
  const second = recovery.checkpointWorkspace()
  const third = recovery.checkpointWorkspace()
  await Promise.resolve()
  expect(mocks.create).toHaveBeenCalledOnce()
  release()
  await Promise.all([first, second, third])
  expect(mocks.create).toHaveBeenCalledTimes(3)
  expect(mocks.resume).toHaveBeenCalledTimes(3)
  expect(recovery.recoveryIsBusy()).toBe(false)
})

it('resumes both writers after a failed copy and clears the error after a successful retry', async () => {
  const recovery = await import('./recovery')
  mocks.create.mockRejectedValueOnce(new Error('Disk write failed'))
  await expect(recovery.checkpointWorkspace()).rejects.toThrow('Disk write failed')
  expect(mocks.thaw).toHaveBeenCalledOnce()
  expect(mocks.resume).toHaveBeenCalledOnce()
  expect(mocks.send).toHaveBeenLastCalledWith('xnet:recovery:error', 'Disk write failed')
  await expect(recovery.checkpointWorkspace()).resolves.toEqual({ id: 'saved-point' })
  expect(mocks.send).toHaveBeenLastCalledWith('xnet:recovery:error', null)
})

it('keeps writers stopped for a final quit copy', async () => {
  const recovery = await import('./recovery')
  await recovery.checkpointWorkspace({ writersStopped: true, resume: false })
  expect(mocks.create).toHaveBeenCalledOnce()
  expect(mocks.flush).not.toHaveBeenCalled()
  expect(mocks.freeze).not.toHaveBeenCalled()
  expect(mocks.thaw).not.toHaveBeenCalled()
  expect(mocks.resume).not.toHaveBeenCalled()
  expect(recovery.recoveryIsBusy()).toBe(false)
})
