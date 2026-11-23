import { describe, it, expect } from 'vitest'
import { SimEngine } from '../simulation/engine'
import { LOCATIONS } from '../simulation/map'

const drive = (e: SimEngine, minutes: number) => {
  const acc = { v: 0 }
  for (let i = 0; i < minutes; i++) e.step(1, acc)
}

// Two agents at the park entrance, A the potential partner and B the
// arriver; every other agent is parked Idle at home so nobody else can
// pair with B during the probe step.
const stagePair = (e: SimEngine, paused: boolean) => {
  const park = LOCATIONS.find(l => l.id === 'park')!
  const a = e.agents[0]
  const b = e.agents[1]
  a.pos = { ...park.entrance }
  a.state = 'Socializing'
  a.goal = 'Socialize'
  a.activity = 'Socializing'
  a.activityUntil = e.simMinutes + 40
  a.cooldownUntil = 0
  a.path = []
  a.dest = { ...park.entrance }
  a.paused = paused
  ;(a as any)._target = { loc: park, state: 'Socializing', activity: 'Socializing', durationMin: 40 }
  b.pos = { x: 10, y: 7 }
  b.state = 'Walking'
  b.goal = 'Socialize'
  b.activity = 'Walking to Central Park'
  b.activityUntil = e.simMinutes + 40
  b.cooldownUntil = 0
  b.path = [{ x: 10, y: 8 }]
  b.dest = { ...park.entrance }
  ;(b as any)._target = { loc: park, state: 'Socializing', activity: 'Socializing', durationMin: 40 }
  for (const o of e.agents.slice(2)) {
    o.pos = { x: 6, y: 12 }
    o.state = 'Idle'
    o.path = []
    o.dest = null
    o.activityUntil = 0
    o.cooldownUntil = 0
    ;(o as any)._target = undefined
  }
  return { a, b }
}

describe('a paused agent is never paired into a conversation', () => {
  it('an arriving agent does not pair with a paused agent at the same entrance', () => {
    const e = new SimEngine(42)
    drive(e, 5)
    // A: Socializing at the park entrance, paused by the user from the
    // inspector. Pausing is meant to freeze the agent, but arrive()
    // used to pair it anyway: its state flipped to Conversing while
    // paused, the interactions count rose, and it stayed Conversing
    // with a stale conv entry until the user resumed it — while its
    // partner's conversation had already ended after 10 minutes.
    const { a, b } = stagePair(e, true)
    const interactionsBefore = e.interactions
    const acc = { v: 0 }
    e.step(1, acc)
    // B arrives and socializes alone; A stays frozen as Socializing.
    expect(b.state).toBe('Socializing')
    expect(a.state).toBe('Socializing')
    expect(a.paused).toBe(true)
    expect(e.interactions).toBe(interactionsBefore)
  })

  it('an unpaused agent at the same entrance still pairs normally', () => {
    const e = new SimEngine(42)
    drive(e, 5)
    const { a, b } = stagePair(e, false)
    const interactionsBefore = e.interactions
    const acc = { v: 0 }
    e.step(1, acc)
    expect(b.state).toBe('Conversing')
    expect(a.state).toBe('Conversing')
    expect(e.interactions).toBe(interactionsBefore + 1)
  })
})
