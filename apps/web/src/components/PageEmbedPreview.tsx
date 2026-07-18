/**
 * PageEmbedPreview — summary-tier live transclusion of a page inside
 * another document (exploration 0346, Phase 1).
 *
 * Shows the target's live title plus its first blocks as read-only text,
 * updating as the target document syncs. Deliberately text-only: nested
 * embeds inside the target degrade to marker lines (extractDocPreviewLines),
 * so transclusion can never recurse.
 */
import { PageSchema } from '@xnetjs/data'
import { extractDocPreviewLines, type DocPreviewLine } from '@xnetjs/editor/react'
import { useNode } from '@xnetjs/react'
import { ChevronDown, ChevronRight, ExternalLink, FileText } from 'lucide-react'
import { useEffect, useState, type JSX } from 'react'

const SUMMARY_LINES = 3
const EXPANDED_LINES = 12

export interface PageEmbedPreviewProps {
  nodeId: string
  /** Title stored on the block — fallback while the node loads. */
  title: string
  onNavigate?: (href: string) => void
}

export function PageEmbedPreview({ nodeId, title, onNavigate }: PageEmbedPreviewProps): JSX.Element {
  const { data: page, doc, loading } = useNode(PageSchema, nodeId)
  const [expanded, setExpanded] = useState(false)
  const [lines, setLines] = useState<DocPreviewLine[]>([])

  const maxLines = expanded ? EXPANDED_LINES : SUMMARY_LINES

  // Live preview: recompute on every Y.Doc update. One extra line is
  // fetched to know whether an expand affordance is warranted.
  useEffect(() => {
    if (!doc) return
    const compute = () => setLines(extractDocPreviewLines(doc, maxLines + 1))
    compute()
    doc.on('update', compute)
    return () => doc.off('update', compute)
  }, [doc, maxLines])

  if (!loading && !page) {
    // Sealed frame (0346): target unreadable here — never an error.
    return (
      <div className="my-1 flex items-center gap-2 rounded-md border border-dashed border-border/60 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
        <FileText size={14} />
        <span>This page isn’t available in this workspace.</span>
      </div>
    )
  }

  const shown = lines.slice(0, maxLines)
  const canExpand = lines.length > SUMMARY_LINES

  return (
    <div
      data-page-embed-preview={nodeId}
      className="my-1 w-full overflow-hidden rounded-md border border-border/60 bg-background"
      contentEditable={false}
    >
      <div className="flex items-center gap-2 px-3 py-1.5">
        {canExpand ? (
          <button
            type="button"
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? 'Collapse preview' : 'Expand preview'}
            aria-expanded={expanded}
          >
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
        ) : (
          <FileText size={13} className="shrink-0 text-muted-foreground" />
        )}
        <button
          type="button"
          className="min-w-0 flex-1 truncate border-none bg-transparent p-0 text-left text-sm font-medium text-foreground hover:underline"
          onClick={() => onNavigate?.(nodeId)}
          title={`Open ${page?.title || title || 'page'}`}
        >
          {page?.title || title || 'Untitled'}
        </button>
        <button
          type="button"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => onNavigate?.(nodeId)}
          aria-label="Open page"
        >
          <ExternalLink size={13} />
        </button>
      </div>
      {shown.length > 0 && (
        <div className="border-t border-border/40 px-3 py-2">
          {shown.map((line, i) => (
            <p
              key={i}
              className={
                line.kind === 'heading'
                  ? 'truncate text-sm font-semibold text-foreground/90'
                  : 'truncate text-sm text-muted-foreground'
              }
            >
              {line.text}
            </p>
          ))}
          {!expanded && lines.length > shown.length && (
            <p className="text-xs text-muted-foreground/70">…</p>
          )}
        </div>
      )}
    </div>
  )
}
