export type Vec3 = readonly [number, number, number]
export type FlightState = {
  mode: 'inspect' | 'armed' | 'stopped'
  position: Vec3
  velocity: Vec3
  released: boolean
}
export type FlightInput = {
  tracked: boolean
  visible: boolean
  trigger: number
  /** World-space unit aim. The XR adapter transforms reference space exactly once. */
  direction: Vec3
  arm?: boolean
  brake?: boolean
}
export const flightLimits = { acceleration: 0.8, speed: 0.8, drag: 2, deadZone: 0.08, maxGap: 0.1 }
const zero: Vec3 = [0, 0, 0]
export const initialFlight = (position: Vec3 = zero): FlightState => ({
  mode: 'inspect',
  position,
  velocity: zero,
  released: false
})
export const brakeFlight = (state: FlightState): FlightState => ({
  ...state,
  mode: 'inspect',
  velocity: zero,
  released: false
})
export function stepFlight(state: FlightState, input: FlightInput, dt: number): FlightState {
  const length = Math.hypot(...input.direction)
  if (
    !input.visible ||
    !input.tracked ||
    !Number.isFinite(dt) ||
    dt < 0 ||
    dt > flightLimits.maxGap ||
    !Number.isFinite(input.trigger) ||
    input.trigger < 0 ||
    input.trigger > 1 ||
    !input.direction.every(Number.isFinite) ||
    length < 0.0001 ||
    !state.position.every(Number.isFinite) ||
    !state.velocity.every(Number.isFinite)
  )
    return {
      ...initialFlight(state.position.every(Number.isFinite) ? state.position : zero),
      mode: 'stopped'
    }
  if (input.brake) return brakeFlight(state)
  const released = state.released || input.trigger <= flightLimits.deadZone
  const mode = input.arm ? 'armed' : state.mode
  if (mode !== 'armed') return { ...state, velocity: zero, released, mode }
  // An explicit arm with a held trigger cannot inherit an earlier release.
  const ready = input.arm ? input.trigger <= flightLimits.deadZone : released
  const thrust = ready
    ? Math.pow(
        Math.max(0, (input.trigger - flightLimits.deadZone) / (1 - flightLimits.deadZone)),
        1.5
      )
    : 0
  let velocity = [...state.velocity]
  let position = [...state.position]
  const steps = Math.max(1, Math.ceil(dt * 240))
  const h = dt / steps
  const decay = Math.exp(-flightLimits.drag * h)
  const gain = (1 - decay) / flightLimits.drag
  for (let step = 0; step < steps; step++) {
    const acceleration = input.direction.map(
      (v) => (v / length) * thrust * flightLimits.acceleration
    )
    const next = velocity.map((v, i) => v * decay + acceleration[i] * gain)
    const scale = Math.min(1, flightLimits.speed / (Math.hypot(...next) || 1))
    position = position.map((p, i) => p + ((velocity[i] + next[i] * scale) * h) / 2)
    velocity = next.map((v) => v * scale)
  }
  return {
    mode,
    position: position as unknown as Vec3,
    velocity: velocity as unknown as Vec3,
    released: ready
  }
}

export type TravelState = { revision: string; position: Vec3; trail: Vec3[] }
export const travelTo = (state: TravelState, destination: Vec3): TravelState => {
  if (!destination.every(Number.isFinite)) throw new Error('Destination is unavailable.')
  return { ...state, position: destination, trail: [...state.trail.slice(-19), state.position] }
}
export const travelBack = (state: TravelState): TravelState => ({
  ...state,
  position: state.trail.at(-1) ?? state.position,
  trail: state.trail.slice(0, -1)
})
