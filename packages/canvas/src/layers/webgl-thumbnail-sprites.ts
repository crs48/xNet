/**
 * WebGL2 thumbnail sprite renderer for Canvas v3.
 */

import type { Rect, ThumbnailSpritePayload } from '@xnetjs/canvas-core'

export type WebGLThumbnailSpriteViewport = {
  x: number
  y: number
  width: number
  height: number
  zoom: number
}

export type ThumbnailSpriteSource = {
  objectId: string
  tileId: string
  bounds: Rect
  pixelSize: {
    width: number
    height: number
  }
  sourceVersion?: string
  thumbnailHash?: string
}

export type ThumbnailAtlasPackingOptions = {
  atlasWidth: number
  atlasHeight: number
  padding: number
  atlasKeyPrefix: string
}

export type PackedThumbnailAtlas = {
  atlasKey: string
  width: number
  height: number
  sprites: readonly ThumbnailSpritePayload[]
  invalidationKeys: Readonly<Record<string, string>>
}

export type ThumbnailAtlasPackingResult = {
  atlases: readonly PackedThumbnailAtlas[]
  unplaced: readonly ThumbnailSpriteSource[]
}

export type ThumbnailSpriteInstance = {
  objectId: string
  tileId: string
  atlasKey: string
  rect: Rect
  uv: Rect
  invalidationKey: string
}

export type ThumbnailAtlasTextureSource = TexImageSource

export type ThumbnailAtlasTextureResolver = (atlasKey: string) => ThumbnailAtlasTextureSource | null

const VERTEX_SHADER = `#version 300 es
  precision highp float;

  in vec2 a_unitVertex;
  in vec4 a_rect;
  in vec4 a_uv;

  uniform vec2 u_resolution;
  uniform vec4 u_viewport;

  out vec2 v_uv;

  void main() {
    vec2 world = a_rect.xy + a_unitVertex * a_rect.zw;
    vec2 screen = (world - u_viewport.xy) * u_viewport.w;
    vec2 clip = vec2(
      (screen.x / u_resolution.x) * 2.0 - 1.0,
      1.0 - (screen.y / u_resolution.y) * 2.0
    );

    gl_Position = vec4(clip, 0.0, 1.0);
    v_uv = a_uv.xy + a_unitVertex * a_uv.zw;
  }
`

const FRAGMENT_SHADER = `#version 300 es
  precision highp float;

  uniform sampler2D u_texture;

  in vec2 v_uv;
  out vec4 outColor;

  void main() {
    outColor = texture(u_texture, v_uv);
  }
`

const DEFAULT_ATLAS_PACKING_OPTIONS: ThumbnailAtlasPackingOptions = {
  atlasWidth: 2048,
  atlasHeight: 2048,
  padding: 2,
  atlasKeyPrefix: 'thumbnail-atlas'
}

export const THUMBNAIL_SPRITE_INSTANCE_FLOATS = 8

function stableNumber(value: number): string {
  return String(Math.round(value * 1000) / 1000)
}

function stableRect(rect: Rect): string {
  return [
    stableNumber(rect.x),
    stableNumber(rect.y),
    stableNumber(rect.width),
    stableNumber(rect.height)
  ].join(',')
}

export function createThumbnailInvalidationKey(source: ThumbnailSpriteSource): string {
  return [
    source.objectId,
    source.sourceVersion ?? 'no-version',
    source.thumbnailHash ?? 'no-thumbnail-hash',
    stableNumber(source.pixelSize.width),
    stableNumber(source.pixelSize.height),
    stableRect(source.bounds)
  ].join(':')
}

function createEmptyAtlas(
  atlasIndex: number,
  options: ThumbnailAtlasPackingOptions
): {
  atlasKey: string
  sprites: ThumbnailSpritePayload[]
  invalidationKeys: Record<string, string>
  cursorX: number
  cursorY: number
  shelfHeight: number
} {
  return {
    atlasKey: `${options.atlasKeyPrefix}-${atlasIndex}`,
    sprites: [],
    invalidationKeys: {},
    cursorX: options.padding,
    cursorY: options.padding,
    shelfHeight: 0
  }
}

function finishAtlas(
  atlas: ReturnType<typeof createEmptyAtlas>,
  options: ThumbnailAtlasPackingOptions
): PackedThumbnailAtlas | null {
  if (atlas.sprites.length === 0) {
    return null
  }

  return {
    atlasKey: atlas.atlasKey,
    width: options.atlasWidth,
    height: options.atlasHeight,
    sprites: atlas.sprites,
    invalidationKeys: atlas.invalidationKeys
  }
}

