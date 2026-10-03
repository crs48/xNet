import type { LibraryResource, LibrarySearchResult } from '../../shared/library'
import { useEffect, useState } from 'react'

export const libraryTimestamp = (ms: number) =>
  `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`

export function LibraryThumbnail({
  resource
}: {
  resource: Pick<LibraryResource, 'thumbnail' | 'platform'>
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const cid = resource.thumbnail?.cid
  const contentType = resource.thumbnail?.contentType
  useEffect(() => {
    let active = true
    let objectUrl: string | null = null
    setUrl(null)
    setFailed(false)
    if (cid) {
      void window.xnetBSM
        .getBlob(cid)
        .then((bytes) => {
          if (!active) return
          if (!bytes) {
            setFailed(true)
            return
          }
          objectUrl = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: contentType }))
          setUrl(objectUrl)
        })
        .catch(() => {
          if (active) setFailed(true)
        })
    }
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [cid, contentType])
  return url && !failed ? (
    <img
      src={url}
      alt=""
      className="aspect-video w-full rounded-md object-cover"
      onError={() => setFailed(true)}
    />
  ) : (
    <div className="flex aspect-video items-center justify-center rounded-md bg-secondary px-4 text-center text-xs text-muted-foreground">
      {resource.platform} · {failed ? 'Saved image could not be read' : 'No saved thumbnail yet'}
    </div>
  )
}

export function LibraryResourceCard({
  resource,
  onSelect,
  caption
}: {
  resource: LibrarySearchResult
  onSelect: () => void
  caption?: string
}) {
  return (
    <button
      className="space-y-2 rounded-lg border border-border p-3 text-left hover:bg-accent/40"
      onClick={onSelect}
    >
      {caption && <p className="text-xs text-muted-foreground">{caption}</p>}
      <LibraryThumbnail resource={resource} />
      <p className="text-xs text-muted-foreground">
        {resource.platform}{' '}
        {resource.metadata?.author
          ? `· ${resource.metadata.author}`
          : resource.actor
            ? `· ${resource.actor}`
            : ''}
      </p>
      <h2 className="line-clamp-2 font-medium">{resource.metadata?.title || resource.title}</h2>
      <p className="line-clamp-3 text-sm text-muted-foreground">
        {resource.snippet ||
          resource.metadata?.description ||
          resource.sourceText ||
          'Waiting for source details.'}
      </p>
      {resource.startMs !== undefined && (
        <p className="text-xs">Transcript match at {libraryTimestamp(resource.startMs)}</p>
      )}
    </button>
  )
}
