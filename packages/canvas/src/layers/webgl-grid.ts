/**
 * @xnetjs/canvas - WebGL Grid Layer
 *
 * Procedural infinite grid via WebGL fragment shader - zero allocations at any scale.
 * The grid adapts to zoom level: at high zoom you see fine grid lines,
 * at low zoom only major grid lines are visible.
 */

// ─── Shader Sources ─────────────────────────────────────────────────────────

const VERTEX_SHADER = `
  attribute vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`

const LINES_FRAGMENT_SHADER = `
  precision highp float;

  uniform vec2 u_resolution;
  uniform vec2 u_pan;
  uniform float u_zoom;
  uniform vec4 u_gridColor;
  uniform vec4 u_majorGridColor;
  uniform vec4 u_axisColor;
  uniform float u_gridSpacing;
  uniform float u_majorEvery;

  void main() {
    // Transform screen coordinates to canvas coordinates
    vec2 screenPos = gl_FragCoord.xy;
    vec2 canvasPos = (screenPos - u_resolution * 0.5) / u_zoom + u_pan;

    // Calculate grid lines with adaptive spacing
    float effectiveSpacing = u_gridSpacing;

    // At very low zoom, increase spacing to avoid visual noise
    if (u_zoom < 0.5) {
      effectiveSpacing = u_gridSpacing * u_majorEvery;
    }

    // Grid line calculation
    vec2 grid = abs(fract(canvasPos / effectiveSpacing - 0.5) - 0.5);
    vec2 majorGrid = abs(fract(canvasPos / (effectiveSpacing * u_majorEvery) - 0.5) - 0.5);

    // Anti-aliased lines (consistent 1px width regardless of zoom)
    float lineWidth = 1.0 / u_zoom;
    float minorLine = min(
      smoothstep(lineWidth, 0.0, grid.x * effectiveSpacing),
      smoothstep(lineWidth, 0.0, grid.y * effectiveSpacing)
    );
    float majorLine = min(
      smoothstep(lineWidth * 1.5, 0.0, majorGrid.x * effectiveSpacing * u_majorEvery),
      smoothstep(lineWidth * 1.5, 0.0, majorGrid.y * effectiveSpacing * u_majorEvery)
    );

    // Fade out minor grid at low zoom
    float minorAlpha = smoothstep(0.3, 0.6, u_zoom);

    // Composite colors
    vec4 color = vec4(0.0);
    color = mix(color, u_gridColor * vec4(1.0, 1.0, 1.0, minorAlpha), minorLine);
    color = mix(color, u_majorGridColor, majorLine);

    // Origin axes (thicker, distinct color)
    float axisWidth = 2.0 / u_zoom;
    float xAxis = smoothstep(axisWidth, 0.0, abs(canvasPos.y));
    float yAxis = smoothstep(axisWidth, 0.0, abs(canvasPos.x));
    color = mix(color, u_axisColor, max(xAxis, yAxis));

    gl_FragColor = color;
  }
`

const DOTS_FRAGMENT_SHADER = `
  precision highp float;

  uniform vec2 u_resolution;
  uniform vec2 u_pan;
  uniform float u_zoom;
  uniform vec4 u_gridColor;
  uniform vec4 u_majorGridColor;
  uniform float u_gridSpacing;
  uniform float u_majorEvery;

  void main() {
    vec2 screenPos = gl_FragCoord.xy;
    vec2 canvasPos = (screenPos - u_resolution * 0.5) / u_zoom + u_pan;

    // Adaptive spacing at low zoom
    float effectiveSpacing = u_gridSpacing;
    bool showMinor = u_zoom >= 0.5;
    if (!showMinor) {
      effectiveSpacing = u_gridSpacing * u_majorEvery;
    }

    // Snap to nearest grid intersection
    vec2 gridPos = floor(canvasPos / effectiveSpacing + 0.5) * effectiveSpacing;
    float dist = distance(canvasPos, gridPos);

    // Check if this is a major grid point
    vec2 majorGridPos = floor(canvasPos / (u_gridSpacing * u_majorEvery) + 0.5) * (u_gridSpacing * u_majorEvery);
    float majorDist = distance(canvasPos, majorGridPos);

    // Dot radius (consistent screen size)
    float radius = 1.5 / u_zoom;
    float majorRadius = 2.5 / u_zoom;

    float dot = 1.0 - smoothstep(radius - 0.5 / u_zoom, radius, dist);
    float majorDot = 1.0 - smoothstep(majorRadius - 0.5 / u_zoom, majorRadius, majorDist);

    // Fade at low zoom
    float alpha = smoothstep(0.2, 0.5, u_zoom);

    // Composite: major dots on top
    vec4 color = u_gridColor * vec4(1.0, 1.0, 1.0, dot * alpha);
    color = mix(color, u_majorGridColor, majorDot);

    gl_FragColor = color;
  }
`

