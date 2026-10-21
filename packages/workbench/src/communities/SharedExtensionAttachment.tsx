import type { AttachmentServices } from './ConversationPane'
import type { SharedExtension } from './extension-versions'
import type { FileRef } from '@xnetjs/data'
import { Blocks } from 'lucide-react'
import { useState } from 'react'
import { EXTENSION_SHARE_LIMIT, readSharedExtension } from './extension-versions'
import { secondaryButton } from './primitives'

export function SharedExtensionAttachment({
  file,
  sender,
  services,
  onOpen
}: {
  file: FileRef
  sender: string
  services: AttachmentServices
  onOpen: (version: SharedExtension) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return (
    <div className="my-2 max-w-md space-y-2 rounded-xl border border-border p-3">
      <p className="flex items-center gap-2 text-sm font-medium">
        <Blocks size={16} />
        Shared extension
      </p>
      <p className="text-xs text-muted-foreground">
        Review, try or remix this version. It gets no data access until you approve it.
      </p>
      <button
        className={secondaryButton}
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          setError('')
          try {
            if (
              !Number.isSafeInteger(file.size) ||
              file.size <= 0 ||
              file.size > EXTENSION_SHARE_LIMIT
            )
              throw new Error('This extension exceeds the share limit.')
            if (!services.blobs) throw new Error('File storage is unavailable.')
            if (!(await services.blobs.has(file)) && services.transfers)
              await services.transfers.ensureLocal(file)
            const bytes = await services.blobs.getData(file)
            if (!bytes)
              throw new Error(
                'This extension has not downloaded yet. Try again when its sender is available.'
              )
            onOpen(await readSharedExtension(bytes, sender))
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Could not read this extension.')
          } finally {
            setBusy(false)
          }
        }}
      >
        {busy ? 'Reading source…' : 'Review shared extension'}
      </button>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