export function packThumbnailAtlases(
  sources: readonly ThumbnailSpriteSource[],
  options: Partial<ThumbnailAtlasPackingOptions> = {}
): ThumbnailAtlasPackingResult {
  const resolvedOptions = { ...DEFAULT_ATLAS_PACKING_OPTIONS, ...options }
  const atlases: PackedThumbnailAtlas[] = []
  const unplaced: ThumbnailSpriteSource[] = []
  let atlasIndex = 0
  let currentAtlas = createEmptyAtlas(atlasIndex, resolvedOptions)

  sources.forEach((source) => {
    const width = Math.ceil(source.pixelSize.width)
    const height = Math.ceil(source.pixelSize.height)
    const paddedWidth = width + resolvedOptions.padding * 2
    const paddedHeight = height + resolvedOptions.padding * 2

    if (paddedWidth > resolvedOptions.atlasWidth || paddedHeight > resolvedOptions.atlasHeight) {
      unplaced.push(source)
      return
    }

    if (currentAtlas.cursorX + width + resolvedOptions.padding > resolvedOptions.atlasWidth) {
      currentAtlas.cursorX = resolvedOptions.padding
      currentAtlas.cursorY += currentAtlas.shelfHeight + resolvedOptions.padding
      currentAtlas.shelfHeight = 0
    }

    if (currentAtlas.cursorY + height + resolvedOptions.padding > resolvedOptions.atlasHeight) {
      const packed = finishAtlas(currentAtlas, resolvedOptions)
      if (packed) {
        atlases.push(packed)
      }

      atlasIndex += 1
      currentAtlas = createEmptyAtlas(atlasIndex, resolvedOptions)
    }

    currentAtlas.sprites.push({
      objectId: source.objectId,
      tileId: source.tileId,
      bounds: source.bounds,
      atlasKey: currentAtlas.atlasKey,
      uv: {
        x: currentAtlas.cursorX / resolvedOptions.atlasWidth,
        y: currentAtlas.cursorY / resolvedOptions.atlasHeight,
        width: width / resolvedOptions.atlasWidth,
        height: height / resolvedOptions.atlasHeight
      }
    })
    currentAtlas.invalidationKeys[source.objectId] = createThumbnailInvalidationKey(source)
    currentAtlas.cursorX += width + resolvedOptions.padding
    currentAtlas.shelfHeight = Math.max(currentAtlas.shelfHeight, height)
  })

  const packed = finishAtlas(currentAtlas, resolvedOptions)
  if (packed) {
    atlases.push(packed)
  }

  return {
    atlases,
    unplaced
  }
}

export function createThumbnailSpriteInstances(
  sprites: readonly ThumbnailSpritePayload[],
  invalidationKeys: Readonly<Record<string, string>> = {}
): ThumbnailSpriteInstance[] {
  return sprites.map((sprite) => ({
    objectId: sprite.objectId,
    tileId: sprite.tileId,
    atlasKey: sprite.atlasKey,
    rect: sprite.bounds,
    uv: sprite.uv,
    invalidationKey:
      invalidationKeys[sprite.objectId] ??
      [sprite.objectId, sprite.atlasKey, stableRect(sprite.uv), stableRect(sprite.bounds)].join(':')
  }))
}

export function packThumbnailSpriteInstances(
  instances: readonly ThumbnailSpriteInstance[]
): Float32Array {
  const values = new Float32Array(instances.length * THUMBNAIL_SPRITE_INSTANCE_FLOATS)

  instances.forEach((instance, index) => {
    const offset = index * THUMBNAIL_SPRITE_INSTANCE_FLOATS

    values.set(
      [
        instance.rect.x,
        instance.rect.y,
        instance.rect.width,
        instance.rect.height,
        instance.uv.x,
        instance.uv.y,
        instance.uv.width,
        instance.uv.height
      ],
      offset
    )
  })

  return values
}

function groupInstancesByAtlas(
  instances: readonly ThumbnailSpriteInstance[]
): Map<string, ThumbnailSpriteInstance[]> {
  return instances.reduce((groups, instance) => {
    groups.set(instance.atlasKey, [...(groups.get(instance.atlasKey) ?? []), instance])
    return groups
  }, new Map<string, ThumbnailSpriteInstance[]>())
}

export class WebGLThumbnailSpriteRenderer {
  private canvas: HTMLCanvasElement
  private gl: WebGL2RenderingContext
  private program: WebGLProgram
  private unitVertexBuffer: WebGLBuffer
  private instanceBuffer: WebGLBuffer
  private atlasTextures = new Map<string, WebGLTexture>()
  private atlasGroups = new Map<string, ThumbnailSpriteInstance[]>()
  private viewportLocation: WebGLUniformLocation | null
  private resolutionLocation: WebGLUniformLocation | null

