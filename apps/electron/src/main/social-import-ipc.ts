/**
 * Main-process IPC for local social graph archive imports.
 */

import type {
  SocialImportArchivePreview as SharedSocialImportArchivePreview,
  SocialImportNodeDraft as SharedSocialImportNodeDraft,
  SocialImportStageResult as SharedSocialImportStageResult
} from '@xnetjs/social/import/core'
import type { BrowserWindow, OpenDialogOptions } from 'electron'
import {
  createSocialArchivePreview,
  createZipJsonEntryReader,
  createZipTextEntryReader,
  readZipArchiveManifest,
  stageSocialArchive
} from '@xnetjs/social/import/node'
import { builtInSocialImportAdapters } from '@xnetjs/social/importers'
import { dialog, ipcMain } from 'electron'

export type SocialImportArchivePreview = Omit<SharedSocialImportArchivePreview, 'archivePath'> & {
  archivePath: string
}

export type SocialImportNodeDraft = SharedSocialImportNodeDraft

export type SocialImportStageRequest = {
  archivePath: string
  buckets?: string[]
  includeSensitive?: boolean
}

export type SocialImportStageResult = Omit<SharedSocialImportStageResult, 'archive'> & {
  archive: SocialImportArchivePreview
}

const adapters = builtInSocialImportAdapters
const approvedArchivePaths = new Set<string>()

export function setupSocialImportIPC(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('xnet:social-import:pickArchive', async () => {
    const window = getWindow()
    const result = window
      ? await dialog.showOpenDialog(window, archiveDialogOptions)
      : await dialog.showOpenDialog(archiveDialogOptions)

    if (result.canceled || result.filePaths.length === 0) return null

    const archivePath = result.filePaths[0]
    approvedArchivePaths.add(archivePath)
    return createArchivePreview(archivePath)
  })

  ipcMain.handle(
    'xnet:social-import:stageArchive',
    async (_event, request: SocialImportStageRequest): Promise<SocialImportStageResult> => {
      if (!approvedArchivePaths.has(request.archivePath)) {
        throw new Error('Archive was not selected through the social import picker')
      }

      return stageArchive(request)
    }
  )
}

const archiveDialogOptions: OpenDialogOptions = {
  title: 'Select social archive',
  properties: ['openFile'],
  filters: [{ name: 'ZIP archives', extensions: ['zip'] }]
}

async function createArchivePreview(archivePath: string): Promise<SocialImportArchivePreview> {
  const manifest = await readZipArchiveManifest(archivePath, { hashEntries: false })
  return requireArchivePath(await createSocialArchivePreview({ adapters, manifest }), archivePath)
}

async function stageArchive(request: SocialImportStageRequest): Promise<SocialImportStageResult> {
  const manifest = await readZipArchiveManifest(request.archivePath, { hashEntries: false })
  const readJsonEntry = await createZipJsonEntryReader(request.archivePath)
  const readTextEntry = await createZipTextEntryReader(request.archivePath)

  const result = await stageSocialArchive({
    manifest,
    adapters,
    readJsonEntry,
    readTextEntry,
    buckets: request.buckets,
    includeSensitive: request.includeSensitive
  })

  return {
    ...result,
    archive: requireArchivePath(result.archive, request.archivePath)
  }
}

function requireArchivePath(
  preview: SharedSocialImportArchivePreview,
  fallbackArchivePath: string
): SocialImportArchivePreview {
  return {
    ...preview,
    archivePath: preview.archivePath ?? fallbackArchivePath
  }
}
