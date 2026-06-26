/**
 * WebGL2 renderer for Canvas v3 vector aggregate tiles.
 */

import type { CanvasObjectKind, CanvasTileSummary, VectorTilePayload } from '@xnetjs/canvas-core'
import { clamp } from '@xnetjs/core'

export type WebGLVectorTileViewport = {
  x: number
  y: number
  width: number
  height: number
  zoom: number
}

export type WebGLVectorTileConfig = {
  maxAlpha: number
  minAlpha: number
}

export type VectorTileInstance = {
  tileId: string
  rect: {
    x: number
    y: number
    width: number
    height: number
  }
  color: readonly [number, number, number, number]
}

const VERTEX_SHADER = `#version 300 es
  precision highp float;

  in vec2 a_unitVertex;
  in vec4 a_rect;
  in vec4 a_color;

  uniform vec2 u_resolution;
  uniform vec4 u_viewport;

  out vec4 v_color;

  void main() {
    vec2 world = a_rect.xy + a_unitVertex * a_rect.zw;
    vec2 screen = (world - u_viewport.xy) * u_viewport.w;
    vec2 clip = vec2(
      (screen.x / u_resolution.x) * 2.0 - 1.0,
      1.0 - (screen.y / u_resolution.y) * 2.0
    );

    gl_Position = vec4(clip, 0.0, 1.0);
    v_color = a_color;
  }
`

const FRAGMENT_SHADER = `#version 300 es
  precision highp float;

  in vec4 v_color;
  out vec4 outColor;

  void main() {
    outColor = v_color;
  }
`

const DEFAULT_VECTOR_TILE_CONFIG: WebGLVectorTileConfig = {
  maxAlpha: 0.72,
  minAlpha: 0.16
}

const KIND_COLORS: Record<CanvasObjectKind, readonly [number, number, number]> = {
  page: [0.231, 0.51, 0.965],
  database: [0.047, 0.627, 0.463],
  'external-reference': [0.702, 0.392, 0.922],
  media: [0.941, 0.447, 0.196],
  shape: [0.376, 0.443, 0.557],
  note: [0.902, 0.624, 0.125],
  task: [0.388, 0.4, 0.945],
  group: [0.239, 0.239, 0.266],
  widget: [0.31, 0.275, 0.898]
}

export const VECTOR_TILE_INSTANCE_FLOATS = 8

function getTileDominantKind(summary: CanvasTileSummary): CanvasObjectKind {
  return (
    summary.clusters[0]?.dominantKind ??
    (Object.entries(summary.typeCounts).sort((left, right) => right[1] - left[1])[0]?.[0] as
      | CanvasObjectKind
      | undefined) ??
    'shape'
  )
}

function getAlpha(objectCount: number, config: WebGLVectorTileConfig): number {
  return clamp(
    config.minAlpha + Math.log10(Math.max(objectCount, 1)) / 8,
    config.minAlpha,
    config.maxAlpha
  )
}

function createInstance(input: {
  tileId: string
  rect: VectorTileInstance['rect']
  kind: CanvasObjectKind
  objectCount: number
  config: WebGLVectorTileConfig
}): VectorTileInstance {
  const [red, green, blue] = KIND_COLORS[input.kind]

  return {
    tileId: input.tileId,
    rect: input.rect,
    color: [red, green, blue, getAlpha(input.objectCount, input.config)]
  }
}

export function createVectorTileInstances(
  tiles: readonly VectorTilePayload[],
  config: Partial<WebGLVectorTileConfig> = {}
): VectorTileInstance[] {
  const resolvedConfig = { ...DEFAULT_VECTOR_TILE_CONFIG, ...config }

  return tiles.flatMap((tile) => {
    if (tile.summary.clusters.length > 0) {
      return tile.summary.clusters.map((cluster) =>
        createInstance({
          tileId: tile.tileId,
          rect: cluster.bounds,
          kind: cluster.dominantKind,
          objectCount: cluster.objectCount,
          config: resolvedConfig
        })
      )
    }

    return [
      createInstance({
        tileId: tile.tileId,
        rect: tile.summary.bounds,
        kind: getTileDominantKind(tile.summary),
        objectCount: tile.summary.objectCount,
        config: resolvedConfig
      })
    ]
  })
}

export function packVectorTileInstances(instances: readonly VectorTileInstance[]): Float32Array {
  const values = new Float32Array(instances.length * VECTOR_TILE_INSTANCE_FLOATS)

  instances.forEach((instance, index) => {
    const offset = index * VECTOR_TILE_INSTANCE_FLOATS

    values.set(
      [
        instance.rect.x,
        instance.rect.y,
        instance.rect.width,
        instance.rect.height,
        instance.color[0],
        instance.color[1],
        instance.color[2],
        instance.color[3]
      ],
      offset
    )
  })

  return values
}

export class WebGLVectorTileRenderer {
  private canvas: HTMLCanvasElement
  private gl: WebGL2RenderingContext
  private program: WebGLProgram
  private unitVertexBuffer: WebGLBuffer
  private instanceBuffer: WebGLBuffer
  private instanceCount = 0
  private viewportLocation: WebGLUniformLocation | null
  private resolutionLocation: WebGLUniformLocation | null

