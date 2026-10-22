import type { AttachmentServices } from './ChatAttachment'
import type { FileRef, MessageLinkPreview } from '@xnetjs/data'
import { MarkdownContent, safeHref } from '@xnetjs/ui'
import { Play, ExternalLink } from 'lucide-react'
import { useMemo, useState } from 'react'
import { chatUrls, publicChatUrl, youtubeEmbed } from './chat-media'
import { Attachment } from './ChatAttachment'

function safeFile(value: unknown): value is FileRef {
  if (!value || typeof value !== 'object') return false
  const file = value as Record<string, unknown>
  return (
    typeof file.cid === 'string' &&
    file.cid.length < 256 &&
    typeof file.name === 'string' &&
    typeof file.mimeType === 'string' &&
    typeof file.size === 'number' &&
    Number.isFinite(file.size) &&
    file.size >= 0 &&
    file.size <= 100 * 1024 * 1024
  )
}
export function chatPreviews(content: string, value: unknown): MessageLinkPreview[] {
  const stored = Array.isArray(value) ? value : []
  return chatUrls(content)
    .filter(
      (url) =>
        !Array.isArray(value) ||
        stored.some(
          (item) => item && typeof item === 'object' && publicChatUrl(item.url ?? '') === url
        )
    )
    .map((url) => {
      const entry: unknown = stored.find(
        (item) => item && typeof item === 'object' && publicChatUrl(item.url ?? '') === url
      )
      const item = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {}
      return {
        url,
        kind: 'external',
        domain: new URL(url).host,
        resolvedAt: 0,
        title:
          typeof item.title === 'string'
            ? item.title.slice(0, 200)
            : youtubeEmbed(url)
              ? 'YouTube video'
              : new URL(url).host,
        description:
          typeof item.description === 'string' ? item.description.slice(0, 400) : undefined,
        image: safeFile(item.image) ? item.image : undefined,
        media: safeFile(item.media) ? item.media : undefined
      }
    })
}

export function ChatLinkCard({
  preview,
  services
}: {
  preview: MessageLinkPreview
  services: AttachmentServices
}) {
  const [playing, setPlaying] = useState(false)
  const embed = youtubeEmbed(preview.url)
  return (
    <div
      className="my-3 max-w-xl overflow-hidden rounded-xl border border-border bg-muted/20"
      aria-label={`Link preview: ${preview.title}`}
    >
      {embed &&
        (playing ? (
          <iframe
            src={embed}
            title={preview.title}
            className="aspect-video min-h-[200px] w-full"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            sandbox="allow-scripts allow-same-origin allow-presentation"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label={`Play ${preview.title}`}
            className="flex min-h-28 w-full items-center justify-center gap-3 bg-muted px-5 py-6 text-sm font-medium hover:bg-muted/70"
          >
            <Play size={28} fill="currentColor" />
            Play on YouTube
          </button>
        ))}
      {!playing && preview.image && (
        <div className="px-3">
          <Attachment file={preview.image} services={services} compact />
        </div>
      )}
      <a
        href={preview.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block p-4 hover:bg-muted/40"
      >
        <div className="mb-1 flex items-center gap-2 text-[11px] text-muted-foreground">
          {preview.domain}
          <ExternalLink size={11} />
        </div>
        <p className="line-clamp-2 text-sm font-semibold">{preview.title}</p>
        {preview.description && (
          <p className="mt-1 line-clamp-3 text-xs leading-5 text-muted-foreground">
            {preview.description}
          </p>
        )}
      </a>
      {preview.media && (
        <div className="px-3 pb-1">
          <Attachment file={preview.media} services={services} />
        </div>
      )}
    </div>
  )
}

export function ChatContent({
  content,
  previews,
  services
}: {
  content: string
  previews?: unknown
  services: AttachmentServices
}) {
  const links = useMemo(() => chatPreviews(content, previews), [content, previews])
  return (
    <>
      <MarkdownContent
        content={content}
        className="break-words text-[14px] leading-[1.65] [&_p]:whitespace-pre-wrap [&_pre]:whitespace-pre [&_h4]:font-semibold [&_h5]:font-semibold [&_h6]:font-semibold"
        customComponents={{
          a: ({ href, children }) => {
            const safe = href ? safeHref(href) : null
            return safe ? (
              <a
                href={safe}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:opacity-70"
              >
                {children}
              </a>
            ) : (
              <span>{children}</span>
            )
          },
          img: ({ alt }) => (
            <span className="text-xs text-muted-foreground">
              {alt ? `Image: ${alt}` : 'Image'} · preview below
            </span>
          )
        }}
      />
      {links.map((preview) => (
        <ChatLinkCard key={preview.url} preview={preview} services={services} />
      ))}
    </>
  )
}