// ─── Types ──────────────────────────────────────────────────────────────────

export type GridType = 'lines' | 'dots'

export interface WebGLGridConfig {
  /** Grid line/dot color as RGBA 0-1 */
  gridColor: [number, number, number, number]
  /** Major grid line/dot color as RGBA 0-1 */
  majorGridColor: [number, number, number, number]
  /** Axis line color as RGBA 0-1 */
  axisColor: [number, number, number, number]
  /** Grid spacing in canvas units */
  gridSpacing: number
  /** Major line every N minor lines */
  majorEvery: number
  /** Grid type: 'lines' or 'dots' */
  type: GridType
}

export interface ViewportState {
  x: number
  y: number
  zoom: number
}

export interface GridLayer {
  resize(): void
  render(viewport: ViewportState): void
  setConfig(config: Partial<WebGLGridConfig>): void
  destroy(): void
}

// ─── Constants ──────────────────────────────────────────────────────────────

export const DEFAULT_GRID_CONFIG: WebGLGridConfig = {
  gridColor: [0.5, 0.5, 0.5, 0.15],
  majorGridColor: [0.5, 0.5, 0.5, 0.3],
  axisColor: [0.231, 0.51, 0.965, 0.28],
  gridSpacing: 20,
  majorEvery: 5,
  type: 'lines'
}

// ─── WebGL Grid Layer ───────────────────────────────────────────────────────

export class WebGLGridLayer implements GridLayer {
  private canvas: HTMLCanvasElement
  private gl: WebGLRenderingContext
  private program: WebGLProgram
  private uniforms: {
    resolution: WebGLUniformLocation | null
    pan: WebGLUniformLocation | null
    zoom: WebGLUniformLocation | null
    gridColor: WebGLUniformLocation | null
    majorGridColor: WebGLUniformLocation | null
    axisColor: WebGLUniformLocation | null
    gridSpacing: WebGLUniformLocation | null
    majorEvery: WebGLUniformLocation | null
  }
  private config: WebGLGridConfig
  private lastViewport: ViewportState | null = null

