/**
 * Command-palette command table for the desktop shell, extracted from
 * App.tsx. Pure declarative wiring: every command delegates to the
 * document-shell handlers or the CanvasView imperative handle.
 */
import type { DocumentItem, ShellState } from './shell-state'
import type { CanvasViewCommandState, CanvasViewHandle } from '../components/CanvasView'
import type { PaletteCommand } from '@xnetjs/ui'
import type { RefObject } from 'react'
import { CANVAS_PLANNING_TEMPLATE_DEFINITIONS } from '@xnetjs/canvas'
import { useMemo } from 'react'
import { STORIES_ENABLED } from './use-document-shell'

const MOD_ENTER_SHORTCUT = navigator.platform.includes('Mac') ? '⌘↩' : 'Ctrl+Enter'

export interface ShellPaletteCommandsOptions {
  canvasViewRef: RefObject<CanvasViewHandle>
  canvasCommandState: CanvasViewCommandState
  isCanvasInteractiveShell: boolean
  shellKind: ShellState['kind']
  recentDocuments: DocumentItem[]
  handleCreateLinkedDocument: (type: 'page' | 'database') => Promise<void>
  handleCreateCanvasNote: () => void
  handleOpenDocument: (docId: string) => void
  handleOpenSettings: () => void
  handleOpenSocialImport: () => void
  handleOpenDataWorkspace: () => void
  handleOpenStories: () => void
}

