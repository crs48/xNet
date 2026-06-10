import type { BrowserSocialImportStageResult } from './social-import-worker-client'
import type { ArchiveManifest } from '@xnetjs/social/import/browser'
import type { SocialImportArchivePreview } from '@xnetjs/social/import/core'

export type BrowserSocialImportArchivePick = {
  file: File
  handleId: string | null
}

export type BrowserSocialImportResumeRecord = {
  jobId: string
  archiveHandleId: string
  archiveName: string
  manifest: ArchiveManifest
  preview: SocialImportArchivePreview
  stageResult: BrowserSocialImportStageResult
  buckets: string[]
  includeSensitive: boolean
  includeSourceRecords: boolean
  importedAt: string
  processedRecords: number
  completedBatches: number
  created: number
  updated: number
  updatedAt: number
  error: string | null
}

type BrowserFileSystemFileHandle = {
  kind: 'file'
  name: string
  getFile: () => Promise<File>
  queryPermission?: (descriptor?: BrowserFileSystemPermissionDescriptor) => Promise<PermissionState>
  requestPermission?: (
    descriptor?: BrowserFileSystemPermissionDescriptor
  ) => Promise<PermissionState>
}

type BrowserFileSystemPermissionDescriptor = {
  mode?: 'read' | 'readwrite'
}

type WindowWithFilePicker = Window & {
  showOpenFilePicker?: (options?: {
    multiple?: boolean
    types?: Array<{
      description?: string
      accept: Record<string, string[]>
    }>
  }) => Promise<BrowserFileSystemFileHandle[]>
}

type ArchiveHandleRecord = {
  id: string
  name: string
  updatedAt: number
  handle: BrowserFileSystemFileHandle
}

type ResumeStoragePayload = {
  records: BrowserSocialImportResumeRecord[]
}

const ARCHIVE_HANDLE_DB_NAME = 'xnet-social-import-archives'
const ARCHIVE_HANDLE_DB_VERSION = 1
const ARCHIVE_HANDLE_STORE_NAME = 'archive-handles'
const RESUME_STORAGE_KEY = 'xnet:social-import-resume:v1'

export function canPickResumableBrowserSocialImportArchive(): boolean {
  return typeof window !== 'undefined' && Boolean(getWindowWithFilePicker().showOpenFilePicker)
}

export async function pickBrowserSocialImportArchive(): Promise<BrowserSocialImportArchivePick> {
  const showOpenFilePicker = getWindowWithFilePicker().showOpenFilePicker
  if (!showOpenFilePicker) {
    throw new Error('File System Access archive picking is not available.')
  }

  const [handle] = await showOpenFilePicker({
    multiple: false,
    types: [
      {
        description: 'ZIP archives',
        accept: {
          'application/zip': ['.zip'],
          'application/x-zip-compressed': ['.zip']
        }
      }
    ]
  })
  if (!handle) throw new Error('No archive was selected.')

  const file = await handle.getFile()
  const handleId = createArchiveHandleId(file)
  await saveArchiveHandle({
    id: handleId,
    name: file.name,
    updatedAt: Date.now(),
    handle
  })

  return { file, handleId }
}

export async function readBrowserSocialImportArchiveHandleFile(handleId: string): Promise<File> {
  const record = await readArchiveHandle(handleId)
  if (!record) throw new Error('The saved archive handle is no longer available.')

  const permission = await requestArchiveHandlePermission(record.handle)
  if (permission !== 'granted') {
    throw new Error('Archive access was not granted. Choose the archive again to resume.')
  }

  return record.handle.getFile()
}

export function listBrowserSocialImportResumeRecords(): BrowserSocialImportResumeRecord[] {
  return readResumeRecords().sort((left, right) => right.updatedAt - left.updatedAt)
}

export function upsertBrowserSocialImportResumeRecord(
  record: BrowserSocialImportResumeRecord
): void {
  const records = readResumeRecords().filter((item) => item.jobId !== record.jobId)
  writeResumeRecords([
    {
      ...record,
      updatedAt: record.updatedAt || Date.now()
    },
    ...records
  ])
}

export function removeBrowserSocialImportResumeRecord(jobId: string): void {
  writeResumeRecords(readResumeRecords().filter((record) => record.jobId !== jobId))
}

async function requestArchiveHandlePermission(
  handle: BrowserFileSystemFileHandle
): Promise<PermissionState> {
  const descriptor = { mode: 'read' } satisfies BrowserFileSystemPermissionDescriptor
  const current = handle.queryPermission ? await handle.queryPermission(descriptor) : 'granted'
  if (current === 'granted') return current
  return handle.requestPermission ? handle.requestPermission(descriptor) : current
}

