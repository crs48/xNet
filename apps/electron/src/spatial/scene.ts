import type { Vec3, TravelState } from '../shared/library-flight'
import type { SpatialSnapshot } from '../shared/spatial-library'
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Quaternion,
  Raycaster,
  Scene,
  SphereGeometry,
  Mesh,
  MeshBasicMaterial,
  Vector2,
  Vector3,
  WebGLRenderer
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import {
  brakeFlight,
  initialFlight,
  stepFlight,
  travelTo,
  travelBack
} from '../shared/library-flight'
import { graphAdjacency, graphColor } from '../shared/library-graph/model'
import { spatialPanel } from './panel'
import { createProbe } from './probe'

export function createSpatialScene(
  host: HTMLElement,
  callbacks: {
    select(id: string): void
    status(message: string): void
    session(active: boolean): void
  }
) {
  const renderer = new WebGLRenderer({ antialias: true })
  renderer.setClearColor('#080f1d')
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.xr.enabled = true
  renderer.xr.setReferenceSpaceType('local-floor')
  const canvas = renderer.domElement
  canvas.tabIndex = 0
  canvas.setAttribute('aria-label', 'Spatial Library graph. Search the list to select a resource.')
  host.append(canvas)
  const world = new Scene()
  const rig = new Group()
  const camera = new PerspectiveCamera(55, 1, 0.02, 100)
  camera.position.set(0, 1.6, 2)
  rig.add(camera)
  world.add(rig)
  const controls = new OrbitControls(camera, canvas)
  controls.target.set(0, 1.4, -3)
  controls.minDistance = 0.1
  controls.maxDistance = 30
  const root = new Group()
  world.add(root)
  const card = spatialPanel()
  card.mesh.visible = false
  world.add(card.mesh)
  const navigation = spatialPanel(1.5, 0.25)
  navigation.buttons(
    ['Home', 'Back', 'Travel there', 'Brake', 'Exit / search'],
    'Stationary overview · Select a link to inspect'
  )
  navigation.mesh.visible = false
  world.add(navigation.mesh)
  const flightButton = spatialPanel(0.8, 0.16)
  flightButton.draw(['Arm experimental flight'])
  flightButton.mesh.visible = false
  world.add(flightButton.mesh)
  const labels: ReturnType<typeof spatialPanel>[] = []
  const marker = new Mesh(
    new SphereGeometry(0.025, 12, 8),
    new MeshBasicMaterial({ color: '#ffffff', wireframe: true })
  )
  marker.visible = false
  world.add(marker)
  const probe = createProbe()
  const raycaster = new Raycaster()
  raycaster.params.Points = { threshold: 0.025 }
  let snapshot: SpatialSnapshot | null = null
  let points: Points | null = null
  let edges: LineSegments | null = null
  let highlight: LineSegments | null = null
  let selected: string | null = null
  let adjacency: number[][] = []
  let flight = initialFlight()
  let travel: TravelState = { revision: '', position: [0, 0, 0], trail: [] }
  let hand: XRHandedness = 'right'
  let session: XRSession | null = null
  let arm = false
  let lastTime = 0
  let disposed = false
  let frameHandle = 0
  let desktop: { position: Vector3; quaternion: Quaternion; target: Vector3 } | null = null
  let sourceInUse: XRInputSource | null = null
  const matrix = new Matrix4(),
    vector = new Vector3()
  const halt = () => {
    flight = brakeFlight(flight)
    arm = false
    sourceInUse = null
  }
  const render = () => {
    frameHandle = 0
    if (!session && !disposed) {
      controls.update()
      renderer.render(world, camera)
    }
  }
  const invalidate = () => {
    if (!frameHandle && !session && !disposed) frameHandle = requestAnimationFrame(render)
  }
  const panelAtViewer = () => {
    rig.updateMatrixWorld(true)
    if (renderer.xr.isPresenting) renderer.xr.updateCamera(camera)
    const viewer = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera
    viewer.updateWorldMatrix(true, false)
    const origin = viewer.getWorldPosition(new Vector3())
    const forward = viewer.getWorldDirection(new Vector3())
    forward.y = 0
    if (forward.lengthSq() < 0.01) forward.set(0, 0, -1)
    forward.normalize()
    navigation.mesh.position.copy(origin).addScaledVector(forward, 1.6)
    navigation.mesh.position.y = origin.y - 0.5
    navigation.mesh.lookAt(origin)
    flightButton.mesh.position.copy(navigation.mesh.position)
    flightButton.mesh.position.y -= 0.24
    flightButton.mesh.lookAt(origin)
  }
  function move(position: Vec3) {
    halt()
    flight = initialFlight(position)
    rig.position.fromArray(position)
    panelAtViewer()
    invalidate()
  }
  const home = () => {
    travel = travelTo({ ...travel, position: flight.position }, [0, 0, 0])
    move(travel.position)
  }
  const back = () => {
    travel = travelBack({ ...travel, position: flight.position })
    move(travel.position)
  }
  function destination() {
    if (!snapshot || !selected || !session) return
    const index = snapshot.graph.nodes.findIndex((node) => node.id === selected)
    if (index < 0) return
    const point = new Vector3().fromArray(snapshot.positions, index * 3)
    // Move only after the explicit action, preserving the runtime's tracked head offset.
    const head = renderer.xr.getCamera().getWorldPosition(new Vector3()).sub(rig.position)
    travel = travelTo({ ...travel, position: flight.position }, [
      point.x - head.x,
      point.y - head.y,
      point.z + 0.8 - head.z
    ])
    move(travel.position)
  }
  const disposeGeometry = () => {
    for (const object of [points, edges, highlight])
      if (object) {
        root.remove(object)
        object.geometry.dispose()
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        materials.forEach((material) => material.dispose())
      }
    for (const label of labels) {
      world.remove(label.mesh)
      label.dispose()
    }
    labels.length = 0
  }
  const select = (id: string) => {
    halt()
    selected = id
    if (!snapshot) return
    const index = snapshot.graph.nodes.findIndex((node) => node.id === id)
    if (index < 0) {
      marker.visible = false
      card.mesh.visible = false
      return
    }
    marker.position.fromArray(snapshot.positions, index * 3)
    marker.visible = true
    card.mesh.position.copy(marker.position).add(new Vector3(0.7, 0.35, 0))
    card.mesh.lookAt((session ? renderer.xr.getCamera() : camera).getWorldPosition(new Vector3()))
    card.mesh.visible = true
    const node = snapshot.graph.nodes[index]
    const evidence = [
      ...new Set(
        snapshot.graph.edges
          .filter((e) => e.source === index || e.target === index)
          .map((e) => `${e.kind}: ${e.evidence}`)
      )
    ]
    card.draw([
      node.label,
      `${node.platform || node.kind} · ${adjacency[index].length} connections`,
      evidence.join(' · '),
      'Loading saved details…'
    ])
    if (highlight) {
      root.remove(highlight)
      highlight.geometry.dispose()
      ;(highlight.material as LineBasicMaterial).dispose()
    }
    const lines = adjacency[index]
      .slice(0, 200)
      .flatMap((other) => [
        ...snapshot!.positions.slice(index * 3, index * 3 + 3),
        ...snapshot!.positions.slice(other * 3, other * 3 + 3)
      ])
    highlight = new LineSegments(
      new BufferGeometry().setAttribute(
        'position',
        new BufferAttribute(new Float32Array(lines), 3)
      ),
      new LineBasicMaterial({ color: '#ffffff' })
    )
    root.add(highlight)
    panelAtViewer()
    callbacks.select(id)
    invalidate()
  }
  function pick() {
    if (!snapshot || !points) return
    // Intentional selection only, never a full-cloud per-frame hover raycast.
    const hit = raycaster.intersectObject(points)[0]
    if (hit?.index !== undefined) select(snapshot.graph.nodes[hit.index].id)
  }
  let pointerStart = [0, 0]
  const pointerDown = (event: PointerEvent) => {
    pointerStart = [event.clientX, event.clientY]
  }
  const pointer = (event: PointerEvent) => {
    if (
      session ||
      event.button !== 0 ||
      Math.hypot(event.clientX - pointerStart[0], event.clientY - pointerStart[1]) > 5
    )
      return
    const bounds = canvas.getBoundingClientRect()
    raycaster.setFromCamera(
      new Vector2(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        (-(event.clientY - bounds.top) / bounds.height) * 2 + 1
      ),
      camera
    )
    pick()
  }
  const onSelect = (event: XRInputSourceEvent) => {
    probe.select(event.inputSource)
    const space = renderer.xr.getReferenceSpace()
    if (!space || !session) return
    const pose = event.frame.getPose(event.inputSource.targetRaySpace, space)
    if (!pose) {
      halt()
      return
    }
    matrix.fromArray(pose.transform.matrix).premultiply(rig.matrixWorld)
    raycaster.ray.origin.setFromMatrixPosition(matrix)
    raycaster.ray.direction.set(0, 0, -1).transformDirection(matrix)
    const nav = raycaster.intersectObject(navigation.mesh)[0]
    if (nav?.uv && nav.uv.y > 0.38) {
      halt()
      const action = Math.min(4, Math.floor(nav.uv.x * 5))
      if (action === 0) home()
      if (action === 1) back()
      if (action === 2) destination()
      if (action === 4)
        void session.end().catch((error: unknown) => callbacks.status(String(error)))
      return
    }
    if (flightButton.mesh.visible && raycaster.intersectObject(flightButton.mesh).length) {
      halt()
      arm = true
      callbacks.status('Release the flight trigger, then squeeze to accelerate.')
      return
    }
    if (flight.mode === 'armed' && event.inputSource.handedness === hand) return
    pick()
  }
  const onVisibility = () => {
    halt()
    probe.interrupt()
    lastTime = 0
  }
  const onSources = () => {
    halt()
    probe.interrupt()
  }
  const end = () => {
    const old = session
    session = null
    old?.removeEventListener('select', onSelect)
    old?.removeEventListener('visibilitychange', onVisibility)
    old?.removeEventListener('inputsourceschange', onSources)
    old?.removeEventListener('end', end)
    renderer.setAnimationLoop(null)
    halt()
    rig.position.set(0, 0, 0)
    if (desktop) {
      camera.position.copy(desktop.position)
      camera.quaternion.copy(desktop.quaternion)
      controls.target.copy(desktop.target)
    }
    controls.enabled = true
    navigation.mesh.visible = false
    flightButton.mesh.visible = false
    callbacks.session(false)
    callbacks.status('Session ended. Desktop viewpoint restored.')
    // Three.js releases its XR framebuffer in another listener for this event.
    queueMicrotask(resize)
  }
  async function enter() {
    if (session || disposed) return
    if (!isSecureContext || !navigator.xr)
      throw new Error('WebXR requires a supported browser and a trusted secure connection.')
    const next = await navigator.xr.requestSession('immersive-vr', {
      requiredFeatures: ['local-floor'],
      optionalFeatures: ['hand-tracking']
    })
    if (disposed) {
      await next.end()
      return
    }
    desktop = {
      position: camera.position.clone(),
      quaternion: camera.quaternion.clone(),
      target: controls.target.clone()
    }
    session = next
    controls.enabled = false
    cancelAnimationFrame(frameHandle)
    frameHandle = 0
    camera.position.set(0, 0, 0)
    camera.quaternion.identity()
    move([0, 0, 0])
    lastTime = 0
    next.addEventListener('select', onSelect)
    next.addEventListener('end', end)
    next.addEventListener('visibilitychange', onVisibility)
    next.addEventListener('inputsourceschange', onSources)
    try {
      await renderer.xr.setSession(next)
      navigation.mesh.visible = true
      panelAtViewer()
      probe.start(next)
      callbacks.session(true)
      renderer.setAnimationLoop((time, frame) => {
        if (!frame || !session) return
        const space = renderer.xr.getReferenceSpace()
        if (!space) {
          halt()
          return
        }
        if (!lastTime) panelAtViewer()
        probe.frame(time, frame, space)
        const source = Array.from(session.inputSources).find(
          (s) =>
            s.handedness === hand &&
            s.targetRayMode === 'tracked-pointer' &&
            s.gripSpace &&
            s.gamepad?.mapping === 'xr-standard'
        )
        const pose = source?.gripSpace ? frame.getPose(source.gripSpace, space) : null
        const ready = !!source && probe.flightReady(source)
        if (sourceInUse && sourceInUse !== source) halt()
        sourceInUse = source ?? null
        const q = pose?.transform.orientation
        vector.set(0, 0, -1)
        if (q) vector.applyQuaternion(new Quaternion(q.x, q.y, q.z, q.w))
        // Default mode translates the rig only; the head quaternion is never a flight input.
        const trigger = source?.gamepad?.buttons[0]?.value ?? 0
        flight = stepFlight(
          flight,
          {
            tracked:
              !!pose &&
              !pose.emulatedPosition &&
              [
                pose.transform.position.x,
                pose.transform.position.y,
                pose.transform.position.z,
                pose.transform.orientation.x,
                pose.transform.orientation.y,
                pose.transform.orientation.z,
                pose.transform.orientation.w
              ].every(Number.isFinite) &&
              ready,
            visible: session.visibilityState === 'visible' && !!frame.getViewerPose(space),
            trigger,
            direction: [vector.x, vector.y, vector.z],
            arm: arm && ready,
            brake: !!source?.gamepad?.buttons[1]?.pressed
          },
          lastTime ? (time - lastTime) / 1000 : 0
        )
        arm = false
        lastTime = time
        rig.position.fromArray(flight.position)
        flightButton.mesh.visible = ready && flight.mode !== 'armed'
        const viewerPosition = renderer.xr.getCamera().getWorldPosition(new Vector3())
        labels.forEach((label) => label.mesh.lookAt(viewerPosition))
        if (card.mesh.visible) card.mesh.lookAt(viewerPosition)
        renderer.render(world, camera)
      })
    } catch (error) {
      await next.end().catch(() => undefined)
      if (session) end()
      throw error
    }
  }
  const resize = () => {
    const { width, height } = host.getBoundingClientRect()
    if (!session) renderer.setSize(width, height)
    camera.aspect = width / Math.max(1, height)
    camera.updateProjectionMatrix()
    invalidate()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(host)
  controls.addEventListener('change', invalidate)
  canvas.addEventListener('click', pointer)
  canvas.addEventListener('pointerdown', pointerDown)
  const lost = (event: Event) => {
    event.preventDefault()
    halt()
    callbacks.status('Graphics context lost. Exit the session and reload the viewer.')
    void session?.end().catch((error: unknown) => callbacks.status(String(error)))
  }
  canvas.addEventListener('webglcontextlost', lost)
  resize()
  return {
    enter,
    select,
    home,
    back,
    destination,
    brake: halt,
    setHand(value: 'left' | 'right') {
      halt()
      hand = value
    },
    async exit() {
      if (session) await session.end()
    },
    setSnapshot(value: SpatialSnapshot) {
      if (session) throw new Error('Exit to apply graph changes.')
      disposeGeometry()
      snapshot = value
      adjacency = graphAdjacency(value.graph)
      if (travel.revision !== value.revision) {
        travel = { revision: value.revision, position: [0, 0, 0], trail: [] }
        move([0, 0, 0])
      }
      const colors = new Float32Array(value.positions.length)
      value.graph.nodes.forEach((node, i) =>
        new Color(graphColor(node.kind, node.platform)).toArray(colors, i * 3)
      )
      const geometry = new BufferGeometry()
        .setAttribute('position', new BufferAttribute(new Float32Array(value.positions), 3))
        .setAttribute('color', new BufferAttribute(colors, 3))
      geometry.computeBoundingSphere()
      points = new Points(
        geometry,
        new PointsMaterial({ size: 0.015, sizeAttenuation: true, vertexColors: true })
      )
      root.add(points)
      const lines = value.graph.edges
        .slice(0, 20_000)
        .flatMap((edge) => [
          ...value.positions.slice(edge.source * 3, edge.source * 3 + 3),
          ...value.positions.slice(edge.target * 3, edge.target * 3 + 3)
        ])
      edges = new LineSegments(
        new BufferGeometry().setAttribute(
          'position',
          new BufferAttribute(new Float32Array(lines), 3)
        ),
        new LineBasicMaterial({ color: '#243850' })
      )
      root.add(edges)
      const hubs = value.graph.nodes
        .map((node, i) => ({ node, i }))
        .filter(({ node }) => node.kind !== 'link')
        .sort((a, b) => adjacency[b.i].length - adjacency[a.i].length)
        .slice(0, 8)
      for (const { node, i } of hubs) {
        const label = spatialPanel(0.45, 0.09)
        label.draw([`${node.label} (${adjacency[i].length})`])
        label.mesh.position.fromArray(value.positions, i * 3)
        label.mesh.position.y += 0.08
        label.mesh.lookAt(camera.position)
        labels.push(label)
        world.add(label.mesh)
      }
      marker.visible = false
      card.mesh.visible = false
      if (selected) select(selected)
      invalidate()
    },
    detail(lines: string[], image?: CanvasImageSource) {
      card.draw(lines, image)
      invalidate()
    },
    report() {
      return {
        ...probe.report(),
        graphRevision: snapshot?.revision,
        nodes: snapshot?.graph.nodes.length,
        drawnEdges: Math.min(snapshot?.graph.edges.length ?? 0, 20_000),
        labels: labels.length,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        calls: renderer.info.render.calls,
        note: 'Rendering caps are provisional. Headset frame-time and memory budgets remain unverified.'
      }
    },
    async dispose() {
      disposed = true
      if (session) await session.end()
      cancelAnimationFrame(frameHandle)
      renderer.setAnimationLoop(null)
      observer.disconnect()
      controls.removeEventListener('change', invalidate)
      controls.dispose()
      canvas.removeEventListener('click', pointer)
      canvas.removeEventListener('pointerdown', pointerDown)
      canvas.removeEventListener('webglcontextlost', lost)
      disposeGeometry()
      card.dispose()
      navigation.dispose()
      flightButton.dispose()
      marker.geometry.dispose()
      ;(marker.material as MeshBasicMaterial).dispose()
      renderer.dispose()
      canvas.remove()
    }
  }
}
