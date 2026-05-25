/**
 * WebGL2 raster tile quad renderer for Canvas v3.
 */

import type { RasterTileRef, Rect } from '@xnetjs/canvas-core'
import { DEFAULT_CANVAS_TILE_SIZE, getTileBounds, parseTileId } from '@xnetjs/canvas-core'

export type WebGLRasterTileViewport = {
  x: number
  y: number
  width: number
  height: number
  zoom: number
}

export type WebGLRasterTileConfig = {
  crossfadeMs: number
  maxTextureBytes: number
  staleOpacity: number
  tileSize: number
}

export type RasterTileTextureSource = TexImageSource

export type RasterTileTextureResolver = (tile: RasterTileRef) => RasterTileTextureSource | null

export type RasterTileDrawItem = {
  tileId: string
  textureKey: string
  sourceEpoch: string
  rect: Rect
  opacity: number
  stale: boolean
  retiring: boolean
}

export type RasterTileTransitionEntry = {
  tileId: string
  textureKey: string
  sourceEpoch: string
  stale: boolean
  enteredAtMs: number
}

export type RetiringRasterTileTransitionEntry = RasterTileTransitionEntry & {
  retiredAtMs: number
  expiresAtMs: number
}

export type RasterTileTransitionState = {
  active: Readonly<Record<string, RasterTileTransitionEntry>>
  retiring: readonly RetiringRasterTileTransitionEntry[]
}

export type RasterTileDrawPlanInput = {
  tiles: readonly RasterTileRef[]
  previous?: RasterTileTransitionState
  nowMs: number
  crossfadeMs?: number
  staleOpacity?: number
  tileSize?: number
}

export type RasterTileDrawPlan = {
  drawItems: readonly RasterTileDrawItem[]
  state: RasterTileTransitionState
}

type RasterTileTextureRecord<T> = {
  key: string
  value: T
  bytes: number
  lastUsedAtMs: number
}

const VERTEX_SHADER = `#version 300 es
  precision highp float;

  in vec2 a_unitVertex;

  uniform vec2 u_resolution;
  uniform vec4 u_viewport;
  uniform vec4 u_rect;

  out vec2 v_uv;

  void main() {
    vec2 world = u_rect.xy + a_unitVertex * u_rect.zw;
    vec2 screen = (world - u_viewport.xy) * u_viewport.w;
    vec2 clip = vec2(
      (screen.x / u_resolution.x) * 2.0 - 1.0,
      1.0 - (screen.y / u_resolution.y) * 2.0
    );

    gl_Position = vec4(clip, 0.0, 1.0);
    v_uv = a_unitVertex;
  }
`

const FRAGMENT_SHADER = `#version 300 es
  precision highp float;

  uniform sampler2D u_texture;
  uniform float u_opacity;

  in vec2 v_uv;
  out vec4 outColor;

  void main() {
    vec4 color = texture(u_texture, v_uv);
    outColor = vec4(color.rgb, color.a * u_opacity);
  }
`

