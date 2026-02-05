/**
 * useFileUpload - Upload files to the hub by CID.
 */
import { hashHex } from '@xnet/crypto'
import { useCallback, useContext, useState } from 'react'
import { XNetContext } from '../context'

export interface FileRef {
  cid: string
  name: string
  mimeType: string
  size: number
}

export interface UseFileUploadReturn {
  upload: (file: File) => Promise<FileRef>
  uploading: boolean
  progress: number
}

const toHttpUrl = (hubUrl: string): string => {
  try {
    const url = new URL(hubUrl)
    if (url.protocol === 'ws:') url.protocol = 'http:'
    if (url.protocol === 'wss:') url.protocol = 'https:'
    return url.toString().replace(/\/$/, '')
  } catch {
    return hubUrl
  }
}

export function useFileUpload(): UseFileUploadReturn {
  const context = useContext(XNetContext)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)

  const upload = useCallback(
    async (file: File): Promise<FileRef> => {
      if (!context?.hubUrl) throw new Error('Hub URL not configured')

      setUploading(true)
      setProgress(0)

      try {
        const buffer = new Uint8Array(await file.arrayBuffer())
        setProgress(0.3)

        const cid = `cid:blake3:${hashHex(buffer)}`
        setProgress(0.5)

        const token = context.getHubAuthToken ? await context.getHubAuthToken() : ''
        const httpUrl = toHttpUrl(context.hubUrl)

        const res = await fetch(`${httpUrl}/files/${cid}`, {
          method: 'PUT',
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            'Content-Type': file.type || 'application/octet-stream',
            'X-File-Name': file.name
          },
          body: buffer
        })

        setProgress(0.9)

        if (!res.ok) {
          let message = `Upload failed: ${res.status}`
          try {
            const err = await res.json()
            if (err?.error) message = err.error
          } catch {
            // ignore parse errors
          }
          throw new Error(message)
        }

        setProgress(1)

        return {
          cid,
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          size: file.size
        }
      } finally {
        setUploading(false)
      }
    },
    [context]
  )

  return { upload, uploading, progress }
}
