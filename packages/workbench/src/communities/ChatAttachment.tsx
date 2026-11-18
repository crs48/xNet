import type { ResolveChatLink } from './chat-media'
import type { BlobService, BlobTransferQueue, FileRef } from '@xnetjs/data'
import { Download, File, Image, Video, Expand, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { fileMimeType, previewKind } from './chat-media'
import { bytesLabel } from './model'
import { IconButton, Modal } from './primitives'

export interface AttachmentServices {
  blobs: BlobService | null
  transfers?: BlobTransferQueue | null
  resolveLink?: ResolveChatLink
}

export function Attachment({
  file,
  services,
  compact = false
}: {
  file: FileRef
  services: AttachmentServices
  compact?: boolean
}) {
  const mime = fileMimeType(file.name, file.mimeType)
  const kind = previewKind(mime)
  const { cid, name, size } = file
  const [requested, setRequested] = useState(kind === 'image' && file.size <= 10 * 1024 * 1024)
  const [url, setUrl] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let disposed = false
    let objectUrl: string | undefined
    setUrl(null)
    if (!requested) return
    setBusy(true)
    setError('')
    void (async () => {
      if (!services.blobs) throw new Error('File storage is not available.')
      const reference = { cid, name, size, mimeType: mime }
      if (!(await services.blobs.has(reference)) && services.transfers)
        await services.transfers.ensureLocal(reference)
      if (disposed) return
      const bytes = await services.blobs.getData(reference)
      if (!bytes) throw new Error('This file is not available on this device yet.')
      if (disposed) return
      if (kind === 'pdf' && new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-')
        throw new Error('This file is not a valid PDF.')
      if (kind === 'text')
        setText(
          new TextDecoder().decode(bytes.slice(0, 200_000)) +
            (bytes.length > 200_000
              ? '\n… Preview truncated. Download to read the entire file.'
              : '')
        )
      objectUrl = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mime }))
      setUrl(objectUrl)
    })()
      .catch((cause: unknown) => {
        if (!disposed) setError(cause instanceof Error ? cause.message : String(cause))
      })
      .finally(() => {
        if (!disposed) setBusy(false)
      })
    return () => {
      disposed = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [cid, name, size, mime, kind, requested, attempt, services.blobs, services.transfers])
  const preview =
    url &&
    (kind === 'image' ? (
      <img
        src={url}
        alt={file.name}
        className={`${expanded ? 'max-h-[70vh]' : 'max-h-72'} w-full object-contain`}
        onError={() => setError('This image could not be decoded. You can still download it.')}
      />
    ) : kind === 'video' ? (
      <video
        src={url}
        controls
        preload="metadata"
        className="max-h-[65vh] w-full"
        onError={() =>
          setError('This video format cannot be played here. Download to open it in another app.')
        }
      />
    ) : kind === 'audio' ? (
      <audio
        src={url}
        controls
        preload="metadata"
        className="w-full"
        onError={() => setError('This audio format cannot be played here.')}
      />
    ) : kind === 'pdf' ? (
      <iframe
        src={`${url}#toolbar=1`}
        title={`PDF preview: ${file.name}`}
        className="h-[65vh] w-full rounded-lg border border-border"
      />
    ) : kind === 'text' ? (
      <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words p-4 text-xs">
        {text}
      </pre>
    ) : null)
  const open = () => {
    setRequested(true)
    if (error) setAttempt((value) => value + 1)
    if (kind === 'pdf' || kind === 'text' || (kind === 'image' && url)) setExpanded(true)
  }
  return (
    <div
      className={`my-2 overflow-hidden rounded-xl border border-border bg-background text-foreground shadow-sm ${compact ? 'max-w-md' : 'max-w-xl'}`}
    >
      {url && kind === 'image' && (
        <button
          type="button"
          className="block w-full bg-muted/20"
          aria-label={`Expand ${file.name}`}
          onClick={() => setExpanded(true)}
        >
          {preview}
        </button>
      )}
      {url && ['audio', 'video'].includes(kind) && preview}
      <div className={`${compact && url && !error ? 'hidden' : 'flex'} items-center gap-3 p-3`}>
        {busy ? (
          <Loader2 size={18} className="animate-spin" />
        ) : kind === 'image' ? (
          <Image size={18} />
        ) : kind === 'video' ? (
          <Video size={18} />
        ) : (
          <File size={18} />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium">{file.name}</p>
          <p className="text-[11px] text-muted-foreground">
            {kind === 'pdf' ? 'PDF · ' : ''}
            {bytesLabel(file.size)}
          </p>
        </div>
        {(!url || ['pdf', 'text'].includes(kind)) && (
          <button
            type="button"
            onClick={open}
            disabled={busy}
            className="rounded-lg px-2 py-1 text-xs font-medium hover:bg-muted"
          >
            {busy ? 'Loading…' : error ? 'Retry' : kind === 'file' ? 'Load file' : 'Preview'}
          </button>
        )}
        {url && (
          <a
            href={url}
            download={file.name}
            aria-label={`Download ${file.name}`}
            className="rounded-lg p-2 hover:bg-muted"
          >
            <Download size={17} />
          </a>
        )}
        {url && kind === 'image' && (
          <IconButton label={`Expand ${file.name}`} onClick={() => setExpanded(true)}>
            <Expand size={16} />
          </IconButton>
        )}
      </div>
      {error && (
        <p role="alert" className="px-3 pb-3 text-xs text-destructive">
          {error}
        </p>
      )}
      {expanded && (
        <Modal title={`Preview ${file.name}`} size="wide" onClose={() => setExpanded(false)}>
          {busy ? (
            <p role="status" className="p-8">
              Loading preview…
            </p>
          ) : error ? (
            <p role="alert" className="p-8">
              {error}
            </p>
          ) : (
            preview
          )}
        </Modal>
      )}
    </div>
  )
}
