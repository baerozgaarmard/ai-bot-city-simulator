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
    // entrance (10,8) is still a valid destination.
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
})
