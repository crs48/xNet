import type { LibraryGraph } from '../../../shared/library-graph'
import { forceSimulation, forceManyBody, forceLink, forceX, forceY, forceZ } from 'd3-force-3d'
import { initialPositions } from './model'

type LayoutRequest = { graph: LibraryGraph; paused: boolean } | { paused: boolean }
let paused = false
let step: (() => void) | null = null
let timer: ReturnType<typeof setTimeout> | undefined

self.onmessage = ({ data }: MessageEvent<LayoutRequest>) => {
  paused = data.paused
  clearTimeout(timer)
  if ('graph' in data) {
    const initial = initialPositions(data.graph)
    const nodes = data.graph.nodes.map((_node, i) => ({
      x: initial[i * 3],
      y: initial[i * 3 + 1],
      z: initial[i * 3 + 2]
    }))
    const simulation = forceSimulation(nodes, 3)
      .stop()
      .alphaDecay(0.035)
      .velocityDecay(0.45)
      .force('charge', forceManyBody().strength(-18).theta(1.2).distanceMax(400))
      .force(
        'links',
        forceLink(data.graph.edges.map(({ source, target }) => ({ source, target })))
          .distance(65)
          .strength(0.18)
      )
      .force('x', forceX(0).strength(0.006))
      .force('y', forceY(0).strength(0.006))
      .force('z', forceZ(0).strength(0.006))
    let ticks = 0
    const publish = () => {
      const positions = new Float32Array(nodes.length * 3)
      nodes.forEach((node, i) => positions.set([node.x, node.y, node.z], i * 3))
      self.postMessage({ positions, progress: ticks / 160 }, { transfer: [positions.buffer] })
    }
    publish()
    step = () => {
      if (paused || ticks >= 160) return
      const start = performance.now()
      do {
        simulation.tick()
        ticks++
      } while (ticks < 160 && performance.now() - start < 50)
      publish()
      if (ticks < 160) timer = setTimeout(step!, 40)
    }
  }
  if (!paused) step?.()
}