const DEFAULT_RASTER_TILE_CONFIG: WebGLRasterTileConfig = {
  crossfadeMs: 180,
  maxTextureBytes: 64 * 1024 * 1024,
  staleOpacity: 0.58,
  tileSize: DEFAULT_CANVAS_TILE_SIZE
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function getCrossfadeProgress(nowMs: number, startedAtMs: number, crossfadeMs: number): number {
  if (crossfadeMs <= 0) {
    return 1
  }

  return clamp((nowMs - startedAtMs) / crossfadeMs, 0, 1)
}

function createRasterTileTransitionEntry(
  tile: RasterTileRef,
  nowMs: number
): RasterTileTransitionEntry {
  return {
    tileId: tile.tileId,
    textureKey: tile.textureKey,
    sourceEpoch: tile.sourceEpoch,
    stale: tile.stale,
    enteredAtMs: nowMs
  }
}

function hasTileTextureChanged(
  tile: RasterTileRef,
  entry: RasterTileTransitionEntry | undefined
): boolean {
  return Boolean(
    entry && (entry.textureKey !== tile.textureKey || entry.sourceEpoch !== tile.sourceEpoch)
  )
}

function resolveRasterTileBounds(tile: RasterTileRef, tileSize: number): Rect | null {
  const address = parseTileId(tile.tileId)
  return address ? getTileBounds(address, tileSize) : null
}

export function createRasterTileDrawPlan(input: RasterTileDrawPlanInput): RasterTileDrawPlan {
  const crossfadeMs = input.crossfadeMs ?? DEFAULT_RASTER_TILE_CONFIG.crossfadeMs
  const staleOpacity = input.staleOpacity ?? DEFAULT_RASTER_TILE_CONFIG.staleOpacity
  const tileSize = input.tileSize ?? DEFAULT_RASTER_TILE_CONFIG.tileSize
  const nextActive: Record<string, RasterTileTransitionEntry> = {}
  const nextRetiring: RetiringRasterTileTransitionEntry[] = []

  input.previous?.retiring
    .filter((entry) => entry.expiresAtMs > input.nowMs)
    .forEach((entry) => nextRetiring.push(entry))

  input.tiles.forEach((tile) => {
    const previousEntry = input.previous?.active[tile.tileId]
    const changed = hasTileTextureChanged(tile, previousEntry)

    if (changed && previousEntry) {
      nextRetiring.push({
        ...previousEntry,
        retiredAtMs: input.nowMs,
        expiresAtMs: input.nowMs + crossfadeMs
      })
    }

    nextActive[tile.tileId] = changed
      ? createRasterTileTransitionEntry(tile, input.nowMs)
      : !previousEntry
        ? createRasterTileTransitionEntry(tile, input.nowMs - crossfadeMs)
        : {
            ...previousEntry,
            sourceEpoch: tile.sourceEpoch,
            stale: tile.stale
          }
  })

  const retiringDrawItems = nextRetiring
    .map((entry): RasterTileDrawItem | null => {
      const bounds = resolveRasterTileBounds(entry, tileSize)
      if (!bounds) {
        return null
      }

      return {
        tileId: entry.tileId,
        textureKey: entry.textureKey,
        sourceEpoch: entry.sourceEpoch,
        rect: bounds,
        opacity: 1 - getCrossfadeProgress(input.nowMs, entry.retiredAtMs, crossfadeMs),
        stale: entry.stale,
        retiring: true
      }
    })
    .filter((item): item is RasterTileDrawItem => item !== null && item.opacity > 0)

  const activeDrawItems = input.tiles
    .map((tile): RasterTileDrawItem | null => {
      const entry = nextActive[tile.tileId]
      const bounds = resolveRasterTileBounds(tile, tileSize)
      if (!entry || !bounds) {
        return null
      }

      const fadeOpacity = getCrossfadeProgress(input.nowMs, entry.enteredAtMs, crossfadeMs)

      return {
        tileId: tile.tileId,
        textureKey: tile.textureKey,
        sourceEpoch: tile.sourceEpoch,
        rect: bounds,
        opacity: fadeOpacity * (tile.stale ? staleOpacity : 1),
        stale: tile.stale,
        retiring: false
      }
    })
    .filter((item): item is RasterTileDrawItem => item !== null && item.opacity > 0)

  return {
    drawItems: [...retiringDrawItems, ...activeDrawItems],
    state: {
      active: nextActive,
      retiring: nextRetiring
    }
  }
}

export class RasterTileTextureLru<T> {
  private records = new Map<string, RasterTileTextureRecord<T>>()
  private totalBytes = 0

  constructor(private readonly maxBytes: number) {}

  get sizeBytes(): number {
    return this.totalBytes
  }

  get size(): number {
    return this.records.size
  }

  get(key: string, nowMs: number): T | null {
    const record = this.records.get(key)
    if (!record) {
      return null
    }

    record.lastUsedAtMs = nowMs
    return record.value
  }

  upsert(key: string, value: T, bytes: number, nowMs: number): T[] {
    const existing = this.records.get(key)
    if (existing) {
      this.totalBytes -= existing.bytes
    }

    this.records.set(key, { key, value, bytes, lastUsedAtMs: nowMs })
    this.totalBytes += bytes

    return this.evictUntilWithinBudget(key)
  }

  delete(key: string): T | null {
    const record = this.records.get(key)
    if (!record) {
      return null
    }

    this.records.delete(key)
    this.totalBytes -= record.bytes
    return record.value
  }

  clear(): T[] {
    const values = Array.from(this.records.values(), (record) => record.value)
    this.records.clear()
    this.totalBytes = 0
    return values
  }

  private evictUntilWithinBudget(protectedKey: string): T[] {
    const evicted: T[] = []

    while (this.totalBytes > this.maxBytes && this.records.size > 1) {
      const oldest = Array.from(this.records.values())
        .filter((record) => record.key !== protectedKey)
        .sort((left, right) => left.lastUsedAtMs - right.lastUsedAtMs)[0]

      if (!oldest) {
        break
      }

      this.records.delete(oldest.key)
      this.totalBytes -= oldest.bytes
      evicted.push(oldest.value)
    }

    return evicted
  }
}

function estimateTextureBytes(source: RasterTileTextureSource): number {
  const size = source as {
    width?: number
    height?: number
    videoWidth?: number
    videoHeight?: number
  }
  const width = size.width ?? size.videoWidth ?? DEFAULT_RASTER_TILE_CONFIG.tileSize
  const height = size.height ?? size.videoHeight ?? DEFAULT_RASTER_TILE_CONFIG.tileSize

  return Math.max(1, width * height * 4)
}

export class WebGLRasterTileRenderer {
  private canvas: HTMLCanvasElement
  private gl: WebGL2RenderingContext
  private program: WebGLProgram
  private unitVertexBuffer: WebGLBuffer
  private textureLru: RasterTileTextureLru<WebGLTexture>
  private tiles: readonly RasterTileRef[] = []
  private drawItems: readonly RasterTileDrawItem[] = []
  private transitionState: RasterTileTransitionState = {
    active: {},
    retiring: []
  }
  private rectLocation: WebGLUniformLocation | null
  private resolutionLocation: WebGLUniformLocation | null
  private viewportLocation: WebGLUniformLocation | null
  private opacityLocation: WebGLUniformLocation | null

  constructor(
    private container: HTMLElement,
    private resolveTextureSource: RasterTileTextureResolver,
    config: Partial<WebGLRasterTileConfig> = {}
  ) {
    this.config = { ...DEFAULT_RASTER_TILE_CONFIG, ...config }
    this.textureLru = new RasterTileTextureLru<WebGLTexture>(this.config.maxTextureBytes)
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
      antialias: false,
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
    this.rectLocation = gl.getUniformLocation(this.program, 'u_rect')
    this.resolutionLocation = gl.getUniformLocation(this.program, 'u_resolution')
    this.viewportLocation = gl.getUniformLocation(this.program, 'u_viewport')
    this.opacityLocation = gl.getUniformLocation(this.program, 'u_opacity')

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    this.bindAttributes()
  }

  private config: WebGLRasterTileConfig

  private compileShader(type: number, source: string): WebGLShader {
    const shader = this.gl.createShader(type)
    if (!shader) {
      throw new Error('Failed to create raster tile shader')
    }

    this.gl.shaderSource(shader, source)
    this.gl.compileShader(shader)

    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      throw new Error(`Raster tile shader failed to compile: ${this.gl.getShaderInfoLog(shader)}`)
    }

    return shader
  }

  private createProgram(): WebGLProgram {
    const program = this.gl.createProgram()
    if (!program) {
      throw new Error('Failed to create raster tile shader program')
    }

    this.gl.attachShader(program, this.compileShader(this.gl.VERTEX_SHADER, VERTEX_SHADER))
    this.gl.attachShader(program, this.compileShader(this.gl.FRAGMENT_SHADER, FRAGMENT_SHADER))
    this.gl.linkProgram(program)

    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      throw new Error(`Raster tile program failed to link: ${this.gl.getProgramInfoLog(program)}`)
    }

    return program
  }

  private createUnitVertexBuffer(): WebGLBuffer {
    const buffer = this.gl.createBuffer()
    if (!buffer) {
      throw new Error('Failed to create raster tile unit vertex buffer')
    }

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer)
    this.gl.bufferData(
      this.gl.ARRAY_BUFFER,
      new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
      this.gl.STATIC_DRAW
    )
    return buffer
  }

  private bindAttributes(): void {
    this.gl.useProgram(this.program)
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.unitVertexBuffer)

    const unitVertexLocation = this.gl.getAttribLocation(this.program, 'a_unitVertex')
    this.gl.enableVertexAttribArray(unitVertexLocation)
    this.gl.vertexAttribPointer(unitVertexLocation, 2, this.gl.FLOAT, false, 0, 0)
  }

  private createTexture(source: RasterTileTextureSource): WebGLTexture {
    const texture = this.gl.createTexture()
    if (!texture) {
      throw new Error('Failed to create raster tile texture')
    }

    this.gl.bindTexture(this.gl.TEXTURE_2D, texture)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE)
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      source
    )

    return texture
  }

  private ensureTexture(tile: RasterTileRef, nowMs: number): WebGLTexture | null {
    const existing = this.textureLru.get(tile.textureKey, nowMs)
    if (existing) {
      return existing
    }

    const source = this.resolveTextureSource(tile)
    if (!source) {
      return null
    }

    const texture = this.createTexture(source)
    const evicted = this.textureLru.upsert(
      tile.textureKey,
      texture,
      estimateTextureBytes(source),
      nowMs
    )
    evicted.forEach((evictedTexture) => this.gl.deleteTexture(evictedTexture))

    return texture
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

  setTiles(tiles: readonly RasterTileRef[], nowMs = performance.now()): void {
    this.tiles = tiles
    const plan = createRasterTileDrawPlan({
      tiles,
      previous: this.transitionState,
      nowMs,
      crossfadeMs: this.config.crossfadeMs,
      staleOpacity: this.config.staleOpacity,
      tileSize: this.config.tileSize
    })

    this.transitionState = plan.state
    this.drawItems = plan.drawItems
    tiles.forEach((tile) => this.ensureTexture(tile, nowMs))
  }

  render(viewport: WebGLRasterTileViewport, nowMs = performance.now()): void {
    this.setTiles(this.tiles, nowMs)
    this.resize()
    this.gl.useProgram(this.program)
    this.gl.uniform2f(this.resolutionLocation, this.canvas.width, this.canvas.height)
    this.gl.uniform4f(this.viewportLocation, viewport.x, viewport.y, viewport.width, viewport.zoom)

    this.drawItems.forEach((item) => {
      const texture = this.textureLru.get(item.textureKey, nowMs)
      if (!texture) {
        return
      }

      this.gl.activeTexture(this.gl.TEXTURE0)
      this.gl.bindTexture(this.gl.TEXTURE_2D, texture)
      this.gl.uniform4f(
        this.rectLocation,
        item.rect.x,
        item.rect.y,
        item.rect.width,
        item.rect.height
      )
      this.gl.uniform1f(this.opacityLocation, item.opacity)
      this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4)
    })
  }

  destroy(): void {
    this.textureLru.clear().forEach((texture) => this.gl.deleteTexture(texture))
    this.gl.deleteBuffer(this.unitVertexBuffer)
    this.gl.deleteProgram(this.program)
    this.canvas.remove()
  }
}

export function createWebGLRasterTileRenderer(
  container: HTMLElement,
  resolveTextureSource: RasterTileTextureResolver,
  config: Partial<WebGLRasterTileConfig> = {}
): WebGLRasterTileRenderer | null {
  try {
    return new WebGLRasterTileRenderer(container, resolveTextureSource, config)
  } catch {
    return null
  }
}
