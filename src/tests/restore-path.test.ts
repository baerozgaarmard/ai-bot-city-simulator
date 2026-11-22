import { describe, it, expect } from 'vitest'
import { SimEngine } from '../simulation/engine'
import { walkableGrid, GRID_W, GRID_H } from '../simulation/map'

const drive = (e: SimEngine, minutes: number) => {
  const acc = { v: 0 }
  for (let i = 0; i < minutes; i++) e.step(1, acc)
}
const onBadTile = (e: SimEngine) => {
  const grid = walkableGrid()
  return e.agents.some(a => {
    const rx = Math.round(a.pos.x), ry = Math.round(a.pos.y)
    return rx >= 0 && rx < GRID_W && ry >= 0 && ry < GRID_H && !grid[ry][rx]
  })
}

describe('restore() repairs a stale saved path', () => {
  it('a path through a building tile is not followed after load', () => {
    const e = new SimEngine(42)
    drive(e, 30)
    const snap = e.snapshot()
    // Residential tiles (3..5, 11..12) are non-walkable; (4,11) is one.
    expect(walkableGrid()[11][4]).toBe(false)
    const alice = snap.agents[0]
    alice.pos = { x: 6, y: 12 }
    alice.path = [{ x: 5, y: 12 }, { x: 4, y: 11 }, { x: 3, y: 11 }]
    alice.state = 'Walking'
    alice.dest = { x: 3, y: 11 }
    const e2 = new SimEngine(99)
    e2.restore(snap)
    const acc = { v: 0 }
    for (let i = 0; i < 120; i++) e2.step(1, acc)
    expect(onBadTile(e2)).toBe(false)
    expect(e2.agents[0].state).not.toBe('Walking')
  })

  it('a path with an out-of-bounds waypoint does not walk the agent off the grid', () => {
    const e = new SimEngine(42)
    drive(e, 30)
    const snap = e.snapshot()
    const alice = snap.agents[0]
    alice.pos = { x: 6, y: 12 }
    alice.path = [{ x: 6, y: 13 }, { x: 6, y: 25 }, { x: 6, y: 40 }]
    alice.state = 'Walking'
    alice.dest = { x: 6, y: 40 }
    const e2 = new SimEngine(99)
    e2.restore(snap)
    const a = e2.agents[0]
    const acc = { v: 0 }
    for (let i = 0; i < 120; i++) {
      e2.step(1, acc)
      expect(a.pos.x).toBeGreaterThanOrEqual(0)
      expect(a.pos.x).toBeLessThan(GRID_W)
      expect(a.pos.y).toBeGreaterThanOrEqual(0)
      expect(a.pos.y).toBeLessThan(GRID_H)
    }
    expect(a.state).not.toBe('Walking')
  })

  it('a stale path to a still-valid destination is re-routed, not dropped', () => {
    const e = new SimEngine(42)
    drive(e, 30)
    const snap = e.snapshot()
    const alice = snap.agents[0]
    alice.pos = { x: 6, y: 12 }
    // Stale route cuts through the residential building; the park
    // entrance (10,8) is still a valid destination. The activity target
    // agrees with the destination, as it always does in live operation
    // — a leftover target from the snapshot would disagree with dest
    // and legitimately win the re-route instead.
    ;(alice as any)._target = { loc: { id: 'park', name: 'Central Park', entrance: { x: 10, y: 8 } }, state: 'Socializing', activity: 'Socializing', durationMin: 40 }
    alice.activityUntil = e.simMinutes + 40
    alice.path = [{ x: 5, y: 12 }, { x: 4, y: 11 }, { x: 10, y: 8 }]
    alice.state = 'Walking'
    alice.dest = { x: 10, y: 8 }
    const e2 = new SimEngine(99)
    e2.restore(snap)
    const a = e2.agents[0]
    // Re-routed on the current grid: every waypoint walkable.
    expect(a.path.length).toBeGreaterThan(0)
    const grid = walkableGrid()
    for (const p of a.path) expect(grid[p.y][p.x]).toBe(true)
    const acc = { v: 0 }
    for (let i = 0; i < 300 && (a.path.length || a.state === 'Walking'); i++) e2.step(1, acc)
    expect(onBadTile(e2)).toBe(false)
    expect(Math.round(a.pos.x)).toBe(10)
    expect(Math.round(a.pos.y)).toBe(8)
  })

  it('a valid saved path is kept as-is', () => {
    const e = new SimEngine(42)
    let snap: ReturnType<SimEngine['snapshot']> | null = null
    let walking: ReturnType<SimEngine['snapshot']>['agents'][number] | null = null
    for (let m = 0; m < 600 && !walking; m++) {
      drive(e, 1)
      const s = e.snapshot()
      walking = s.agents.find((a: any) => a.state === 'Walking' && a.path.length > 1) ?? null
      if (walking) snap = s
    }
    expect(walking).not.toBeNull()
    const pathBefore = JSON.stringify(walking!.path)
    const e2 = new SimEngine(99)
    e2.restore(snap)
    const restored = e2.agents.find(a => a.id === walking!.id)!
    expect(JSON.stringify(restored.path)).toBe(pathBefore)
  })

  it('a path on a non-Walking agent is dropped instead of walked after load', () => {
    const e = new SimEngine(42)
    drive(e, 30)
    const snap = e.snapshot()
    const alice = snap.agents[0]
    // A valid route on a Working agent: live operation only ever sets
    // a path together with the Walking state, but a hand-edited save
    // can hold one — and the stale-path repair above only drops a
    // route when it is stale or has no destination, so a valid one
    // survived and the movement loop walked the agent across town
    // while its state still said "Working".
    alice.pos = { x: 14, y: 5 }
    alice.state = 'Working'
    alice.goal = 'Work'
    alice.activity = 'Working at Office Building'
    alice.activityUntil = e.simMinutes + 60
    alice.dest = { x: 10, y: 8 }
    alice.path = [{ x: 13, y: 5 }, { x: 12, y: 5 }, { x: 11, y: 5 }, { x: 10, y: 5 }, { x: 10, y: 6 }, { x: 10, y: 7 }, { x: 10, y: 8 }]
    ;(alice as any)._target = { loc: { id: 'office', name: 'Office Building', entrance: { x: 14, y: 5 } }, state: 'Working', activity: 'Working at Office Building', durationMin: 90 }
    const e2 = new SimEngine(99)
    e2.restore(snap)
    const a = e2.agents[0]
    expect(a.path.length).toBe(0)
    drive(e2, 5)
    // Still working where it works, not walking to the park.
    expect(a.state).toBe('Working')
    expect(Math.round(a.pos.x)).toBe(14)
    expect(Math.round(a.pos.y)).toBe(5)
  })

  it('a path on an Idle agent is dropped with its destination on load', () => {
    const e = new SimEngine(42)
    drive(e, 30)
    const snap = e.snapshot()
    const alice = snap.agents[0]
    alice.state = 'Idle'
    alice.activity = 'Deciding what to do next'
    alice.activityUntil = 0
    alice.cooldownUntil = 0
    alice.goal = 'Settle in'
    alice.intention = 'Find a routine'
    ;(alice as any)._target = undefined
    alice.path = [{ x: 10, y: 7 }, { x: 10, y: 8 }]
    alice.dest = { x: 10, y: 8 }
    const e2 = new SimEngine(99)
    e2.restore(snap)
    const a = e2.agents[0]
    // The stray path is dropped, and an Idle agent never carries a
    // destination (complete() and the conversation release both clear
    // it), so the restored agent shows none until it picks a goal.
    expect(a.path.length).toBe(0)
    expect(a.dest).toBeNull()
    drive(e2, 5)
    expect(a.path.length).toBe(0)
    // It picks a fresh goal instead of standing still.
    expect(a.state).not.toBe('Idle')
  })

  it('a Walking agent with no path at all is not left frozen mid-walk', () => {
    const e = new SimEngine(42)
    drive(e, 30)
    const snap = e.snapshot()
    const alice = snap.agents[0]
    alice.pos = { x: 10, y: 7 }
    alice.path = []
    alice.state = 'Walking'
    alice.goal = 'Work'
    alice.dest = { x: 14, y: 5 }
    ;(alice as any)._target = { loc: { id: 'office', name: 'Office Building', entrance: { x: 14, y: 5 } }, state: 'Working', activity: 'Working at Office Building', durationMin: 90 }
    alice.activityUntil = e.simMinutes + 60
    const e2 = new SimEngine(99)
    e2.restore(snap)
    const a = e2.agents[0]
    // The walk is abandoned on load: the agent is Idle at its position
    // and picks a fresh goal, instead of standing frozen "Walking" until
    // the window passes and then completing a goal it never arrived at.
    expect(a.state).toBe('Idle')
    expect(a.activityUntil).toBe(0)
    expect((a as any)._target).toBeUndefined()
    drive(e2, 120)
    // No phantom completion for a workplace the agent never reached.
    expect(a.recentActions).not.toContain('Work at town')
    // And the agent actually did things instead of standing still.
    expect(a.recentActions.length).toBeGreaterThan(0)
  })

  it('a valid path that ends away from its destination is re-routed, not walked to the wrong place', () => {
    const e = new SimEngine(42)
    drive(e, 30)
    const snap = e.snapshot()
    const alice = snap.agents[0]
    // A valid walkable route from the residential entrance to the PARK
    // entrance, on an agent whose destination and activity target say
    // the OFFICE. The waypoint check used to pass this: every tile is
    // walkable, so the agent walked to the park, arrive() fired with
    // the office target, and it "worked" at the park for 90 minutes,
    // logging a phantom "completed work" at Central Park. A live route
    // is built by A* to the destination entrance, so it always ends at
    // dest — a route ending elsewhere is stale by definition.
    alice.pos = { x: 6, y: 12 }
    alice.state = 'Walking'
    alice.goal = 'Work'
    alice.activity = 'Walking to Office Building'
    alice.dest = { x: 14, y: 5 }
    alice.path = [{ x: 6, y: 11 }, { x: 6, y: 10 }, { x: 6, y: 9 }, { x: 6, y: 8 }, { x: 6, y: 7 }, { x: 7, y: 7 }, { x: 8, y: 7 }, { x: 9, y: 7 }, { x: 10, y: 7 }, { x: 10, y: 8 }]
    ;(alice as any)._target = { loc: { id: 'office', name: 'Office Building', entrance: { x: 14, y: 5 } }, state: 'Working', activity: 'Working at Office Building', durationMin: 90 }
    alice.activityUntil = e.simMinutes + 90
    const e2 = new SimEngine(99)
    e2.restore(snap)
    const a = e2.agents[0]
    // Re-routed to the office on load, not walked to the park.
    expect(a.path.length).toBeGreaterThan(0)
    const last = a.path[a.path.length - 1]
    expect(last).toEqual({ x: 14, y: 5 })
    drive(e2, 120)
    // Works at the office, never at the park.
    expect(a.recentActions).not.toContain('Work at Central Park')
    expect(a.recentActions).toContain('Work at Office Building')
  })

  it('a Walking agent with a valid path but no destination is re-routed to its activity target', () => {
    const e = new SimEngine(42)
    drive(e, 30)
    const snap = e.snapshot()
    const alice = snap.agents[0]
    // Same valid route to the park, but dest is null: there is no
    // destination to check the route against, so the old repair kept
    // it — the agent walked to the park and "arrived" at the office
    // target while standing there. The activity target's entrance is
    // the destination when dest is missing, so the route is re-routed
    // to it the same way a stale route is.
    alice.pos = { x: 6, y: 12 }
    alice.state = 'Walking'
    alice.goal = 'Work'
    alice.activity = 'Walking to Office Building'
    alice.dest = null
    alice.path = [{ x: 6, y: 11 }, { x: 6, y: 10 }, { x: 6, y: 9 }, { x: 6, y: 8 }, { x: 6, y: 7 }, { x: 7, y: 7 }, { x: 8, y: 7 }, { x: 9, y: 7 }, { x: 10, y: 7 }, { x: 10, y: 8 }]
    ;(alice as any)._target = { loc: { id: 'office', name: 'Office Building', entrance: { x: 14, y: 5 } }, state: 'Working', activity: 'Working at Office Building', durationMin: 90 }
    alice.activityUntil = e.simMinutes + 90
    const e2 = new SimEngine(99)
    e2.restore(snap)
    const a = e2.agents[0]
    expect(a.path.length).toBeGreaterThan(0)
    const last = a.path[a.path.length - 1]
    expect(last).toEqual({ x: 14, y: 5 })
    expect(a.dest).toEqual({ x: 14, y: 5 })
    drive(e2, 120)
    expect(a.recentActions).not.toContain('Work at Central Park')
    expect(Math.round(a.pos.x)).toBe(14)
    expect(Math.round(a.pos.y)).toBe(5)
  })

  it('a _target whose location entrance was edited is repaired from the real location', () => {
    const e = new SimEngine(42)
    drive(e, 30)
    const snap = e.snapshot()
    const alice = snap.agents[0]
    // A valid route to the office, dest the office — but the target's
    // location entrance was hand-edited to the park. The path repair
    // used to trust that entrance and re-route the agent to it, so it
    // "worked" at Central Park. The location object in a save is just
    // a copy: the canonical entrance comes from the location id.
    alice.pos = { x: 6, y: 12 }
    alice.state = 'Walking'
    alice.goal = 'Work'
    alice.activity = 'Walking to Office Building'
    alice.dest = { x: 14, y: 5 }
    alice.path = [{ x: 6, y: 11 }, { x: 6, y: 10 }, { x: 6, y: 9 }, { x: 6, y: 8 }, { x: 6, y: 7 }, { x: 7, y: 7 }, { x: 8, y: 7 }, { x: 9, y: 7 }, { x: 10, y: 7 }, { x: 10, y: 6 }, { x: 10, y: 5 }, { x: 11, y: 5 }, { x: 12, y: 5 }, { x: 13, y: 5 }, { x: 14, y: 5 }]
    ;(alice as any)._target = { loc: { id: 'office', name: 'Office Building', entrance: { x: 10, y: 8 } }, state: 'Working', activity: 'Working at Office Building', durationMin: 90 }
    alice.activityUntil = e.simMinutes + 90
    const e2 = new SimEngine(99)
    e2.restore(snap)
    const a = e2.agents[0]
    expect((a as any)._target.loc.entrance).toEqual({ x: 14, y: 5 })
    drive(e2, 120)
    expect(a.recentActions).not.toContain('Work at Central Park')
    expect(a.recentActions).toContain('Work at Office Building')
  })

  it('a _target with a bogus state is dropped instead of putting the agent in it', () => {
    const e = new SimEngine(42)
    drive(e, 30)
    const snap = e.snapshot()
    const alice = snap.agents[0]
    // The target's state used to be checked only as a string, so
    // 'Dancing' passed and arrive() set the agent to it — a state
    // outside AGENT_STATES that the exhaustion interrupt never covers,
    // the same failure the top-level state check guards against.
    alice.pos = { x: 6, y: 12 }
    alice.state = 'Walking'
    alice.goal = 'Work'
    alice.activity = 'Walking to Office Building'
    alice.dest = { x: 14, y: 5 }
    alice.path = [{ x: 6, y: 11 }, { x: 6, y: 10 }, { x: 6, y: 9 }, { x: 6, y: 8 }, { x: 6, y: 7 }, { x: 7, y: 7 }, { x: 8, y: 7 }, { x: 9, y: 7 }, { x: 10, y: 7 }, { x: 10, y: 6 }, { x: 10, y: 5 }, { x: 11, y: 5 }, { x: 12, y: 5 }, { x: 13, y: 5 }, { x: 14, y: 5 }]
    ;(alice as any)._target = { loc: { id: 'office', name: 'Office Building', entrance: { x: 14, y: 5 } }, state: 'Dancing', activity: 'Working at Office Building', durationMin: 90 }
    alice.activityUntil = e.simMinutes + 90
    const e2 = new SimEngine(99)
    e2.restore(snap)
    const a = e2.agents[0]
    expect((a as any)._target).toBeUndefined()
    const seen = new Set<string>()
    const acc = { v: 0 }
    for (let i = 0; i < 120; i++) { e2.step(1, acc); seen.add(a.state) }
    expect(seen.has('Dancing')).toBe(false)
  })

  it('a _target naming a location that does not exist is dropped', () => {
    const e = new SimEngine(42)
    drive(e, 30)
    const snap = e.snapshot()
    const alice = snap.agents[0]
    alice.pos = { x: 6, y: 12 }
    alice.state = 'Walking'
    alice.goal = 'Work'
    alice.activity = 'Walking to Office Building'
    alice.dest = { x: 14, y: 5 }
    alice.path = [{ x: 6, y: 11 }, { x: 6, y: 10 }, { x: 6, y: 9 }, { x: 6, y: 8 }, { x: 6, y: 7 }, { x: 7, y: 7 }, { x: 8, y: 7 }, { x: 9, y: 7 }, { x: 10, y: 7 }, { x: 10, y: 6 }, { x: 10, y: 5 }, { x: 11, y: 5 }, { x: 12, y: 5 }, { x: 13, y: 5 }, { x: 14, y: 5 }]
    ;(alice as any)._target = { loc: { id: 'mall', name: 'Mega Mall', entrance: { x: 14, y: 5 } }, state: 'Working', activity: 'Working at Mega Mall', durationMin: 90 }
    alice.activityUntil = e.simMinutes + 90
    const e2 = new SimEngine(99)
    e2.restore(snap)
    const a = e2.agents[0]
    expect((a as any)._target).toBeUndefined()
    // The walk to the destination still stands: on arrival with no
    // target the agent goes Idle and picks a fresh goal.
    expect(a.path.length).toBeGreaterThan(0)
    drive(e2, 120)
    expect(a.recentActions).not.toContain('Work at Mega Mall')
  })
})
