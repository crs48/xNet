/**
 * Canvas workspace commands (exploration 0277, E10): every canvas action
 * registered once in the shared command registry, from the shared core.
 * Platform palettes and key handling read the same registry instead of
 * each shell hand-wiring its own imperative calls.
 *
 * Registrations are palette/programmatic only (no key bindings): the
 * canvas engine already owns the on-surface keys (R/F/N/M, Mod+Shift+…)
 * and double-binding them here would double-fire.
 */

import type { UseCanvasViewControllerResult } from './useCanvasViewController.js'
import { CANVAS_PLANNING_TEMPLATE_DEFINITIONS } from '@xnetjs/canvas'
import { getCommandRegistry } from '@xnetjs/plugins'
import { useEffect, useRef } from 'react'

export interface UseCanvasCommandsOptions {
  docId: string
  controller: UseCanvasViewControllerResult
  /** Extra platform commands to register in the same scope (peek/open/split…). */
  extraCommands?: Array<{
    id: string
    title: string
    when?: () => boolean
    run: () => void
  }>
}

export function useCanvasCommands({
  docId,
  controller,
  extraCommands = []
}: UseCanvasCommandsOptions): void {
  const { canvasRef } = controller
  const controllerRef = useRef(controller)
  controllerRef.current = controller
  const extraCommandsRef = useRef(extraCommands)
  extraCommandsRef.current = extraCommands

  useEffect(() => {
    const registry = getCommandRegistry()
    const scope = registry.activateScope('surface:canvas')
    const hasSelection = () => controllerRef.current.selection.nodeIds.length > 0
    const hasMultiSelection = () => controllerRef.current.selection.nodeIds.length > 1
    const hasSourceSelection = () => Boolean(controllerRef.current.selectedObject?.sourceId)
    const hasFrameSelection = () => Boolean(controllerRef.current.selectedFrame)

    const disposables = [
      registry.register({
        id: `canvas.createShape:${docId}`,
        title: 'Canvas: Create shape',
        scope: 'surface:canvas',
        run: () => {
          controllerRef.current.createShape()
        }
      }),
      registry.register({
        id: `canvas.createFrame:${docId}`,
        title: 'Canvas: Create frame',
        scope: 'surface:canvas',
        run: () => {
          controllerRef.current.createFrame()
        }
      }),
      registry.register({
        id: `canvas.createMindMap:${docId}`,
        title: 'Canvas: Create mind map',
        scope: 'surface:canvas',
        run: () => {
          controllerRef.current.createMindMap()
        }
      }),
      registry.register({
        id: `canvas.createReference:${docId}`,
        title: 'Canvas: Add link card',
        scope: 'surface:canvas',
        run: () => {
          controllerRef.current.createExternalReference()
        }
      }),
      registry.register({
        id: `canvas.createMedia:${docId}`,
        title: 'Canvas: Add file card',
        scope: 'surface:canvas',
        run: () => {
          controllerRef.current.createMediaFile()
        }
      }),
      ...CANVAS_PLANNING_TEMPLATE_DEFINITIONS.map((template) =>
        registry.register({
          id: `canvas.template.${template.id}:${docId}`,
          title: `Canvas: Insert ${template.name} template`,
          scope: 'surface:canvas',
          run: () => {
            controllerRef.current.createPlanningTemplate(template.id)
          }
        })
      ),
      registry.register({
        id: `canvas.editAlias:${docId}`,
        title: 'Canvas: Edit selection alias',
        scope: 'surface:canvas',
        when: hasSourceSelection,
        run: () => {
          controllerRef.current.openAliasEditor()
        }
      }),
      registry.register({
        id: `canvas.comment:${docId}`,
        title: 'Canvas: Comment on selection',
        scope: 'surface:canvas',
        when: hasSelection,
        run: () => {
          controllerRef.current.openCommentComposer()
        }
      }),
      registry.register({
        id: `canvas.toggleLock:${docId}`,
        title: 'Canvas: Lock or unlock selection',
        scope: 'surface:canvas',
        when: hasSelection,
        run: () => {
          canvasRef.current?.toggleSelectionLock()
        }
      }),
      registry.register({
        id: `canvas.connect:${docId}`,
        title: 'Canvas: Connect selection',
        scope: 'surface:canvas',
        when: () => controllerRef.current.selection.nodeIds.length === 2,
        run: () => {
          canvasRef.current?.connectSelection()
        }
      }),
      registry.register({
        id: `canvas.tidy:${docId}`,
        title: 'Canvas: Tidy selection',
        scope: 'surface:canvas',
        when: hasMultiSelection,
        run: () => {
          canvasRef.current?.tidySelection()
        }
      }),
      registry.register({
        id: `canvas.cluster:${docId}`,
        title: 'Canvas: Cluster selection',
        scope: 'surface:canvas',
        when: hasMultiSelection,
        run: () => {
          canvasRef.current?.clusterSelection()
        }
      }),
      registry.register({
        id: `canvas.stack:${docId}`,
        title: 'Canvas: Stack selection',
        scope: 'surface:canvas',
        when: hasMultiSelection,
        run: () => {
          canvasRef.current?.stackSelection()
        }
      }),
      registry.register({
        id: `canvas.convertMindMap:${docId}`,
        title: 'Canvas: Convert selection to mind map',
        scope: 'surface:canvas',
        when: hasMultiSelection,
        run: () => {
          canvasRef.current?.convertSelectionToMindMap()
        }
      }),
      registry.register({
        id: `canvas.wrapInFrame:${docId}`,
        title: 'Canvas: Wrap selection in frame',
        scope: 'surface:canvas',
        when: hasSelection,
        run: () => {
          controllerRef.current.wrapSelectionInFrame()
        }
      }),
      registry.register({
        id: `canvas.presentFrame:${docId}`,
        title: 'Canvas: Present selected frame',
        scope: 'surface:canvas',
        when: hasFrameSelection,
        run: () => {
          controllerRef.current.presentSelectedFrame()
        }
      }),
      registry.register({
        id: `canvas.exportFrame:${docId}`,
        title: 'Canvas: Export selected frame',
        scope: 'surface:canvas',
        when: hasFrameSelection,
        run: () => {
          controllerRef.current.exportSelectedFrame()
        }
      }),
      ...extraCommandsRef.current.map((command) =>
        registry.register({
          id: `${command.id}:${docId}`,
          title: command.title,
          scope: 'surface:canvas',
          when: command.when,
          run: command.run
        })
      )
    ]

    return () => {
      for (const disposable of disposables) disposable.dispose()
      scope.dispose()
    }
    // Registrations delegate through refs; only identity-level inputs re-register.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId])
}