  constructor(container: HTMLElement, config: Partial<WebGLGridConfig> = {}) {
    this.config = { ...DEFAULT_GRID_CONFIG, ...config }

    this.canvas = document.createElement('canvas')
    this.canvas.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    `
    container.appendChild(this.canvas)

    const gl = this.canvas.getContext('webgl', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true
    })

    if (!gl) {
      this.canvas.remove()
      throw new Error('WebGL not supported')
    }

    this.gl = gl
    this.program = this.createProgram()
    this.uniforms = this.getUniformLocations()

    // Enable blending for transparency
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

    this.applyConfig()
  }

  private createProgram(): WebGLProgram {
    const gl = this.gl
    const fragmentShader =
      this.config.type === 'dots' ? DOTS_FRAGMENT_SHADER : LINES_FRAGMENT_SHADER

    const vertexShader = this.compileShader(gl.VERTEX_SHADER, VERTEX_SHADER)
    const fragShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentShader)

    const program = gl.createProgram()
    if (!program) {
      throw new Error('Failed to create WebGL program')
    }

    gl.attachShader(program, vertexShader)
    gl.attachShader(program, fragShader)
    gl.linkProgram(program)

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const error = gl.getProgramInfoLog(program)
      throw new Error(`Shader program failed to link: ${error}`)
    }

    // Set up full-screen quad
    const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1])
    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW)

    const positionLocation = gl.getAttribLocation(program, 'a_position')
    gl.enableVertexAttribArray(positionLocation)
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)

    return program
  }

  private compileShader(type: number, source: string): WebGLShader {
    const gl = this.gl
    const shader = gl.createShader(type)
    if (!shader) {
      throw new Error('Failed to create shader')
    }

    gl.shaderSource(shader, source)
    gl.compileShader(shader)

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(shader)
      gl.deleteShader(shader)
      throw new Error(`Shader compilation failed: ${error}`)
    }

    return shader
  }

  private getUniformLocations() {
    const gl = this.gl
    const program = this.program

    return {
      resolution: gl.getUniformLocation(program, 'u_resolution'),
      pan: gl.getUniformLocation(program, 'u_pan'),
      zoom: gl.getUniformLocation(program, 'u_zoom'),
      gridColor: gl.getUniformLocation(program, 'u_gridColor'),
      majorGridColor: gl.getUniformLocation(program, 'u_majorGridColor'),
      axisColor: gl.getUniformLocation(program, 'u_axisColor'),
      gridSpacing: gl.getUniformLocation(program, 'u_gridSpacing'),
      majorEvery: gl.getUniformLocation(program, 'u_majorEvery')
    }
  }

  private applyConfig(): void {
    const gl = this.gl
    gl.useProgram(this.program)

    if (this.uniforms.gridColor) {
      gl.uniform4fv(this.uniforms.gridColor, this.config.gridColor)
    }
    if (this.uniforms.majorGridColor) {
      gl.uniform4fv(this.uniforms.majorGridColor, this.config.majorGridColor)
    }
    if (this.uniforms.axisColor) {
      gl.uniform4fv(this.uniforms.axisColor, this.config.axisColor)
    }
    if (this.uniforms.gridSpacing) {
      gl.uniform1f(this.uniforms.gridSpacing, this.config.gridSpacing)
    }
    if (this.uniforms.majorEvery) {
      gl.uniform1f(this.uniforms.majorEvery, this.config.majorEvery)
    }
  }

  setConfig(config: Partial<WebGLGridConfig>): void {
    const typeChanged = config.type !== undefined && config.type !== this.config.type
    this.config = { ...this.config, ...config }

    if (typeChanged) {
      // Need to recreate program with different fragment shader
      this.gl.deleteProgram(this.program)
      this.program = this.createProgram()
      this.uniforms = this.getUniformLocations()
    }

    this.applyConfig()

    // Re-render with current viewport if available
    if (this.lastViewport) {
      this.render(this.lastViewport)
    }
  }

  resize(): void {
    const dpr = window.devicePixelRatio || 1
    const rect = this.canvas.getBoundingClientRect()

    const width = Math.round(rect.width * dpr)
    const height = Math.round(rect.height * dpr)

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width
      this.canvas.height = height
      this.gl.viewport(0, 0, width, height)
    }
  }

  render(viewport: ViewportState): void {
    this.lastViewport = viewport
    const gl = this.gl

    gl.useProgram(this.program)

    if (this.uniforms.resolution) {
      gl.uniform2f(this.uniforms.resolution, this.canvas.width, this.canvas.height)
    }
    if (this.uniforms.pan) {
      gl.uniform2f(this.uniforms.pan, viewport.x, viewport.y)
    }
    if (this.uniforms.zoom) {
      gl.uniform1f(this.uniforms.zoom, viewport.zoom)
    }

    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  destroy(): void {
    this.gl.deleteProgram(this.program)
    this.canvas.remove()
  }
}
