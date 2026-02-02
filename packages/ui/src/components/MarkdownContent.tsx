/**
 * MarkdownContent - Renders GitHub-flavored markdown as styled HTML.
 *
 * Used for comment bodies and other short-form user content.
 * Supports: bold, italic, strikethrough, inline code, code blocks,
 * links, lists, task lists, tables, and blockquotes.
 *
 * Extensible via `customComponents` for future support of mentions,
 * tags, and page links.
 */
import React, { useMemo } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '../utils'

export interface MarkdownContentProps {
  /** Markdown string to render */
  content: string
  /** Additional CSS class names */
  className?: string
  /** Override or extend default element renderers (for mentions, tags, etc.) */
  customComponents?: Components
}

const remarkPlugins = [remarkGfm]

/** Default component overrides styled for compact comment contexts. */
const defaultComponents: Components = {
  // Paragraphs: no extra margin for single-paragraph content
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,

  // Inline code
  code: ({ children, className }) => {
    // Fenced code blocks get a language className like "language-js"
    const isBlock = typeof className === 'string' && className.startsWith('language-')
    if (isBlock) {
      return <code className={cn('block text-xs', className)}>{children}</code>
    }
    return <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">{children}</code>
  },

  // Code blocks
  pre: ({ children }) => (
    <pre className="my-2 rounded-md bg-muted p-2 overflow-x-auto text-xs">{children}</pre>
  ),

  // Links: open in new tab
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline hover:text-primary/80"
    >
      {children}
    </a>
  ),

  // Lists
  ul: ({ children }) => <ul className="my-1 ml-4 list-disc space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="my-1 ml-4 list-decimal space-y-0.5">{children}</ol>,
  li: ({ children }) => <li className="text-sm">{children}</li>,

  // Task list items (GFM)
  input: ({ checked, ...props }) => (
    <input
      type="checkbox"
      checked={checked}
      disabled
      className="mr-1.5 rounded border-muted-foreground/50"
      {...props}
    />
  ),

  // Blockquotes
  blockquote: ({ children }) => (
    <blockquote className="my-1 border-l-2 border-muted-foreground/30 pl-3 text-muted-foreground italic">
      {children}
    </blockquote>
  ),

  // Tables (GFM)
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="min-w-full text-xs border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="border-b border-border">{children}</thead>,
  th: ({ children }) => (
    <th className="px-2 py-1 text-left font-medium text-muted-foreground">{children}</th>
  ),
  td: ({ children }) => <td className="px-2 py-1 border-t border-border/50">{children}</td>,

  // Strikethrough (GFM)
  del: ({ children }) => <del className="text-muted-foreground">{children}</del>,

  // Headings: render as bold text (not full headings in comment context)
  h1: ({ children }) => <p className="mb-1 font-bold">{children}</p>,
  h2: ({ children }) => <p className="mb-1 font-bold">{children}</p>,
  h3: ({ children }) => <p className="mb-1 font-semibold">{children}</p>,

  // Horizontal rule
  hr: () => <hr className="my-2 border-border" />,

  // Images: render inline with max width
  img: ({ src, alt }) => <img src={src} alt={alt ?? ''} className="my-1 max-w-full rounded" />
}

export function MarkdownContent({ content, className, customComponents }: MarkdownContentProps) {
  const components = useMemo(
    () => (customComponents ? { ...defaultComponents, ...customComponents } : defaultComponents),
    [customComponents]
  )

  return (
    <div className={cn('markdown-content text-sm', className)}>
      <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
