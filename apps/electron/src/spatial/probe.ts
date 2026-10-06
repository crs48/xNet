export type InputObservation = {
  id: number
  profiles: string[]
  hand: string
  ray: string
  mapping: string
  grip: boolean
  positionTracked: boolean
  positionChanged: boolean
  rotationChanged: boolean
  triggerMin: number
  triggerMax: number
  analogObserved: boolean
  selections: number
  connected: boolean
}
export function createProbe() {
  const observations = new Map<XRInputSource, InputObservation>()
  const origins = new Map<XRInputSource, number[]>()
  const intervals: number[] = []
  let previous = 0
  let frames = 0
  let interruptions = 0
  let features: string[] = []
  const observe = (source: XRInputSource) => {
    let item = observations.get(source)
    if (!item) {
      if (observations.size >= 32) {
        const oldest = [...observations].find(([, value]) => !value.connected)
        if (oldest) {
          observations.delete(oldest[0])
          origins.delete(oldest[0])
        }
      }
      item = {
        id: frames + observations.size,
        profiles: [...source.profiles],
        hand: source.handedness,
        ray: source.targetRayMode,
        mapping: source.gamepad?.mapping ?? '',
        grip: !!source.gripSpace,
        positionTracked: false,
        positionChanged: false,
        rotationChanged: false,
        triggerMin: 1,
        triggerMax: 0,
        analogObserved: false,
        selections: 0,
        connected: true
      }
      observations.set(source, item)
    }
    return item
  }
  return {
    start(session: XRSession) {
      features = [...(session.enabledFeatures ?? [])]
      previous = 0
    },
    interrupt() {
      previous = 0
      interruptions++
    },
    select(source: XRInputSource) {
      observe(source).selections++
    },
    frame(time: number, frame: XRFrame, space: XRReferenceSpace) {
      frames++
      if (previous && time > previous) {
        intervals.push(time - previous)
        if (intervals.length > 4096) intervals.shift()
      }
      previous = time
      const sources = new Set(frame.session.inputSources)
      for (const [source, item] of observations) item.connected = sources.has(source)
      for (const source of sources) {
        const item = observe(source)
        item.connected = true
        const pose = source.gripSpace ? frame.getPose(source.gripSpace, space) : null
        if (pose && !pose.emulatedPosition) {
          item.positionTracked = true
          const p = pose.transform.position,
            q = pose.transform.orientation
          const values = [p.x, p.y, p.z, q.x, q.y, q.z, q.w]
          const first = origins.get(source) ?? values
          origins.set(source, first)
          item.positionChanged ||=
            Math.hypot(...values.slice(0, 3).map((v, i) => v - first[i])) > 0.02
          item.rotationChanged ||=
            Math.abs(values.slice(3).reduce((dot, v, i) => dot + v * first[i + 3], 0)) < 0.995
        }
        const trigger = source.gamepad?.buttons[0]?.value
        if (trigger !== undefined && Number.isFinite(trigger)) {
          item.triggerMin = Math.min(item.triggerMin, trigger)
          item.triggerMax = Math.max(item.triggerMax, trigger)
          item.analogObserved ||= trigger > 0.1 && trigger < 0.9
        }
      }
    },
    flightReady(source: XRInputSource) {
      const item = observations.get(source)
      return (
        !!item &&
        item.positionChanged &&
        item.rotationChanged &&
        item.analogObserved &&
        item.triggerMin < 0.1 &&
        item.triggerMax > 0.9 &&
        item.mapping === 'xr-standard'
      )
    },
    report() {
      const sorted = [...intervals].sort((a, b) => a - b)
      const percentile = (p: number) => sorted[Math.floor((sorted.length - 1) * p)] ?? null
      const median = percentile(0.5)
      return {
        userAgent: navigator.userAgent,
        features,
        frames,
        interruptions,
        cadenceHz: median ? 1000 / median : null,
        p95Ms: percentile(0.95),
        p99Ms: percentile(0.99),
        intervalsAboveOneAndHalfMedian: median
          ? intervals.filter((n) => n > median * 1.5).length
          : null,
        samples: intervals.length,
        input: [...observations.values()],
        limitations:
          'Pose changes and analog samples are observations, not a hardware or comfort certification. GPU and total process memory are not measured.'
      }
    }
  }
}
