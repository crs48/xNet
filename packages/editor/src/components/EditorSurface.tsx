/**
 * EditorSurface - product surface wrapper for RichTextEditor.
 */
import type { EditorContentMode, ToolbarSurface } from './editor-ux-state'
import type { ErrorInfo, JSX, MouseEventHandler, ReactNode } from 'react'
import { Component } from 'react'
import { cn } from '../utils'
import { RichTextEditor, type RichTextEditorProps } from './RichTextEditor'

export type EditorSurfaceMode = ToolbarSurface
export type EditorSurfaceDensity = 'default' | 'compact'
export type EditorRolloutMode = Extract<EditorContentMode, 'live' | 'source' | 'read'>

export type EditorSurfaceProps = Omit<RichTextEditorProps, 'toolbarSurface'> & {
  surfaceMode?: EditorSurfaceMode
  surfaceDensity?: EditorSurfaceDensity
  surfaceClassName?: string
  contentClassName?: string
  onSurfaceMouseDown?: MouseEventHandler<HTMLDivElement>
  children?: ReactNode
}

export const EDITOR_ROLLOUT_MODE_STORAGE_KEY = 'xnet:pages:editor:rollout-mode'

type EditorSurfaceErrorBoundaryProps = {
  surfaceMode: EditorSurfaceMode
  children: ReactNode
}

type EditorSurfaceErrorBoundaryState = {
  error: Error | null
}

type SurfaceClassConfig = {
  root: string
  defaultRoot?: string
  compactRoot?: string
  content: string
}

export class EditorSurfaceErrorBoundary extends Component<
  EditorSurfaceErrorBoundaryProps,
  EditorSurfaceErrorBoundaryState
> {
  state: EditorSurfaceErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): EditorSurfaceErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    if (typeof console !== 'undefined') {
      console.error('[EditorSurface] Failed to render editor content', error, errorInfo)
    }
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div
          className="flex min-h-[160px] flex-1 items-center justify-center rounded-lg border border-dashed border-border/70 bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground"
          data-editor-surface-fallback="true"
          data-editor-surface-fallback-mode={this.props.surfaceMode}
          role="alert"
        >
          This content cannot be displayed because this editor surface is missing support for part
          of the document.
        </div>
      )
    }

    return this.props.children
  }
}

const SURFACE_CLASS_CONFIG: Record<EditorSurfaceMode, SurfaceClassConfig> = {
  page: {
    root: 'flex-1 overflow-auto',
    defaultRoot: 'px-6 py-6',
    compactRoot: 'px-4 py-4',
    content: 'mx-auto flex min-h-full w-full max-w-3xl flex-col pb-24'
  },
  'canvas-inline': {
    root: 'h-full min-h-0 flex-1 overflow-hidden',
    content: 'flex h-full min-h-0 w-full flex-col'
  },
  'canvas-preview': {
    root: 'h-full min-h-0 overflow-hidden',
    content: 'flex h-full min-h-0 w-full flex-col'
  },
  read: {
    root: 'h-full min-h-0 overflow-auto',
    content: 'mx-auto flex min-h-full w-full max-w-3xl flex-col'
  }
}

const SURFACE_EDITOR_LABELS: Record<EditorSurfaceMode, string> = {
  page: 'Page body',
  'canvas-inline': 'Canvas page body',
  'canvas-preview': 'Canvas page preview',
  read: 'Read-only page body'
}

function resolveSurfaceContentMode(
  surfaceMode: EditorSurfaceMode,
  contentMode?: EditorContentMode
): EditorContentMode {
  return surfaceMode === 'read' || surfaceMode === 'canvas-preview'
    ? 'read'
    : (contentMode ?? 'live')
}

function resolveSurfaceReadOnly(surfaceMode: EditorSurfaceMode, readOnly?: boolean): boolean {
  return readOnly === true || surfaceMode === 'read' || surfaceMode === 'canvas-preview'
}

function isEditorRolloutMode(value: string | null): value is EditorRolloutMode {
  return value === 'live' || value === 'source' || value === 'read'
}

export function readEditorRolloutMode(): EditorRolloutMode | null {
  if (typeof window === 'undefined') return null

  try {
    const value = window.localStorage.getItem(EDITOR_ROLLOUT_MODE_STORAGE_KEY)
    return isEditorRolloutMode(value) ? value : null
  } catch {
    return null
  }
}

export function resolveEditorSurfaceContentMode(input: {
  surfaceMode: EditorSurfaceMode
  contentMode?: EditorContentMode
  readOnly?: boolean
  rolloutMode?: EditorRolloutMode | null
}): EditorContentMode {
  const baseMode = resolveSurfaceContentMode(input.surfaceMode, input.contentMode)

  if (resolveSurfaceReadOnly(input.surfaceMode, input.readOnly)) {
    return 'read'
  }

  if (input.rolloutMode === 'source' || input.rolloutMode === 'read') {
    return input.rolloutMode
  }

  return baseMode
}

export function EditorSurface({
  surfaceMode = 'page',
  surfaceDensity = 'default',
  surfaceClassName,
  contentClassName,
  onSurfaceMouseDown,
  children,
  className,
  contentMode,
  editorLabel,
  readOnly,
  ...editorProps
}: EditorSurfaceProps): JSX.Element {
  const config = SURFACE_CLASS_CONFIG[surfaceMode]
  const resolvedContentMode = resolveEditorSurfaceContentMode({
    surfaceMode,
    contentMode,
    readOnly,
    rolloutMode: readEditorRolloutMode()
  })
  const defaultRootClass =
    surfaceDensity === 'default' && config.defaultRoot ? config.defaultRoot : undefined
  const compactRootClass =
    surfaceDensity === 'compact' && config.compactRoot ? config.compactRoot : undefined

  return (
    <div
      className={cn(
        'xnet-editor-surface min-h-0',
        config.root,
        defaultRootClass,
        compactRootClass,
        surfaceClassName
      )}
      data-editor-surface="true"
      data-editor-surface-mode={surfaceMode}
      data-editor-surface-density={surfaceDensity}
      data-editor-rollout-content-mode={resolvedContentMode}
      data-canvas-editing-surface={surfaceMode === 'canvas-inline' ? 'true' : undefined}
      onMouseDown={onSurfaceMouseDown}
    >
      <div className={cn(config.content, contentClassName)} data-editor-surface-content="true">
        <EditorSurfaceErrorBoundary surfaceMode={surfaceMode}>
          <RichTextEditor
            {...editorProps}
            className={className}
            contentMode={resolvedContentMode}
            editorLabel={editorLabel ?? SURFACE_EDITOR_LABELS[surfaceMode]}
            readOnly={resolveSurfaceReadOnly(surfaceMode, readOnly)}
            toolbarSurface={surfaceMode}
          />
        </EditorSurfaceErrorBoundary>
        {children}
      </div>
    </div>
  )
}
