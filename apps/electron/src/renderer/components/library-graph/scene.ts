import type { LibraryGraph } from '../../../shared/library-graph'
import {
  Scene,
  Color,
  PerspectiveCamera,
  WebGLRenderer,
  BufferGeometry,
  BufferAttribute,
  ShaderMaterial,
  Points,
  LineBasicMaterial,
  LineSegments,
  Vector2,
  Vector3,
  Raycaster,
  Box3
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { graphColor, graphAdjacency, initialPositions } from './model'

export function createGraphScene(
  host: HTMLElement,
  graph: LibraryGraph,
  callbacks: {
    hover: (index: number | null) => void
    select: (index: number) => void
    failure: (message: string) => void
  }
) {
  const renderer = new WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'low-power'
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearColor('#080f1d')
  const canvas = renderer.domElement
  canvas.className =
    'absolute inset-0 h-full w-full outline-none focus-visible:ring-2 focus-visible:ring-violet-400'
  canvas.setAttribute(
    'aria-label',
    '3D link graph. Drag to orbit, scroll to zoom. Use the search and connection list to select links with the keyboard.'
  )
  canvas.tabIndex = 0
  host.appendChild(canvas)
  const scene = new Scene()
  const camera = new PerspectiveCamera(50, 1, 0.1, 100000)
  const controls = new OrbitControls(camera, canvas)
  controls.minDistance = 12
  controls.maxDistance = 30000
  controls.listenToKeyEvents(canvas)
  const positions = initialPositions(graph)
  const colors = new Float32Array(positions.length)
  const sizes = new Float32Array(graph.nodes.length)
  const emphasis = new Float32Array(graph.nodes.length).fill(1)
  graph.nodes.forEach((node, i) => {
    new Color(graphColor(node.kind, node.platform)).toArray(colors, i * 3)
    sizes[i] =
      graph.nodes.length > 10000 ? (node.kind === 'link' ? 2 : 4) : node.kind === 'link' ? 5 : 9
  })
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
  geometry.setAttribute('size', new BufferAttribute(sizes, 1))
  geometry.setAttribute('emphasis', new BufferAttribute(emphasis, 1))
  const material = new ShaderMaterial({
    uniforms: { pixelRatio: { value: renderer.getPixelRatio() } },
    vertexShader: `attribute vec3 color; attribute float size; attribute float emphasis;
      uniform float pixelRatio; varying vec3 vColor; varying float vAlpha;
      void main() { vColor = color; vAlpha = emphasis;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * pixelRatio * (emphasis > 0.99 ? 1.0 : 0.8); }`,
    fragmentShader: `varying vec3 vColor; varying float vAlpha;
      void main() { float d = length(gl_PointCoord - vec2(0.5)); if (d > 0.5) discard;
        gl_FragColor = vec4(vColor, vAlpha * smoothstep(0.5, 0.28, d)); }`,
    transparent: true,
    depthWrite: false
  })
  const points = new Points(geometry, material)
  points.frustumCulled = false
  scene.add(points)
  const edgeGeometry = new BufferGeometry()
  const edgePositions = new Float32Array(graph.edges.length * 6)
  edgeGeometry.setAttribute('position', new BufferAttribute(edgePositions, 3))
  const edgeMaterial = new LineBasicMaterial({
    color: '#6682aa',
    transparent: true,
    opacity: graph.edges.length > 10000 ? 0.025 : 0.15,
    depthWrite: false
  })
  const lines = new LineSegments(edgeGeometry, edgeMaterial)
  lines.frustumCulled = false
  scene.add(lines)
  const highlightGeometry = new BufferGeometry()
  const highlightPositions = new Float32Array(graph.edges.length * 6)
  highlightGeometry.setAttribute('position', new BufferAttribute(highlightPositions, 3))
  highlightGeometry.setDrawRange(0, 0)
  const highlightMaterial = new LineBasicMaterial({
    color: '#d8b4fe',
    transparent: true,
    opacity: 0.7,
    depthWrite: false
  })
  const highlight = new LineSegments(highlightGeometry, highlightMaterial)
  highlight.frustumCulled = false
  scene.add(highlight)
  const adjacency = graphAdjacency(graph)
  let active: number | null = null
  let hover: number | null = null
  let disposed = false
  let frame = 0
  const point = new Vector3()
  const labels = graph.nodes
    .map((node, index) => ({ node, index, count: adjacency[index].length }))
    .filter(({ node }) => node.kind !== 'link')
    .sort((a, b) => b.count - a.count)
    .slice(0, 12)
    .map(({ node, index }) => {
      const element = document.createElement('div')
      element.className =
        'pointer-events-none absolute max-w-36 truncate rounded bg-slate-950/75 px-1.5 py-0.5 text-[10px] text-slate-300'
      element.textContent = node.label
      host.appendChild(element)
      return { index, element }
    })
  const render = () => {
    frame = 0
    if (disposed) return
    renderer.render(scene, camera)
    const occupied: { x: number; y: number }[] = []
    labels.forEach(({ index, element }) => {
      point.fromArray(positions, index * 3).project(camera)
      const x = ((point.x + 1) * host.clientWidth) / 2
      const y = ((1 - point.y) * host.clientHeight) / 2
      const hidden =
        Math.abs(point.z) > 1 ||
        x < 0 ||
        x > host.clientWidth - 100 ||
        y < 0 ||
        y > host.clientHeight - 20 ||
        occupied.some((other) => Math.abs(other.x - x) < 100 && Math.abs(other.y - y) < 22)
      element.style.display = hidden ? 'none' : 'block'
      if (!hidden) {
        occupied.push({ x, y })
        element.style.transform = `translate(${x + 8}px, ${y - 10}px)`
      }
    })
  }
  const invalidate = () => {
    if (!frame && !disposed) frame = requestAnimationFrame(render)
  }
  const updateEdges = () => {
    graph.edges.forEach((edge, i) => {
      for (let axis = 0; axis < 3; axis++) {
        edgePositions[i * 6 + axis] = positions[edge.source * 3 + axis]
        edgePositions[i * 6 + axis + 3] = positions[edge.target * 3 + axis]
      }
    })
    edgeGeometry.attributes.position.needsUpdate = true
    const selectedEdges =
      active === null
        ? []
        : graph.edges.filter((edge) => edge.source === active || edge.target === active)
    selectedEdges.forEach((edge, i) => {
      highlightPositions.set(positions.subarray(edge.source * 3, edge.source * 3 + 3), i * 6)
      highlightPositions.set(positions.subarray(edge.target * 3, edge.target * 3 + 3), i * 6 + 3)
    })
    highlightGeometry.setDrawRange(0, selectedEdges.length * 2)
    highlightGeometry.attributes.position.needsUpdate = true
  }
  const fit = () => {
    const box = new Box3().setFromBufferAttribute(geometry.attributes.position as BufferAttribute)
    if (box.isEmpty()) box.set(new Vector3(-50, -50, -50), new Vector3(50, 50, 50))
    const center = box.getCenter(new Vector3())
    const radius = Math.max(40, box.getSize(new Vector3()).length() / 2)
    const fov = 2 * Math.atan(Math.tan((camera.fov * Math.PI) / 360) * Math.min(1, camera.aspect))
    const distance = (radius / Math.sin(fov / 2)) * 1.05
    controls.target.copy(center)
    camera.position
      .copy(center)
      .add(new Vector3(0.18, 0.12, 1).normalize().multiplyScalar(distance))
    controls.update()
    invalidate()
  }
  const resize = () => {
    const width = Math.max(1, host.clientWidth),
      height = Math.max(1, host.clientHeight)
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    invalidate()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(host)
  controls.addEventListener('change', invalidate)
  resize()
  updateEdges()
  fit()
  const ray = new Raycaster()
  const pointer = new Vector2()
  let down: { x: number; y: number } | null = null
  let lastPick = 0
  const pick = (event: PointerEvent): number | null => {
    const rect = canvas.getBoundingClientRect()
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      (-(event.clientY - rect.top) / rect.height) * 2 + 1
    )
    ray.setFromCamera(pointer, camera)
    ray.params.Points.threshold =
      (camera.position.distanceTo(controls.target) * Math.tan((camera.fov * Math.PI) / 360) * 16) /
      rect.height
    let best: number | null = null,
      score = 65
    for (const intersection of ray.intersectObject(points)) {
      const index = intersection.index
      if (index === undefined) continue
      point.fromArray(positions, index * 3).project(camera)
      if (Math.abs(point.z) > 1) continue
      const dx = ((point.x - pointer.x) * rect.width) / 2
      const dy = ((point.y - pointer.y) * rect.height) / 2
      const distance = dx * dx + dy * dy
      if (distance < score) {
        best = index
        score = distance
      }
    }
    return best
  }
  const move = (event: PointerEvent) => {
    if (event.buttons || performance.now() - lastPick < 60) return
    lastPick = performance.now()
    const next = pick(event)
    if (next !== hover) {
      hover = next
      callbacks.hover(next)
      canvas.style.cursor = next === null ? 'grab' : 'pointer'
    }
  }
  const leave = () => {
    hover = null
    callbacks.hover(null)
  }
  const pointerDown = (event: PointerEvent) => {
    down = { x: event.clientX, y: event.clientY }
  }
  const pointerUp = (event: PointerEvent) => {
    if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) < 5) {
      const index = pick(event)
      if (index !== null) callbacks.select(index)
    }
    down = null
  }
  const contextLost = (event: Event) => {
    event.preventDefault()
    callbacks.failure(
      'The 3D graphics context was lost. Reload the graph to recover. Your Library is unchanged.'
    )
  }
  canvas.addEventListener('pointermove', move)
  canvas.addEventListener('pointerleave', leave)
  canvas.addEventListener('pointerdown', pointerDown)
  canvas.addEventListener('pointerup', pointerUp)
  canvas.addEventListener('webglcontextlost', contextLost)
  return {
    fit,
    positions(next: Float32Array) {
      if (next.length !== positions.length || next.some((value) => !Number.isFinite(value))) {
        callbacks.failure('The layout returned invalid positions. Reload the graph to try again.')
        return
      }
      positions.set(next)
      geometry.attributes.position.needsUpdate = true
      geometry.computeBoundingSphere()
      updateEdges()
      invalidate()
    },
    active(index: number | null) {
      active = index
      emphasis.fill(index === null ? 1 : 0.13)
      if (index !== null) {
        emphasis[index] = 1
        adjacency[index].forEach((neighbor) => {
          emphasis[neighbor] = 1
        })
      }
      geometry.attributes.emphasis.needsUpdate = true
      updateEdges()
      invalidate()
    },
    focus(index: number) {
      const center = new Vector3().fromArray(positions, index * 3)
      const direction = camera.position.clone().sub(controls.target).normalize()
      controls.target.copy(center)
      camera.position.copy(center).add(direction.multiplyScalar(240))
      controls.update()
      invalidate()
    },
    zoom(factor: number) {
      camera.position.sub(controls.target).multiplyScalar(factor).add(controls.target)
      controls.update()
      invalidate()
    },
    dispose() {
      disposed = true
      cancelAnimationFrame(frame)
      observer.disconnect()
      controls.dispose()
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerleave', leave)
      canvas.removeEventListener('pointerdown', pointerDown)
      canvas.removeEventListener('pointerup', pointerUp)
      canvas.removeEventListener('webglcontextlost', contextLost)
      geometry.dispose()
      material.dispose()
      edgeGeometry.dispose()
      edgeMaterial.dispose()
      highlightGeometry.dispose()
      highlightMaterial.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      canvas.remove()
      labels.forEach(({ element }) => element.remove())
    }
  }
}