export function useShellPaletteCommands(options: ShellPaletteCommandsOptions): PaletteCommand[] {
  const {
    canvasViewRef,
    canvasCommandState,
    isCanvasInteractiveShell,
    shellKind,
    recentDocuments,
    handleCreateLinkedDocument,
    handleCreateCanvasNote,
    handleOpenDocument,
    handleOpenSettings,
    handleOpenSocialImport,
    handleOpenDataWorkspace,
    handleOpenStories
  } = options

  return useMemo<PaletteCommand[]>(
    () => [
      {
        id: 'create-page',
        name: 'Create Page',
        description: 'Create a new page and place it on the canvas',
        icon: 'file-text',
        shortcut: 'P',
        group: 'Canvas',
        keywords: ['page', 'canvas', 'create'],
        execute: () => void handleCreateLinkedDocument('page')
      },
      {
        id: 'create-database',
        name: 'Create Database',
        description: 'Create a new database and place it on the canvas',
        icon: 'database',
        shortcut: 'D',
        group: 'Canvas',
        keywords: ['database', 'canvas', 'create'],
        execute: () => void handleCreateLinkedDocument('database')
      },
      {
        id: 'create-note',
        name: 'Create Canvas Note',
        description: 'Create a page-backed note and place it on the canvas',
        icon: 'sparkles',
        shortcut: 'N',
        group: 'Canvas',
        keywords: ['note', 'canvas', 'create'],
        execute: () => handleCreateCanvasNote()
      },
      {
        id: 'create-rectangle',
        name: 'Create Rectangle',
        description: 'Create a canvas-native rectangle on the current board',
        icon: 'square',
        shortcut: 'R',
        group: 'Canvas',
        keywords: ['shape', 'rectangle', 'canvas', 'create'],
        when: () => isCanvasInteractiveShell,
        execute: () => {
          canvasViewRef.current?.createShape('rectangle')
        }
      },
      {
        id: 'create-frame',
        name: 'Create Frame',
        description: 'Create an empty frame container on the current board',
        icon: 'layout',
        shortcut: 'F',
        group: 'Canvas',
        keywords: ['frame', 'group', 'canvas', 'create'],
        when: () => isCanvasInteractiveShell,
        execute: () => {
          canvasViewRef.current?.createFrame()
        }
      },
      ...CANVAS_PLANNING_TEMPLATE_DEFINITIONS.map<PaletteCommand>((template) => ({
        id: `create-canvas-template-${template.id}`,
        name: `Create ${template.name}`,
        description: template.description,
        icon: 'layout',
        group: 'Canvas',
        keywords: ['template', template.category, template.name, 'canvas', 'planning'],
        when: () => isCanvasInteractiveShell,
        execute: () => {
          canvasViewRef.current?.createPlanningTemplate(template.id)
        }
      })),
      {
        id: 'frame-selection',
        name: 'Frame Selection',
        description: 'Wrap the selected canvas objects in a frame container',
        icon: 'layout',
        shortcut: 'Mod+Shift+F',
        group: 'Canvas',
        keywords: ['frame', 'group', 'selection', 'canvas'],
        when: () => isCanvasInteractiveShell && canvasCommandState.selectionCount > 0,
        execute: () => {
          canvasViewRef.current?.wrapSelectionInFrame()
        }
      },
      {
        id: 'canvas-refresh-query-frame',
        name: 'Refresh Query Frame',
        description:
          canvasCommandState.selectedTitle && canvasCommandState.selectedIsQueryFrame
            ? `Refresh ${canvasCommandState.selectedTitle}`
            : 'Refresh the selected query frame',
        icon: 'refresh-cw',
        group: 'Canvas',
        keywords: ['refresh', 'query', 'frame', 'lens', 'canvas'],
        when: () => isCanvasInteractiveShell && canvasCommandState.selectedIsQueryFrame,
        execute: () => {
          canvasViewRef.current?.refreshSelectedQueryFrame()
        }
      },
      {
        id: 'canvas-connect-selection',
        name: 'Connect Selection',
        description: 'Create a connector between the two selected canvas objects',
        icon: 'link',
        shortcut: 'Mod+Shift+K',
        group: 'Canvas',
        keywords: ['connect', 'connector', 'edge', 'selection', 'canvas'],
        when: () => isCanvasInteractiveShell && canvasCommandState.selectionCount === 2,
        execute: () => {
          canvasViewRef.current?.connectSelection()
        }
      },
      {
        id: 'canvas-rename-alias',
        name: 'Rename Canvas Alias',
        description:
          canvasCommandState.selectedTitle && canvasCommandState.selectionCount === 1
            ? `Rename the canvas copy of ${canvasCommandState.selectedTitle}`
            : 'Rename the selected canvas object without changing the source title',
        icon: 'pencil',
        shortcut: 'Mod+Shift+A',
        group: 'Canvas',
        keywords: ['alias', 'rename', 'selection', 'canvas'],
        when: () =>
          isCanvasInteractiveShell &&
          canvasCommandState.selectionCount === 1 &&
          Boolean(canvasCommandState.selectedSourceId),
        execute: () => {
          canvasViewRef.current?.openAliasEditor()
        }
      },
      {
        id: 'canvas-clear-alias',
        name: 'Clear Canvas Alias',
        description: 'Remove the canvas-local alias from the selected object',
        icon: 'x',
        group: 'Canvas',
        keywords: ['alias', 'clear', 'selection', 'canvas'],
        when: () =>
          isCanvasInteractiveShell &&
          canvasCommandState.selectionCount === 1 &&
          Boolean(canvasCommandState.selectedSourceId),
        execute: () => {
          canvasViewRef.current?.clearSelectionAlias()
        }
      },
      {
        id: 'canvas-comment-selection',
        name: 'Comment on Selection',
        description:
          canvasCommandState.selectedTitle && canvasCommandState.selectionCount === 1
            ? `Add a canvas-anchored comment to ${canvasCommandState.selectedTitle}`
            : 'Add a canvas-anchored comment to the selected object',
        icon: 'message-square',
        shortcut: 'Mod+Shift+C',
        group: 'Canvas',
        keywords: ['comment', 'selection', 'canvas', 'feedback'],
        when: () => isCanvasInteractiveShell && canvasCommandState.selectionCount === 1,
        execute: () => {
          canvasViewRef.current?.openCommentComposer()
        }
      },
      {
        id: 'canvas-show-linked-copies',
        name: 'Show Linked Copies',
        description: 'Inspect other canvas objects that point at the same source node',
        icon: 'copy',
        group: 'Canvas',
        keywords: ['references', 'copies', 'linked', 'canvas'],
        when: () =>
          isCanvasInteractiveShell &&
          canvasCommandState.selectionCount === 1 &&
          Boolean(canvasCommandState.selectedSourceId),
        execute: () => {
          canvasViewRef.current?.toggleSourceReferences(true)
        }
      },
      {
        id: 'canvas-peek-selection',
        name: 'Peek Selected Object',
        description:
          canvasCommandState.selectedTitle && canvasCommandState.selectionCount === 1
            ? `Center and activate ${canvasCommandState.selectedTitle}`
            : 'Center and activate the current canvas selection',
        icon: 'eye',
        shortcut: 'Enter',
        group: 'Canvas',
        keywords: ['peek', 'edit', 'selection', 'canvas'],
        when: () => shellKind === 'canvas-home' && canvasCommandState.selectionCount === 1,
        execute: () => {
          canvasViewRef.current?.openSelection('peek')
        }
      },
      {
        id: 'canvas-open-selection',
        name: 'Open Selected Object',
        description:
          canvasCommandState.selectedTitle && canvasCommandState.selectionCount === 1
            ? `Open ${canvasCommandState.selectedTitle} in a focused surface`
            : 'Open the current canvas selection in a focused surface',
        icon: 'external-link',
        shortcut: MOD_ENTER_SHORTCUT,
        group: 'Canvas',
        keywords: ['open', 'focus', 'selection', 'canvas'],
        when: () =>
          isCanvasInteractiveShell &&
          canvasCommandState.selectionCount === 1 &&
          Boolean(canvasCommandState.selectedSourceId && canvasCommandState.selectedSourceType),
        execute: () => {
          canvasViewRef.current?.openSelection('focus')
        }
      },
      {
        id: 'canvas-open-database-split',
        name: 'Open Database in Split View',
        description:
          canvasCommandState.selectedTitle && canvasCommandState.selectionCount === 1
            ? `Keep ${canvasCommandState.selectedTitle} open beside the canvas`
            : 'Open the selected database in a split view beside the canvas',
        icon: 'columns',
        shortcut: 'Alt+Enter',
        group: 'Canvas',
        keywords: ['split', 'database', 'canvas', 'preview'],
        when: () =>
          isCanvasInteractiveShell &&
          canvasCommandState.selectionCount === 1 &&
          canvasCommandState.selectedDisplayType === 'database' &&
          Boolean(canvasCommandState.selectedSourceId),
        execute: () => {
          canvasViewRef.current?.openSelection('split')
        }
      },
      {
        id: 'canvas-fit-selection',
        name: 'Fit Selected Object',
        description: 'Center the current canvas selection in view',
        icon: 'layout',
        group: 'Canvas',
        keywords: ['fit', 'selection', 'zoom', 'canvas'],
        when: () => isCanvasInteractiveShell && canvasCommandState.selectionCount > 0,
        execute: () => {
          canvasViewRef.current?.fitSelection()
        }
      },
      {
        id: 'canvas-toggle-lock',
        name: canvasCommandState.selectionAllLocked ? 'Unlock Selection' : 'Lock Selection',
        description: canvasCommandState.selectionAllLocked
          ? 'Allow the current selection to move and resize again'
          : 'Protect the current selection from accidental moves and nudges',
        icon: 'lock',
        shortcut: 'Mod+Shift+L',
        group: 'Canvas',
        keywords: ['lock', 'unlock', 'selection', 'canvas'],
        when: () => isCanvasInteractiveShell && canvasCommandState.selectionCount > 0,
        execute: () => {
          canvasViewRef.current?.toggleSelectionLock()
        }
      },
      {
        id: 'canvas-align-left',
        name: 'Align Selection Left',
        description: 'Snap the selected objects to a shared left edge',
        icon: 'align-start-horizontal',
        shortcut: 'Mod+Shift+Left',
        group: 'Canvas',
        keywords: ['align', 'left', 'selection', 'canvas'],
        when: () => isCanvasInteractiveShell && canvasCommandState.selectionCount > 1,
        execute: () => {
          canvasViewRef.current?.alignSelection('left')
        }
      },
      {
        id: 'canvas-align-right',
        name: 'Align Selection Right',
        description: 'Snap the selected objects to a shared right edge',
        icon: 'align-end-horizontal',
        shortcut: 'Mod+Shift+Right',
        group: 'Canvas',
        keywords: ['align', 'right', 'selection', 'canvas'],
        when: () => isCanvasInteractiveShell && canvasCommandState.selectionCount > 1,
        execute: () => {
          canvasViewRef.current?.alignSelection('right')
        }
      },
      {
        id: 'canvas-align-top',
        name: 'Align Selection Top',
        description: 'Snap the selected objects to a shared top edge',
        icon: 'align-start-vertical',
        shortcut: 'Mod+Shift+Up',
        group: 'Canvas',
        keywords: ['align', 'top', 'selection', 'canvas'],
        when: () => isCanvasInteractiveShell && canvasCommandState.selectionCount > 1,
        execute: () => {
          canvasViewRef.current?.alignSelection('top')
        }
      },
      {
        id: 'canvas-align-bottom',
        name: 'Align Selection Bottom',
        description: 'Snap the selected objects to a shared bottom edge',
        icon: 'align-end-vertical',
        shortcut: 'Mod+Shift+Down',
        group: 'Canvas',
        keywords: ['align', 'bottom', 'selection', 'canvas'],
        when: () => isCanvasInteractiveShell && canvasCommandState.selectionCount > 1,
        execute: () => {
          canvasViewRef.current?.alignSelection('bottom')
        }
      },
      {
        id: 'canvas-distribute-horizontal',
        name: 'Distribute Selection Horizontally',
        description: 'Even out the horizontal spacing between selected objects',
        icon: 'columns',
        group: 'Canvas',
        keywords: ['distribute', 'horizontal', 'selection', 'canvas'],
        when: () => isCanvasInteractiveShell && canvasCommandState.selectionCount > 2,
        execute: () => {
          canvasViewRef.current?.distributeSelection('horizontal')
        }
      },
      {
        id: 'canvas-distribute-vertical',
        name: 'Distribute Selection Vertically',
        description: 'Even out the vertical spacing between selected objects',
        icon: 'rows',
        group: 'Canvas',
        keywords: ['distribute', 'vertical', 'selection', 'canvas'],
        when: () => isCanvasInteractiveShell && canvasCommandState.selectionCount > 2,
        execute: () => {
          canvasViewRef.current?.distributeSelection('vertical')
        }
      },
      {
        id: 'canvas-tidy-selection',
        name: 'Tidy Selection',
        description: 'Pack the selected objects into a clean reading grid',
        icon: 'sparkles',
        group: 'Canvas',
        keywords: ['tidy', 'arrange', 'selection', 'canvas'],
        when: () => isCanvasInteractiveShell && canvasCommandState.selectionCount > 1,
        execute: () => {
          canvasViewRef.current?.tidySelection()
        }
      },
      {
        id: 'canvas-cluster-selection',
        name: 'Cluster Selection',
        description: 'Pull selected objects into a compact planning cluster',
        icon: 'sparkles',
        group: 'Canvas',
        keywords: ['cluster', 'arrange', 'selection', 'canvas'],
        when: () => isCanvasInteractiveShell && canvasCommandState.selectionCount > 1,
        execute: () => {
          canvasViewRef.current?.clusterSelection()
        }
      },
      {
        id: 'canvas-stack-selection',
        name: 'Stack Selection',
        description: 'Stack selected objects into an offset pile',
        icon: 'layers',
        group: 'Canvas',
        keywords: ['stack', 'pile', 'arrange', 'selection', 'canvas'],
        when: () => isCanvasInteractiveShell && canvasCommandState.selectionCount > 1,
        execute: () => {
          canvasViewRef.current?.stackSelection()
        }
      },
      {
        id: 'canvas-convert-selection-mind-map',
        name: 'Convert Selection To Mind Map',
        description: 'Create a mind-map root and convert the selected objects into branches',
        icon: 'git-branch',
        group: 'Canvas',
        keywords: ['convert', 'mind map', 'selection', 'canvas'],
        when: () => isCanvasInteractiveShell && canvasCommandState.selectionCount > 0,
        execute: () => {
          canvasViewRef.current?.convertSelectionToMindMap()
        }
      },
      {
        id: 'canvas-send-backward',
        name: 'Send Selection Backward',
        description: 'Move the selected objects back one layer',
        icon: 'minus',
        shortcut: '[',
        group: 'Canvas',
        keywords: ['backward', 'z-index', 'layer', 'selection', 'canvas'],
        when: () => isCanvasInteractiveShell && canvasCommandState.selectionCount > 0,
        execute: () => {
          canvasViewRef.current?.shiftSelectionLayer('backward')
        }
      },
      {
        id: 'canvas-bring-forward',
        name: 'Bring Selection Forward',
        description: 'Move the selected objects forward one layer',
        icon: 'plus',
        shortcut: ']',
        group: 'Canvas',
        keywords: ['forward', 'z-index', 'layer', 'selection', 'canvas'],
        when: () => isCanvasInteractiveShell && canvasCommandState.selectionCount > 0,
        execute: () => {
          canvasViewRef.current?.shiftSelectionLayer('forward')
        }
      },
      {
        id: 'canvas-clear-selection',
        name: 'Clear Selection',
        description: 'Clear the current canvas selection',
        icon: 'x',
        shortcut: 'Esc',
        group: 'Canvas',
        keywords: ['clear', 'selection', 'canvas'],
        when: () => isCanvasInteractiveShell && canvasCommandState.selectionCount > 0,
        execute: () => {
          canvasViewRef.current?.clearSelection()
        }
      },
      {
        id: 'canvas-shortcut-help',
        name: canvasCommandState.shortcutHelpOpen
          ? 'Hide Canvas Shortcuts'
          : 'Show Canvas Shortcuts',
        description: 'Toggle the canvas shortcut help overlay',
        icon: 'help-circle',
        shortcut: '?',
        group: 'Canvas',
        keywords: ['help', 'shortcuts', 'canvas', 'hotkeys'],
        when: () => isCanvasInteractiveShell,
        execute: () => {
          canvasViewRef.current?.toggleShortcutHelp()
        }
      },
      {
        id: 'open-settings',
        name: 'Open Settings',
        description: 'Open the system settings overlay',
        icon: 'settings',
        execute: handleOpenSettings
      },
      {
        id: 'open-social-import',
        name: 'Import Social Archive',
        description: 'Open the social graph archive importer',
        icon: 'upload',
        group: 'Data',
        keywords: ['social', 'archive', 'instagram', 'grok', 'import'],
        execute: handleOpenSocialImport
      },
      {
        id: 'open-data-workspace',
        name: 'Open Data Workspace',
        description: 'Explore saved views, graph lenses, and imported data counts',
        icon: 'database',
        group: 'Data',
        keywords: ['data', 'workspace', 'social', 'saved views', 'lenses'],
        execute: handleOpenDataWorkspace
      },
      ...(STORIES_ENABLED
        ? [
            {
              id: 'open-stories',
              name: 'Open Stories',
              description: 'Open the dev-only embedded Storybook surface',
              icon: 'layout',
              group: 'Developer',
              execute: handleOpenStories
            } satisfies PaletteCommand
          ]
        : []),
      ...recentDocuments.map((document) => ({
        id: `open-${document.id}`,
        name: document.title,
        description: `Open ${document.type}`,
        icon:
          document.type === 'page'
            ? 'file-text'
            : document.type === 'database'
              ? 'database'
              : 'layout',
        group: 'Recent',
        execute: () => handleOpenDocument(document.id)
      }))
    ],
    [
      canvasViewRef,
      handleCreateCanvasNote,
      handleCreateLinkedDocument,
      handleOpenDocument,
      handleOpenDataWorkspace,
      handleOpenSettings,
      handleOpenSocialImport,
      handleOpenStories,
      canvasCommandState,
      isCanvasInteractiveShell,
      recentDocuments,
      shellKind
    ]
  )
}
