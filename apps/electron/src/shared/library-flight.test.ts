import type { FlightInput, FlightState } from './library-flight'
import { describe, expect, it } from 'vitest'
import {
  brakeFlight,
  flightLimits,
  initialFlight,
  stepFlight,
  travelBack,
  travelTo
} from './library-flight'
const input: FlightInput = {
  tracked: true,
  visible: true,
  trigger: 0,
  direction: [0, 0, -1],
  arm: true
}
const armed = () => stepFlight(initialFlight(), input, 0)
const run = (hz: number, trigger = 1) => {
  let state = armed()
  for (let i = 0; i < hz * 5; i++)
    state = stepFlight(state, { ...input, arm: false, trigger }, 1 / hz)
  return state
}
describe('controller flight', () => {
  it('integrates equivalent elapsed time across frame rates', () => {
    const reference = run(120)
    for (const hz of [30, 60, 90, 144]) {
      const actual = run(hz)
      expect(actual.position[2]).toBeCloseTo(reference.position[2], 3)
      expect(actual.velocity[2]).toBeCloseTo(reference.velocity[2], 3)
    }
  })
  it('requires explicit arming and a released trigger, never resumes on tracking return', () => {
    let state = stepFlight(initialFlight(), { ...input, trigger: 1 }, 0.016)
    expect(state.position).toEqual([0, 0, 0])
    state = stepFlight(state, { ...input, arm: false, trigger: 0 }, 0.016)
    state = stepFlight(state, { ...input, arm: false, trigger: 1 }, 0.016)
    expect(state.position[2]).toBeLessThan(0)
    state = stepFlight(state, { ...input, tracked: false }, 0.016)
    for (const trigger of [1, 0, 1])
      state = stepFlight(state, { ...input, arm: false, trigger }, 0.016)
    expect(state.mode).toBe('stopped')
    expect(state.velocity).toEqual([0, 0, 0])
  })
  it('scales acceleration with pressure, applies release drag and caps speed', () => {
    expect(Math.abs(run(90, 0.5).velocity[2])).toBeLessThan(Math.abs(run(90).velocity[2]))
    let state = { ...armed(), velocity: [0, 0, -20] } as FlightState
    state = stepFlight(state, { ...input, arm: false, trigger: 1 }, 0.016)
    expect(Math.hypot(...state.velocity)).toBeLessThanOrEqual(flightLimits.speed)
    const next = stepFlight(state, { ...input, arm: false }, 0.016)
    expect(Math.hypot(...next.velocity)).toBeLessThan(Math.hypot(...state.velocity))
  })
  it.each([
    { visible: false },
    { tracked: false },
    { trigger: NaN },
    { direction: [Infinity, 0, 0] as const },
    { direction: [0, 0, 0] as const }
  ])('immediately stops invalid input %j', (patch) => {
    const result = stepFlight(run(90), { ...input, arm: false, ...patch }, 0.016)
    expect(result.mode).toBe('stopped')
    expect(result.velocity).toEqual([0, 0, 0])
  })
  it.each([NaN, Infinity, -1, 0.2, 60])('stops after invalid or suspended time %s', (dt) => {
    const state = run(60)
    const next = stepFlight(state, input, dt)
    expect(next.position).toEqual(state.position)
    expect(next.mode).toBe('stopped')
    expect(next.velocity).toEqual([0, 0, 0])
  })
  it('brakes without changing the viewpoint and does not take a head pose', () => {
    const state = run(60)
    expect(brakeFlight(state)).toEqual({
      ...state,
      mode: 'inspect',
      released: false,
      velocity: [0, 0, 0]
    })
    expect(stepFlight(state, { ...input, trigger: 1, brake: true }, 0.016)).toEqual(
      brakeFlight(state)
    )
  })
  it('keeps explicit travel reversible with a bounded trail', () => {
    const state = { revision: 'r1', position: [0, 0, 0] as const, trail: [] }
    expect(travelBack(travelTo(state, [1, 2, 3])).position).toEqual(state.position)
    expect(() => travelTo(state, [NaN, 0, 0])).toThrow()
  })
})
