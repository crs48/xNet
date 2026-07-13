/**
 * The xNet BlockNote schema (exploration 0312).
 *
 * SCHEMA-SKEW RULE (0205, unchanged from the TipTap era): everything
 * registered here defines the persisted document shape. Under Yjs
 * collaboration every peer MUST run the identical schema — a peer missing a
 * spec silently drops that content. Therefore this module is statically
 * bundled; plugin-contributed specs must be installed on every peer (the
 * plugins package guards this — see editor-schema-safety).
 */
import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs, defaultStyleSpecs } from '@blocknote/core'
import { AiGeneratedStyleSpec } from './specs/ai-generated'
import { CalloutBlockSpec } from './specs/callout'
import { DatabaseEmbedBlockSpec } from './specs/database-embed'
import { EmbedBlockSpec } from './specs/embed'
import { HashtagInlineSpec } from './specs/hashtag'
import { InlineMathSpec } from './specs/math'
import { MentionInlineSpec } from './specs/mention'
import { MermaidBlockSpec } from './specs/mermaid'
import { PageEmbedBlockSpec } from './specs/page-embed'
import { RichLinkBlockSpec } from './specs/rich-link'
import { TaskViewEmbedBlockSpec } from './specs/task-view-embed'
import { WikilinkInlineSpec } from './specs/wikilink'

/** Custom block specs added on top of BlockNote's defaults. */
export const xnetBlockSpecs = {
  callout: CalloutBlockSpec(),
  embed: EmbedBlockSpec(),
  pageEmbed: PageEmbedBlockSpec(),
  databaseEmbed: DatabaseEmbedBlockSpec(),
  taskViewEmbed: TaskViewEmbedBlockSpec(),
  mermaid: MermaidBlockSpec(),
  richLink: RichLinkBlockSpec()
}

/** Custom inline content specs. */
export const xnetInlineContentSpecs = {
  mention: MentionInlineSpec,
  hashtag: HashtagInlineSpec,
  wikilink: WikilinkInlineSpec,
  inlineMath: InlineMathSpec
}

/** Custom style specs. */
export const xnetStyleSpecs = {
  aiGenerated: AiGeneratedStyleSpec
}

export {
  EDITOR_DOCUMENT_SCHEMA_VERSION,
  EDITOR_DOCUMENT_FRAGMENT_FIELD,
  LEGACY_DOCUMENT_FRAGMENT_FIELD
} from './constants'

export function createXNetSchema() {
  return BlockNoteSchema.create({
    blockSpecs: {
      ...defaultBlockSpecs,
      ...xnetBlockSpecs
    },
    inlineContentSpecs: {
      ...defaultInlineContentSpecs,
      ...xnetInlineContentSpecs
    },
    styleSpecs: {
      ...defaultStyleSpecs,
      ...xnetStyleSpecs
    }
  })
}

export const xnetSchema = createXNetSchema()

export type XNetSchema = typeof xnetSchema
export type XNetEditorInstance = typeof xnetSchema.BlockNoteEditor
export type XNetBlock = typeof xnetSchema.Block
export type XNetPartialBlock = typeof xnetSchema.PartialBlock

/**
 * Names of every schema-defining spec (the skew-sensitive tier). Plugin
 * contributions are checked against this — contributing a spec name that
 * isn't statically bundled is a schema-skew hazard.
 */
export const XNET_SCHEMA_SPEC_NAMES: readonly string[] = [
  ...Object.keys(xnetBlockSpecs),
  ...Object.keys(xnetInlineContentSpecs),
  ...Object.keys(xnetStyleSpecs)
]