  constructor(private container: HTMLElement) {
    this.canvas = document.createElement('canvas')
    this.canvas.style.cssText = `
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    `
    this.container.appendChild(this.canvas)

    const gl = this.canvas.getContext('webgl2', {
      alpha: true,
      antialias: true,
      depth: false,
      stencil: false,
      premultipliedAlpha: true
    })

    if (!gl) {
      this.canvas.remove()
      throw new Error('WebGL2 not supported')
    }

    this.gl = gl
    this.program = this.createProgram()
    this.unitVertexBuffer = this.createUnitVertexBuffer()
    this.instanceBuffer = this.createInstanceBuffer()
    this.viewportLocation = gl.getUniformLocation(this.program, 'u_viewport')
    this.resolutionLocation = gl.getUniformLocation(this.program, 'u_resolution')

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    this.bindAttributes()
  }

  private compileShader(type: number, source: string): WebGLShader {
    const shader = this.gl.createShader(type)
    if (!shader) {
      throw new Error('Failed to create vector tile shader')
    }

    this.gl.shaderSource(shader, source)
    this.gl.compileShader(shader)

    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      throw new Error(`Vector tile shader failed to compile: ${this.gl.getShaderInfoLog(shader)}`)
    }

    return shader
  }

  private createProgram(): WebGLProgram {
    const program = this.gl.createProgram()
    if (!program) {
      throw new Error('Failed to create vector tile shader program')
    }

    this.gl.attachShader(program, this.compileShader(this.gl.VERTEX_SHADER, VERTEX_SHADER))
    this.gl.attachShader(program, this.compileShader(this.gl.FRAGMENT_SHADER, FRAGMENT_SHADER))
    this.gl.linkProgram(program)

    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      throw new Error(`Vector tile program failed to link: ${this.gl.getProgramInfoLog(program)}`)
    }

    return program
  }

  private createUnitVertexBuffer(): WebGLBuffer {
    const buffer = this.gl.createBuffer()
    if (!buffer) {
      throw new Error('Failed to create vector tile unit vertex buffer')
    }

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer)
    this.gl.bufferData(
      this.gl.ARRAY_BUFFER,
      new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
      this.gl.STATIC_DRAW
    )
    return buffer
  }

  private createInstanceBuffer(): WebGLBuffer {
    const buffer = this.gl.createBuffer()
    if (!buffer) {
      throw new Error('Failed to create vector tile instance buffer')
    }

    return buffer
  }

  private bindAttributes(): void {
    const gl = this.gl

    gl.useProgram(this.program)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.unitVertexBuffer)

    const unitVertexLocation = gl.getAttribLocation(this.program, 'a_unitVertex')
    gl.enableVertexAttribArray(unitVertexLocation)
    gl.vertexAttribPointer(unitVertexLocation, 2, gl.FLOAT, false, 0, 0)

    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer)
    const rectLocation = gl.getAttribLocation(this.program, 'a_rect')
    const colorLocation = gl.getAttribLocation(this.program, 'a_color')
    const stride = VECTOR_TILE_INSTANCE_FLOATS * Float32Array.BYTES_PER_ELEMENT

    gl.enableVertexAttribArray(rectLocation)
    gl.vertexAttribPointer(rectLocation, 4, gl.FLOAT, false, stride, 0)
    gl.vertexAttribDivisor(rectLocation, 1)

    gl.enableVertexAttribArray(colorLocation)
    gl.vertexAttribPointer(
      colorLocation,
      4,
      gl.FLOAT,
      false,
      stride,
      4 * Float32Array.BYTES_PER_ELEMENT
    )
    gl.vertexAttribDivisor(colorLocation, 1)
  }

  resize(): void {
    const bounds = this.container.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const width = Math.max(1, Math.floor(bounds.width * dpr))
    const height = Math.max(1, Math.floor(bounds.height * dpr))

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width
      this.canvas.height = height
      this.gl.viewport(0, 0, width, height)
    }
  }

  setTiles(tiles: readonly VectorTilePayload[], config: Partial<WebGLVectorTileConfig> = {}): void {
    const instances = createVectorTileInstances(tiles, config)
    const packed = packVectorTileInstances(instances)

    this.instanceCount = instances.length
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.instanceBuffer)
    this.gl.bufferData(this.gl.ARRAY_BUFFER, packed, this.gl.DYNAMIC_DRAW)
  }

  render(viewport: WebGLVectorTileViewport): void {
    this.resize()
    this.gl.useProgram(this.program)
    this.gl.uniform2f(this.resolutionLocation, this.canvas.width, this.canvas.height)
    this.gl.uniform4f(this.viewportLocation, viewport.x, viewport.y, viewport.width, viewport.zoom)
    this.gl.drawArraysInstanced(this.gl.TRIANGLE_STRIP, 0, 4, this.instanceCount)
  }

  destroy(): void {
    this.gl.deleteBuffer(this.unitVertexBuffer)
    this.gl.deleteBuffer(this.instanceBuffer)
    this.gl.deleteProgram(this.program)
    this.canvas.remove()
  }
}

export function isWebGL2Available(): boolean {
  if (typeof document === 'undefined') {
    return false
  }

  try {
    const canvas = document.createElement('canvas')
    return canvas.getContext('webgl2') !== null
  } catch {
    return false
  }
}

export function createWebGLVectorTileRenderer(
  container: HTMLElement
): WebGLVectorTileRenderer | null {
  try {
    return new WebGLVectorTileRenderer(container)
  } catch {
    return null
  }
}