  constructor(
    private container: HTMLElement,
    private resolveAtlasTexture: ThumbnailAtlasTextureResolver
  ) {
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
      throw new Error('Failed to create thumbnail sprite shader')
    }

    this.gl.shaderSource(shader, source)
    this.gl.compileShader(shader)

    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      throw new Error(
        `Thumbnail sprite shader failed to compile: ${this.gl.getShaderInfoLog(shader)}`
      )
    }

    return shader
  }

  private createProgram(): WebGLProgram {
    const program = this.gl.createProgram()
    if (!program) {
      throw new Error('Failed to create thumbnail sprite shader program')
    }

    this.gl.attachShader(program, this.compileShader(this.gl.VERTEX_SHADER, VERTEX_SHADER))
    this.gl.attachShader(program, this.compileShader(this.gl.FRAGMENT_SHADER, FRAGMENT_SHADER))
    this.gl.linkProgram(program)

    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      throw new Error(
        `Thumbnail sprite program failed to link: ${this.gl.getProgramInfoLog(program)}`
      )
    }

    return program
  }

  private createUnitVertexBuffer(): WebGLBuffer {
    const buffer = this.gl.createBuffer()
    if (!buffer) {
      throw new Error('Failed to create thumbnail sprite unit vertex buffer')
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
      throw new Error('Failed to create thumbnail sprite instance buffer')
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
    const uvLocation = gl.getAttribLocation(this.program, 'a_uv')
    const stride = THUMBNAIL_SPRITE_INSTANCE_FLOATS * Float32Array.BYTES_PER_ELEMENT

    gl.enableVertexAttribArray(rectLocation)
    gl.vertexAttribPointer(rectLocation, 4, gl.FLOAT, false, stride, 0)
    gl.vertexAttribDivisor(rectLocation, 1)

    gl.enableVertexAttribArray(uvLocation)
    gl.vertexAttribPointer(
      uvLocation,
      4,
      gl.FLOAT,
      false,
      stride,
      4 * Float32Array.BYTES_PER_ELEMENT
    )
    gl.vertexAttribDivisor(uvLocation, 1)
  }

  private createTexture(source: ThumbnailAtlasTextureSource): WebGLTexture {
    const texture = this.gl.createTexture()
    if (!texture) {
      throw new Error('Failed to create thumbnail atlas texture')
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

  private ensureTexture(atlasKey: string): WebGLTexture | null {
    const existing = this.atlasTextures.get(atlasKey)
    if (existing) {
      return existing
    }

    const source = this.resolveAtlasTexture(atlasKey)
    if (!source) {
      return null
    }

    const texture = this.createTexture(source)
    this.atlasTextures.set(atlasKey, texture)
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

  setSprites(
    sprites: readonly ThumbnailSpritePayload[],
    invalidationKeys: Readonly<Record<string, string>> = {}
  ): void {
    this.atlasGroups = groupInstancesByAtlas(
      createThumbnailSpriteInstances(sprites, invalidationKeys)
    )
  }

  render(viewport: WebGLThumbnailSpriteViewport): void {
    this.resize()
    this.gl.useProgram(this.program)
    this.gl.uniform2f(this.resolutionLocation, this.canvas.width, this.canvas.height)
    this.gl.uniform4f(this.viewportLocation, viewport.x, viewport.y, viewport.width, viewport.zoom)

    this.atlasGroups.forEach((instances, atlasKey) => {
      const texture = this.ensureTexture(atlasKey)
      if (!texture) {
        return
      }

      this.gl.activeTexture(this.gl.TEXTURE0)
      this.gl.bindTexture(this.gl.TEXTURE_2D, texture)
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.instanceBuffer)
      this.gl.bufferData(
        this.gl.ARRAY_BUFFER,
        packThumbnailSpriteInstances(instances),
        this.gl.DYNAMIC_DRAW
      )
      this.gl.drawArraysInstanced(this.gl.TRIANGLE_STRIP, 0, 4, instances.length)
    })
  }

  destroy(): void {
    this.atlasTextures.forEach((texture) => this.gl.deleteTexture(texture))
    this.gl.deleteBuffer(this.unitVertexBuffer)
    this.gl.deleteBuffer(this.instanceBuffer)
    this.gl.deleteProgram(this.program)
    this.canvas.remove()
  }
}

export function createWebGLThumbnailSpriteRenderer(
  container: HTMLElement,
  resolveAtlasTexture: ThumbnailAtlasTextureResolver
): WebGLThumbnailSpriteRenderer | null {
  try {
    return new WebGLThumbnailSpriteRenderer(container, resolveAtlasTexture)
  } catch {
    return null
  }
}
