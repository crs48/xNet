/**
 * useBackup - Encrypted backup hook for hub storage.
 */
import { useCallback, useContext, useMemo, useState } from 'react'
import { XNetContext } from '../context'
import { downloadBackup, uploadBackup } from '../hub/backup'

export interface UseBackupReturn {
  upload: (docId: string, plaintext: Uint8Array) => Promise<void>
  download: (docId: string) => Promise<Uint8Array | null>
  uploading: boolean
}

export function useBackup(): UseBackupReturn {
  const context = useContext(XNetContext)
  const [uploading, setUploading] = useState(false)

  const backupConfig = useMemo(() => {
    if (!context) return null
    if (!context.hubUrl || !context.encryptionKey) return null
    return {
      hubUrl: context.hubUrl,
      encryptionKey: context.encryptionKey,
      getAuthToken: context.getHubAuthToken
    }
  }, [context])

  const upload = useCallback(
    async (docId: string, plaintext: Uint8Array) => {
      if (!backupConfig) {
        throw new Error('Hub backup is not configured')
      }

      setUploading(true)
      try {
        await uploadBackup(backupConfig, docId, plaintext)
      } finally {
        setUploading(false)
      }
    },
    [backupConfig]
  )

  const download = useCallback(
    async (docId: string): Promise<Uint8Array | null> => {
      if (!backupConfig) return null
      return downloadBackup(backupConfig, docId)
    },
    [backupConfig]
  )

  return {
    upload,
    download,
    uploading
  }
}
