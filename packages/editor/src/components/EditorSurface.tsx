/**
 * EditorSurface - product surface wrapper for RichTextEditor.
 */
import type { EditorContentMode, ToolbarSurface } from './editor-ux-state'
import type { JSX, MouseEventHandler, ReactNode } from 'react'
import { cn } from '../utils'
import { RichTextEditor, type RichTextEditorProps } from './RichTextEditor'

export type EditorSurfaceMode = ToolbarSurface
export type EditorSurfaceDensity = 'default' | 'compact'

export type EditorSurfaceProps = Omit<RichTextEditorProps, 'toolbarSurface'> & {
  surfaceMode?: EditorSurfaceMode
  surfaceDensity?: EditorSurfaceDensity
  surfaceClassName?: string
  contentClassName?: string
  onSurfaceMouseDown?: MouseEventHandler<HTMLDivElement>
  children?: ReactNode
}

type SurfaceClassConfig = {
  root: string
  defaultRoot?: string
  compactRoot?: string
  content: string
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

export function EditorSurface({
  surfaceMode = 'page',
  surfaceDensity = 'default',
  surfaceClassName,
  contentClassName,
  onSurfaceMouseDown,
  children,
  className,
  contentMode,
  readOnly,
  ...editorProps
}: EditorSurfaceProps): JSX.Element {
  const config = SURFACE_CLASS_CONFIG[surfaceMode]
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
      data-canvas-editing-surface={surfaceMode === 'canvas-inline' ? 'true' : undefined}
      onMouseDown={onSurfaceMouseDown}
    >
      <div className={cn(config.content, contentClassName)} data-editor-surface-content="true">
        <RichTextEditor
          {...editorProps}
          className={className}
          contentMode={resolveSurfaceContentMode(surfaceMode, contentMode)}
          readOnly={resolveSurfaceReadOnly(surfaceMode, readOnly)}
          toolbarSurface={surfaceMode}
        />
        {children}
      </div>
    </div>
  )
}
