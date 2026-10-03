/** The upstream package has no declarations. This is the small API used by the worker. */
declare module 'd3-force-3d' {
  export interface SimulationNode {
    x: number
    y: number
    z: number
  }
  export interface Force {
    (alpha: number): void
  }
  export interface Simulation {
    stop(): this
    tick(iterations?: number): this
    alphaDecay(value: number): this
    velocityDecay(value: number): this
    force(name: string, force: Force): this
  }
  export function forceSimulation(nodes: SimulationNode[], dimensions: number): Simulation
  export function forceManyBody(): Force & {
    strength(value: number): ReturnType<typeof forceManyBody>
    theta(value: number): ReturnType<typeof forceManyBody>
    distanceMax(value: number): ReturnType<typeof forceManyBody>
  }
  export function forceLink(links: { source: number; target: number }[]): Force & {
    distance(value: number): ReturnType<typeof forceLink>
    strength(value: number): ReturnType<typeof forceLink>
  }
  export function forceX(value: number): Force & { strength(value: number): Force }
  export function forceY(value: number): Force & { strength(value: number): Force }
  export function forceZ(value: number): Force & { strength(value: number): Force }
}
