/**
 * Embed provider registry.
 *
 * The editor surface re-exports the shared data-layer embed parser so block
 * embeds, smart references, and canvas external-reference nodes resolve the
 * same provider metadata.
 */

export { EMBED_PROVIDERS, type EmbedProvider, parseEmbedUrl } from '@xnetjs/data'
export { detectEmbedProvider as detectProvider } from '@xnetjs/data'
