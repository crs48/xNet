import type { LibraryGraph } from '../../../shared/library-graph'
import type { MutableRefObject } from 'react'
import { useEffect, useRef } from 'react'
import { createGraphScene } from './scene'

export type GraphControls = Pick<ReturnType<typeof createGraphScene>, 'fit' | 'focus' | 'zoom'>

export function GraphCanvas({
  graph,
  active,
  paused,
  controller,
  onHover,
  onSelect,
  onProgress,
  onError
}: {
  graph: LibraryGraph
  active: number | null
  paused: boolean
  controller: MutableRefObject<GraphControls | null>
  onHover: (index: number) => void
  onSelect: (index: number) => void
  onProgress: (value: number) => void
  onError: (message: string) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const scene = useRef<ReturnType<typeof createGraphScene> | null>(null)
  const worker = useRef<Worker | null>(null)
  const touched = useRef(false)
  const latest = useRef({ onHover, onSelect, onProgress, onError, paused })
  latest.current = { onHover, onSelect, onProgress, onError, paused }
  useEffect(() => {
    if (!host.current) return
    let layout: Worker | null = null
    touched.current = false
    const visibility = () =>
      layout?.postMessage({ paused: latest.current.paused || document.hidden })
    try {
      scene.current = createGraphScene(host.current, graph, {
        hover: (index) => {
          if (index !== null) latest.current.onHover(index)
        },
        select: (index) => latest.current.onSelect(index),
        failure: (message) => latest.current.onError(message)
      })
      controller.current = {
        fit: () => {
          touched.current = true
          scene.current?.fit()
        },
        focus: (index) => {
          touched.current = true
          scene.current?.focus(index)
        },
        zoom: (factor) => {
          touched.current = true
          scene.current?.zoom(factor)
        }
      }
      layout = new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module' })
      worker.current = layout
      layout.onmessage = ({
        data
      }: MessageEvent<{ positions: Float32Array; progress: number }>) => {
        scene.current?.positions(data.positions)
        latest.current.onProgress(data.progress)
        if (data.progress === 1 && !touched.current) scene.current?.fit()
      }
      layout.onerror = (event) => {
        event.preventDefault()
        latest.current.onError('The background layout failed. Reload the graph to try again.')
        layout?.terminate()
      }
      latest.current.onProgress(0)
      layout.postMessage({ graph, paused: latest.current.paused || document.hidden })
      document.addEventListener('visibilitychange', visibility)
    } catch (error) {
      latest.current.onError(
        `Could not start the 3D view: ${error instanceof Error ? error.message : String(error)}`
      )
    }
    return () => {
      layout?.terminate()
      worker.current = null
      document.removeEventListener('visibilitychange', visibility)
      scene.current?.dispose()
      scene.current = null
      controller.current = null
    }
  }, [graph, controller])
  useEffect(() => {
    scene.current?.active(active)
  }, [active, graph])
  useEffect(() => {
    worker.current?.postMessage({ paused: paused || document.hidden })
  }, [paused])
  return (
    <div
      ref={host}
      className="absolute inset-0"
      onPointerDown={() => {
        touched.current = true
      }}
      onWheel={() => {
        touched.current = true
      }}
    />
  )
}
