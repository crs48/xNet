import type { MessageLinkPreview } from '@xnetjs/data'

export type PreviewAsset = { bytes: Uint8Array; mimeType: string; name: string }
export type ChatLinkResolution = {
  preview: MessageLinkPreview
  image?: PreviewAsset
  media?: PreviewAsset
  warning?: string
}
export type ResolveChatLink = (url: string) => Promise<ChatLinkResolution>
