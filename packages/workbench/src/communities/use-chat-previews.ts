import type { ChatLinkResolution, PreviewAsset } from './chat-media'
import type { AttachmentServices } from './ChatAttachment'
import type { MessageLinkPreview } from '@xnetjs/data'
import { useEffect, useMemo, useRef, useState } from 'react'
import { chatUrls } from './chat-media'

type Offer = { url: string; result?: ChatLinkResolution; error?: string }
export function useChatPreviews(draft: string, services: AttachmentServices, channelId: string) {
  const cache = useRef(new Map<string, Promise<Offer>>())
  const [offers, setOffers] = useState<Offer[]>([])
  const [dismissed, setDismissed] = useState<string[]>([])
  const urls = useMemo(
    () => chatUrls(draft).filter((url) => !dismissed.includes(url)),
    [draft, dismissed]
  )
  const key = urls.join('\n')
  const resolveLink = services.resolveLink
  const ensure = (url: string): Promise<Offer> => {
    const prior = cache.current.get(url)
    if (prior) return prior
    const job = resolveLink
      ? resolveLink(url).then(
          (result) => ({ url, result }),
          (cause: unknown) => ({
            url,
            error: cause instanceof Error ? cause.message : String(cause)
          })
        )
      : Promise.resolve({ url, error: 'Rich link previews are unavailable on this device.' })
    cache.current.set(url, job)
    if (cache.current.size > 6) cache.current.delete(cache.current.keys().next().value!)
    return job
  }
  useEffect(() => {
    setDismissed([])
    setOffers([])
    cache.current.clear()
  }, [channelId, resolveLink])
  useEffect(() => {
    let cancelled = false
    setOffers(urls.map((url) => ({ url })))
    const timer = setTimeout(() => {
      void Promise.all(urls.map(ensure)).then((value) => {
        if (!cancelled) setOffers(value)
      })
    }, 450)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // The URL key, resolver and channel are the complete request identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, resolveLink, channelId])
  const prepare = () => {
    const jobs = urls.map(ensure)
    return async (): Promise<MessageLinkPreview[]> => {
      const results = await Promise.all(jobs)
      const save = async (asset: PreviewAsset) => {
        if (!services.blobs) throw new Error('Preview file storage is not available.')
        const file = await services.blobs.upload(
          new File([new Uint8Array(asset.bytes)], asset.name, { type: asset.mimeType })
        )
        services.transfers?.enqueueUpload(file)
        return file
      }
      return Promise.all(
        results.map(async ({ result, url }) => ({
          ...(result?.preview ?? {
            url,
            kind: 'external' as const,
            title: new URL(url).host,
            domain: new URL(url).host,
            resolvedAt: Date.now()
          }),
          ...(result?.image ? { image: await save(result.image) } : {}),
          ...(result?.media ? { media: await save(result.media) } : {})
        }))
      )
    }
  }
  return {
    offers,
    prepare,
    dismiss: (url: string) => setDismissed((old) => [...old, url]),
    reset: () => {
      setDismissed([])
      setOffers([])
    }
  }
}