async function saveArchiveHandle(record: ArchiveHandleRecord): Promise<void> {
  const database = await openArchiveHandleDatabase()
  await runArchiveHandleTransaction(database, 'readwrite', (store) => {
    store.put(record)
  })
  database.close()
}

async function readArchiveHandle(handleId: string): Promise<ArchiveHandleRecord | null> {
  const database = await openArchiveHandleDatabase()
  const record = await runArchiveHandleTransaction<ArchiveHandleRecord | null>(
    database,
    'readonly',
    (store, resolve, reject) => {
      const request = store.get(handleId)
      request.onsuccess = () => {
        resolve(isArchiveHandleRecord(request.result) ? request.result : null)
      }
      request.onerror = () => reject(request.error ?? new Error('Unable to read archive handle.'))
    }
  )
  database.close()
  return record
}

function openArchiveHandleDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(ARCHIVE_HANDLE_DB_NAME, ARCHIVE_HANDLE_DB_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(ARCHIVE_HANDLE_STORE_NAME)) {
        database.createObjectStore(ARCHIVE_HANDLE_STORE_NAME, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Unable to open archive handles.'))
  })
}

function runArchiveHandleTransaction<T = void>(
  database: IDBDatabase,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore, resolve: (value: T) => void, reject: (error: Error) => void) => void
): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(ARCHIVE_HANDLE_STORE_NAME, mode)
    const store = transaction.objectStore(ARCHIVE_HANDLE_STORE_NAME)
    transaction.oncomplete = () => resolve(undefined as T)
    transaction.onerror = () => reject(transaction.error ?? new Error('Archive handle failed.'))
    run(store, resolve, reject)
  })
}

function readResumeRecords(): BrowserSocialImportResumeRecord[] {
  const storage = getResumeStorage()
  if (!storage) return []

  try {
    const parsed = JSON.parse(
      storage.getItem(RESUME_STORAGE_KEY) ?? '{"records":[]}'
    ) as ResumeStoragePayload
    return Array.isArray(parsed.records) ? parsed.records.flatMap(normalizeResumeRecord) : []
  } catch {
    return []
  }
}

function writeResumeRecords(records: BrowserSocialImportResumeRecord[]): void {
  const storage = getResumeStorage()
  if (!storage) return
  storage.setItem(RESUME_STORAGE_KEY, JSON.stringify({ records }))
}

function normalizeResumeRecord(value: unknown): BrowserSocialImportResumeRecord[] {
  if (!isRecord(value)) return []
  if (typeof value.jobId !== 'string') return []
  if (typeof value.archiveHandleId !== 'string') return []
  if (typeof value.archiveName !== 'string') return []
  if (!isRecord(value.manifest)) return []
  if (!isRecord(value.preview)) return []
  if (!isRecord(value.stageResult)) return []
  if (!Array.isArray(value.buckets)) return []
  if (typeof value.importedAt !== 'string') return []

  return [
    {
      jobId: value.jobId,
      archiveHandleId: value.archiveHandleId,
      archiveName: value.archiveName,
      manifest: value.manifest as ArchiveManifest,
      preview: value.preview as SocialImportArchivePreview,
      stageResult: value.stageResult as BrowserSocialImportStageResult,
      buckets: value.buckets.filter((bucket): bucket is string => typeof bucket === 'string'),
      includeSensitive: value.includeSensitive === true,
      includeSourceRecords: value.includeSourceRecords === true,
      importedAt: value.importedAt,
      processedRecords: numberOrZero(value.processedRecords),
      completedBatches: numberOrZero(value.completedBatches),
      created: numberOrZero(value.created),
      updated: numberOrZero(value.updated),
      updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : Date.now(),
      error: typeof value.error === 'string' ? value.error : null
    }
  ]
}

function isArchiveHandleRecord(value: unknown): value is ArchiveHandleRecord {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.updatedAt === 'number' &&
    isBrowserFileSystemFileHandle(value.handle)
  )
}

function isBrowserFileSystemFileHandle(value: unknown): value is BrowserFileSystemFileHandle {
  return (
    isRecord(value) &&
    value.kind === 'file' &&
    typeof value.name === 'string' &&
    typeof value.getFile === 'function'
  )
}

function createArchiveHandleId(file: File): string {
  return `archive-handle:${file.name}:${file.size}:${file.lastModified}`
}

function getWindowWithFilePicker(): WindowWithFilePicker {
  return window as WindowWithFilePicker
}

function getResumeStorage(): Storage | null {
  return typeof localStorage === 'undefined' ? null : localStorage
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
